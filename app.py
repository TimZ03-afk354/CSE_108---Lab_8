
"""ACME University enrollment server (Flask + SQLAlchemy + Flask-Admin).

Run: python app.py -> http://127.0.0.1:5000
It serves the front end (./frontend), the JSON API (/api/...) and the admin
page (/admin/) from one origin, so no CORS setup is needed.
"""

import hmac
import math
import os
import secrets
import time
from functools import wraps
from pathlib import Path

from admin import setup_admin

from flask import Flask, jsonify, redirect, request, session
from flask_admin import Admin, AdminIndexView
from flask_admin.contrib.sqla import ModelView
from flask_admin.form import SecureForm
from flask_admin.menu import MenuLink
from flask_sqlalchemy import SQLAlchemy
from sqlalchemy import CheckConstraint, UniqueConstraint, event, func, select
from sqlalchemy.engine import Engine
from sqlalchemy.exc import IntegrityError
from werkzeug.exceptions import HTTPException
from werkzeug.security import check_password_hash, generate_password_hash


BASE_DIR = Path(__file__).resolve().parent
INSTANCE_DIR = BASE_DIR / "instance"
INSTANCE_DIR.mkdir(exist_ok=True)


def load_secret_key():
    """SECRET_KEY env var, else a random key saved once in instance/secret_key."""
    if os.environ.get("SECRET_KEY"):
        return os.environ["SECRET_KEY"]

    path = INSTANCE_DIR / "secret_key"
    if not path.exists():
        path.write_text(secrets.token_hex(32))
        path.chmod(0o600)

    return path.read_text().strip()


app = Flask(
    __name__,
    static_folder=str(BASE_DIR / "frontend"),
    static_url_path=""
)

app.config.update(
    SECRET_KEY=load_secret_key(),
    SQLALCHEMY_DATABASE_URI=os.environ.get(
        "DATABASE_URL",
        f"sqlite:///{INSTANCE_DIR / 'enrollment.db'}"
    ),
    SESSION_COOKIE_HTTPONLY=True,
    SESSION_COOKIE_SAMESITE="Lax",
    SESSION_COOKIE_SECURE=os.environ.get("COOKIE_SECURE") == "1",
    MAX_CONTENT_LENGTH=64 * 1024,
)

db = SQLAlchemy(app)


@event.listens_for(Engine, "connect")
def sqlite_foreign_keys(dbapi_connection, _record):
    if dbapi_connection.__class__.__module__.startswith("sqlite3"):
        dbapi_connection.execute("PRAGMA foreign_keys=ON")


#  models

class User(db.Model):
    __tablename__ = "users"

    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(100), unique=True, nullable=False)
    name = db.Column(db.String(150), nullable=False)
    role = db.Column(db.String(10), nullable=False)
    password_hash = db.Column(db.String(255), nullable=False)

    enrollments = db.relationship(
        "Enrollment",
        back_populates="student",
        cascade="all, delete-orphan"
    )

    __table_args__ = (
        CheckConstraint(
            "role IN ('student','teacher','admin')",
            name="ck_users_role"
        ),
    )

    def __str__(self):
        return f"{self.name} ({self.username})"


class Course(db.Model):
    __tablename__ = "courses"

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False)
    teacher_id = db.Column(
        db.Integer,
        db.ForeignKey("users.id"),
        nullable=False
    )
    time = db.Column(db.String(60), nullable=False)
    capacity = db.Column(db.Integer, nullable=False)

    teacher = db.relationship("User")

    enrollments = db.relationship(
        "Enrollment",
        back_populates="course",
        cascade="all, delete-orphan"
    )

    __table_args__ = (
        CheckConstraint(
            "capacity >= 1",
            name="ck_courses_capacity"
        ),
    )

    def __str__(self):
        return self.name


class Enrollment(db.Model):
    __tablename__ = "enrollments"

    id = db.Column(db.Integer, primary_key=True)
    course_id = db.Column(
        db.Integer,
        db.ForeignKey("courses.id"),
        nullable=False
    )
    student_id = db.Column(
        db.Integer,
        db.ForeignKey("users.id"),
        nullable=False
    )
    grade = db.Column(db.Float, nullable=True)

    course = db.relationship(
        "Course",
        back_populates="enrollments"
    )
    student = db.relationship(
        "User",
        back_populates="enrollments"
    )

    __table_args__ = (
        UniqueConstraint(
            "course_id",
            "student_id",
            name="uq_enrollment"
        ),
        CheckConstraint(
            "grade IS NULL OR (grade >= 0 AND grade <= 100)",
            name="ck_grade"
        ),
    )


