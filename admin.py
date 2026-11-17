
from flask import redirect, session
from flask_admin import Admin, AdminIndexView
from flask_admin.contrib.sqla import ModelView
from wtforms import PasswordField, FloatField, ValidationError
from wtforms.validators import Optional, NumberRange
from werkzeug.security import generate_password_hash


# Set up the admin dashboard
def setup_admin(app, db, User, Course, Enrollment):

    # Check if the current user is an administrator
    def is_admin():
        uid = session.get("uid")
        user = db.session.get(User, uid) if uid else None
        return bool(user and user.role == "admin")

    # Protect the admin homepage
    class AdminHome(AdminIndexView):
        def is_accessible(self):
            return is_admin()

        def inaccessible_callback(self, name, **kwargs):
            return redirect("/")

    # Protect all admin management pages
    class AdminView(ModelView):
        def is_accessible(self):
            return is_admin()

        def inaccessible_callback(self, name, **kwargs):
            return redirect("/")

    # Manage users
    class UserAdmin(AdminView):
        column_list = ("username", "name", "role")
        column_searchable_list = ("username", "name")
        form_columns = ("username", "name", "role", "password")

        form_extra_fields = {
            "password": PasswordField(
                "Password (leave blank to keep current)"
            )
        }

        form_choices = {
            "role": [
                ("student", "student"),
                ("teacher", "teacher"),
                ("admin", "admin")
            ]
        }

        def on_model_change(self, form, model, is_created):
            model.username = (model.username or "").strip().lower()

            if form.password.data:
                model.password_hash = generate_password_hash(
                    form.password.data
                )
            elif is_created:
                raise ValidationError(
                    "A password is required for new users."
                )

        def on_model_delete(self, model):
            if model.id == session.get("uid"):
                raise ValidationError(
                    "You cannot delete your own account."
                )

    # Manage courses
    class CourseAdmin(AdminView):
        column_list = ("name", "teacher", "time", "capacity")
        form_columns = ("name", "teacher", "time", "capacity")

        form_args = {
            "teacher": {
                "query_factory": lambda: User.query.filter_by(
                    role="teacher"
                )
            }
        }

    # Manage student enrollments
    class EnrollmentAdmin(AdminView):
        column_list = ("course", "student", "grade")
        form_columns = ("course", "student", "grade")

        form_extra_fields = {
            "grade": FloatField(
                "Grade",
                validators=[
                    Optional(),
                    NumberRange(min=0, max=100)
                ]
            )
        }

        form_args = {
            "student": {
                "query_factory": lambda: User.query.filter_by(
                    role="student"
                )
            }
        }

        def on_model_change(self, form, model, is_created):
            if is_created:
                taken = Enrollment.query.filter_by(
                    course_id=model.course.id
                ).count()

                if taken >= model.course.capacity:
                    raise ValidationError(
                        "This course is already at capacity."
                    )

    # Create the admin dashboard
    admin = Admin(
        app,
        name="ACME Admin",
        index_view=AdminHome(url="/admin")
    )

    # Register user management
    admin.add_view(
        UserAdmin(
            User,
            db.session,
            name="Users"
        )
    )

    # Register course management
    admin.add_view(
        CourseAdmin(
            Course,
            db.session,
            name="Courses"
        )
    )

    # Register enrollment management
    admin.add_view(
        EnrollmentAdmin(
            Enrollment,
            db.session,
            name="Enrollments"
        )
    )

    return admin
