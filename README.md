# CSE 108 – Lab 8: Student Enrollment Web App (ACME University)

- **Front end:** vanilla JS (`frontend/`)
- **Server:** Flask + Flask-SQLAlchemy (`app.py`), session cookie login with CSRF tokens
- **Database:** SQL via SQLAlchemy – SQLite by default, MySQL/Postgres via `DATABASE_URL`
- **Admin:** Flask-Admin at `/admin/` (`admin.py`, admin role only) – create, read, update and delete users, courses and enrollments

## Run

```bash
python3 -m venv .venv
source .venv/bin/activate        
pip install -r requirements.txt
python app.py                    # http://127.0.0.1:5000
```

The first start creates `instance/enrollment.db` and loads the example data.
Flask serves the front end and the API from the same origin, so there is nothing else to configure.
To reset the data, stop the server, delete the `instance/` folder and start again.

## Test accounts (password for all: `demo123`)

| Role    | Username |
|---------|----------|
| Student | `mindy` (also jose, betty, john, li, nancy, aditya, yiwen) |
| Teacher | `ahepworth` (also rjenkins, swalker) |
| Admin   | `admin` |

## Features

**Student:** sign in/out, see own classes, see all classes with enrolled/capacity,
enroll (blocked when full or already enrolled), drop a class.

**Teacher:** sign in/out, see own classes, see each class's students and grades,
edit a grade (0–100, blank = not graded). Teachers cannot see or edit other teachers' classes.

**Admin:** "Open admin page" opens Flask-Admin, with links to go back to the portal or sign out.

## Project structure

```
app.py            Flask app: models, login, API routes, seed data
admin.py          Flask-Admin setup (users, courses, enrollments)
requirements.txt  Python dependencies
frontend/         index.html, app.js, api.js, config.js, style.css
```

## API (matches `frontend/config.js` and `api.js`)

| Method | Path | Who |
|--------|------|-----|
| POST | `/api/auth/login` | anyone |
| GET | `/api/auth/me` | signed in |
| POST | `/api/auth/logout` | signed in |
| GET | `/api/courses` | student |
| GET | `/api/student/courses` | student |
| POST | `/api/student/enrollments` | student |
| DELETE | `/api/student/enrollments/<course_id>` | student |
| GET | `/api/teacher/courses` | teacher |
| GET | `/api/teacher/courses/<id>/students` | teacher (own course) |
| PATCH | `/api/teacher/courses/<id>/students/<student_id>/grade` | teacher (own course) |


## Security notes

- Passwords are hashed; roles are checked on the server for every route.
- Sessions use HttpOnly, SameSite=Lax cookies.
- Login is limited to 5 failed attempts per 5 minutes per IP and username.
- Course capacity is checked when enrolling, and the database enforces one enrollment
  per student per course and grades between 0 and 100.
- Before any real deployment: set `SECRET_KEY` and `SEED_PASSWORD`, set `COOKIE_SECURE=1`
  behind HTTPS, and run behind a real WSGI server.