#  errors

class ApiError(Exception):
    def __init__(self, status, code, message):
        self.status = status
        self.code = code
        self.message = message


def error_response(status, code, message):
    return jsonify({
        "error": {
            "code": code,
            "message": message
        }
    }), status


@app.errorhandler(ApiError)
def handle_api_error(e):
    return error_response(e.status, e.code, e.message)


@app.errorhandler(HTTPException)
def handle_http_error(e):
    if request.path.startswith("/api/"):
        return error_response(
            e.code,
            "HTTP_ERROR",
            e.description
        )
    return e


@app.errorhandler(Exception)
def handle_unexpected(e):
    app.logger.exception("Unhandled error")
    db.session.rollback()

    if request.path.startswith("/api/"):
        return error_response(
            500,
            "SERVER_ERROR",
            "Something went wrong on the server. Please try again."
        )

    raise e


@app.after_request
def security_headers(response):
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "same-origin"

    if request.path.startswith("/api/"):
        response.headers["Cache-Control"] = "no-store"

    if not request.path.startswith("/admin"):
        response.headers["Content-Security-Policy"] = (
            "default-src 'self'; frame-ancestors 'none'; base-uri 'none'"
        )

    return response


#  auth helpers

def user_json(user):
    return {
        "id": user.id,
        "name": user.name,
        "username": user.username,
        "role": user.role
    }


def require_login(role=None):
    """Decorator: needs a signed-in user and a CSRF token for writes."""

    def decorator(fn):
        @wraps(fn)
        def wrapper(*args, **kwargs):
            uid = session.get("uid")
            user = db.session.get(User, uid) if uid else None

            if user is None:
                session.clear()
                raise ApiError(
                    401,
                    "NOT_AUTHENTICATED",
                    "Your session has ended. Please sign in again."
                )

            if request.method not in ("GET", "HEAD", "OPTIONS"):
                sent = request.headers.get(
                    "X-CSRF-Token", ""
                ).encode()

                if not hmac.compare_digest(
                    sent,
                    session.get("csrf", "").encode()
                ):
                    raise ApiError(
                        403,
                        "CSRF_FAILED",
                        "Security check failed. Refresh the page and try again."
                    )

            if role and user.role != role:
                raise ApiError(
                    403,
                    "FORBIDDEN",
                    "You do not have permission to perform this action."
                )

            return fn(user, *args, **kwargs)

        return wrapper

    return decorator


def json_body():
    data = request.get_json(silent=True)

    if not isinstance(data, dict):
        raise ApiError(
            400,
            "INVALID_REQUEST",
            "The request body must be a JSON object."
        )

    return data


def parse_id(value):
    if isinstance(value, bool):
        return None

    if isinstance(value, int):
        return value

    if isinstance(value, str) and value.isdigit() and len(value) < 10:
        return int(value)

    return None


_DUMMY_HASH = generate_password_hash(secrets.token_hex(8))
_failures = {}

MAX_FAILURES = 5
WINDOW = 300


def throttled(key):
    now = time.time()
    recent = [
        t for t in _failures.get(key, [])
        if now - t < WINDOW
    ]

    _failures[key] = recent
    return len(recent) >= MAX_FAILURES


# auth routes

@app.post("/api/auth/login")
def login():
    data = json_body()

    username = data.get("username")
    password = data.get("password")

    if (
        not isinstance(username, str)
        or not isinstance(password, str)
        or not username.strip()
        or not password
    ):
        raise ApiError(
            422,
            "INVALID_REQUEST",
            "Enter a username and password."
        )

    username = username.strip().lower()
    key = (request.remote_addr, username)

    if throttled(key):
        raise ApiError(
            429,
            "TOO_MANY_ATTEMPTS",
            "Too many failed sign-in attempts. Please wait a few minutes."
        )

    user = User.query.filter_by(username=username).first()

    ok = check_password_hash(
        user.password_hash if user else _DUMMY_HASH,
        password
    )

    if not (user and ok):
        _failures.setdefault(key, []).append(time.time())

        raise ApiError(
            401,
            "INVALID_CREDENTIALS",
            "The username or password is incorrect."
        )

    _failures.pop(key, None)

    session.clear()
    session["uid"] = user.id
    session["csrf"] = secrets.token_urlsafe(32)

    return jsonify({
        "user": user_json(user),
        "csrf_token": session["csrf"]
    })


@app.get("/api/auth/me")
@require_login()
def me(user):
    return jsonify({
        "user": user_json(user),
        "csrf_token": session["csrf"]
    })


