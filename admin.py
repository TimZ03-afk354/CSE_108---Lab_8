
from flask_admin import Admin
from flask_admin.contrib.sqla import ModelView
from flask import redirect, url_for
from flask_login import current_user


# Only administrators can access these pages
class AdminModelView(ModelView):

    def is_accessible(self):
        return (
            current_user.is_authenticated
            and getattr(current_user, "role", None) == "admin"
        )

    def inaccessible_callback(self, name, **kwargs):
        return redirect(url_for("index"))


# Set up the admin dashboard
def setup_admin(app, db, models):

    admin = Admin(
        app,
        name="Student Enrollment Admin",
        url="/admin"
    )

    # Add database tables to the admin dashboard
    for model in models:
        admin.add_view(
            AdminModelView(model, db.session)
        )

    return admin