@app.post("/api/auth/logout")
@require_login()
def logout(user):
    session.clear()
    return "", 204


#  course helpers

def course_views(courses, user):
    ids = [c.id for c in courses]
    counts = {}
    mine = set()

    if ids:
        counts = dict(
            db.session.query(
                Enrollment.course_id,
                func.count(Enrollment.id)
            )
            .filter(Enrollment.course_id.in_(ids))
            .group_by(Enrollment.course_id)
            .all()
        )

        mine = {
            cid
            for (cid,) in db.session.query(Enrollment.course_id).filter(
                Enrollment.student_id == user.id,
                Enrollment.course_id.in_(ids)
            )
        }

    return [
        {
            "id": c.id,
            "name": c.name,
            "teacher_name": c.teacher.name,
            "time": c.time,
            "capacity": c.capacity,
            "enrollment_count": counts.get(c.id, 0),
            "is_enrolled": c.id in mine,
        }
        for c in courses
    ]


def get_course(course_id, lock=False):
    cid = parse_id(course_id)
    stmt = select(Course).where(Course.id == cid)

    if lock:
        stmt = stmt.with_for_update()

    course = (
        db.session.execute(stmt).scalar_one_or_none()
        if cid is not None else None
    )

    if course is None:
        raise ApiError(
            404,
            "COURSE_NOT_FOUND",
            "This course no longer exists."
        )

    return course


# student routes

@app.get("/api/courses")
@require_login("student")
def catalog(user):
    courses = Course.query.order_by(Course.id).all()

    return jsonify({
        "courses": course_views(courses, user)
    })


@app.get("/api/student/courses")
@require_login("student")
def student_courses(user):
    courses = (
        Course.query
        .join(Enrollment)
        .filter(Enrollment.student_id == user.id)
        .order_by(Course.id)
        .all()
    )

    return jsonify({
        "courses": course_views(courses, user)
    })


@app.post("/api/student/enrollments")
@require_login("student")
def enroll(user):
    course = get_course(
        json_body().get("course_id"),
        lock=True
    )

    if Enrollment.query.filter_by(
        course_id=course.id,
        student_id=user.id
    ).first():
        raise ApiError(
            409,
            "ALREADY_ENROLLED",
            "You are already enrolled in this course."
        )

    taken = Enrollment.query.filter_by(
        course_id=course.id
    ).count()

    if taken >= course.capacity:
        raise ApiError(
            409,
            "COURSE_FULL",
            "This course is full. Please choose another course."
        )

    db.session.add(
        Enrollment(
            course_id=course.id,
            student_id=user.id,
            grade=None
        )
    )

    try:
        db.session.commit()
    except IntegrityError:
        db.session.rollback()

        raise ApiError(
            409,
            "ALREADY_ENROLLED",
            "You are already enrolled in this course."
        )

    return jsonify({
        "course": course_views([course], user)[0]
    }), 201


@app.delete("/api/student/enrollments/<course_id>")
@require_login("student")
def drop(user, course_id):
    course = get_course(course_id)

    row = Enrollment.query.filter_by(
        course_id=course.id,
        student_id=user.id
    ).first()

    if row is None:
        raise ApiError(
            404,
            "ENROLLMENT_NOT_FOUND",
            "You are not enrolled in this course."
        )

    db.session.delete(row)
    db.session.commit()

    return "", 204


# teacher routes

def own_course(user, course_id):
    course = get_course(course_id)

    if course.teacher_id != user.id:
        raise ApiError(
            403,
            "FORBIDDEN",
            "This course is assigned to another teacher."
        )

    return course


def student_json(row):
    return {
        "student_id": row.student_id,
        "student_name": row.student.name,
        "grade": row.grade
    }


@app.get("/api/teacher/courses")
@require_login("teacher")
def teacher_courses(user):
    courses = (
        Course.query
        .filter_by(teacher_id=user.id)
        .order_by(Course.id)
        .all()
    )

    return jsonify({
        "courses": course_views(courses, user)
    })


@app.get("/api/teacher/courses/<course_id>/students")
@require_login("teacher")
def roster(user, course_id):
    course = own_course(user, course_id)

    rows = (
        Enrollment.query
        .filter_by(course_id=course.id)
        .join(User, Enrollment.student_id == User.id)
        .order_by(User.name)
        .all()
    )

    return jsonify({
        "course": course_views([course], user)[0],
        "students": [student_json(r) for r in rows]
    })


@app.patch("/api/teacher/courses/<course_id>/students/<student_id>/grade")
@require_login("teacher")
def update_grade(user, course_id, student_id):
    course = own_course(user, course_id)
    sid = parse_id(student_id)

    row = (
        Enrollment.query.filter_by(
            course_id=course.id,
            student_id=sid
        ).first()
        if sid is not None else None
    )

    if row is None:
        raise ApiError(
            404,
            "ENROLLMENT_NOT_FOUND",
            "This student is no longer enrolled in this course."
        )

    data = json_body()

    if "grade" not in data:
        raise ApiError(
            422,
            "INVALID_GRADE",
            "Enter a grade between 0 and 100, or leave it blank."
        )

    grade = data["grade"]

    if grade is not None and (
        isinstance(grade, bool)
        or not isinstance(grade, (int, float))
        or not math.isfinite(grade)
        or not 0 <= grade <= 100
    ):
        raise ApiError(
            422,
            "INVALID_GRADE",
            "Enter a grade between 0 and 100, or leave it blank."
        )

    row.grade = None if grade is None else float(grade)
    db.session.commit()

    return jsonify({
        "student": student_json(row)
    })


#  admin (Flask-Admin)

# Initialize the dashboard from admin.py
setup_admin(app, db, User, Course, Enrollment)


admin.add_link(MenuLink(name="Back to portal", url="/"))
admin.add_link(MenuLink(name="Sign out", url="/logout"))


@app.get("/logout")
def admin_logout():
    session.clear()
    return redirect("/")


@app.route("/")
def home():
    return app.send_static_file("index.html")


# seed data

SEED = {
    "users": [
        ("jose", "Jose Santos", "student"),
        ("betty", "Betty Brown", "student"),
        ("john", "John Stuart", "student"),
        ("li", "Li Cheng", "student"),
        ("nancy", "Nancy Little", "student"),
        ("mindy", "Mindy Norris", "student"),
        ("aditya", "Aditya Ranganath", "student"),
        ("yiwen", "Yi Wen Chen", "student"),
        ("rjenkins", "Ralph Jenkins", "teacher"),
        ("swalker", "Susan Walker", "teacher"),
        ("ahepworth", "Ammon Hepworth", "teacher"),
        ("admin", "Administrator", "admin"),
    ],

    "courses": [
        ("Math 101", "rjenkins", "MWF 10:00-10:50 AM", 8),
        ("Physics 121", "swalker", "TR 11:00-11:50 AM", 10),
        ("CS 106", "ahepworth", "MWF 2:00-2:50 PM", 10),
        ("CS 162", "ahepworth", "TR 3:00-3:50 PM", 4),
    ],

    "enrollments": [
        ("Math 101", "jose", 92),
        ("Math 101", "betty", 65),
        ("Math 101", "john", 86),
        ("Math 101", "li", 77),

        ("Physics 121", "nancy", 53),
        ("Physics 121", "li", 85),
        ("Physics 121", "mindy", 94),
        ("Physics 121", "john", 91),
        ("Physics 121", "betty", 88),

        ("CS 106", "aditya", 93),
        ("CS 106", "yiwen", 85),
        ("CS 106", "nancy", 57),
        ("CS 106", "mindy", 68),

        ("CS 162", "aditya", 99),
        ("CS 162", "nancy", 87),
        ("CS 162", "yiwen", 92),
        ("CS 162", "john", 67),
    ],
}


def seed_database():
    """Create tables and load example data if the database is empty."""

    db.create_all()

    if User.query.first():
        return False

    password = os.environ.get(
        "SEED_PASSWORD",
        "demo123"
    )

    users = {
        u: User(
            username=u,
            name=n,
            role=r,
            password_hash=generate_password_hash(password)
        )
        for u, n, r in SEED["users"]
    }

    db.session.add_all(users.values())

    courses = {
        n: Course(
            name=n,
            teacher=users[t],
            time=tm,
            capacity=cap
        )
        for n, t, tm, cap in SEED["courses"]
    }

    db.session.add_all(courses.values())

    db.session.add_all(
        Enrollment(
            course=courses[c],
            student=users[s],
            grade=g
        )
        for c, s, g in SEED["enrollments"]
    )

    db.session.commit()

    return True


with app.app_context():
    seed_database()


@app.cli.command("reset-db")
def reset_db():
    """Drop every table and reload the example data."""

    db.drop_all()
    seed_database()

    print("Database reset.")


# run server

if __name__ == "__main__":
    app.run(
        host="127.0.0.1",
        port=5000,
        debug=os.environ.get("FLASK_DEBUG") == "1"
    )
