# CSE_108-Lab_8
- **Front end:** vanilla JS (`frontend/`)
- **Server:** Flask + Flask-SQLAlchemy (`app.py`), session-cookie login with CSRF tokens
- **Database:** SQL via SQLAlchemy – SQLite by default, MySQL/Postgres via `DATABASE_URL`
- **Admin:** Flask-Admin at `/admin/` (admin role only) – full create/read/update/delete on users, courses and enrollments

## Run

```bash
pip install -r requirements.txt
python app.py            # http://127.0.0.1:5000
```

## Features

**Student:** sign in/out, see own classes, see all classes with enrolled/capacity,
enroll (blocked when full or already enrolled), drop.
**Teacher:** see own classes, see each class's students and grades, edit a grade
(0–100, blank = not graded). Teachers cannot see or edit other teachers' classes.
**Admin:** `Admin page →` opens Flask-Admin.

## API 
** (matches `frontend/config.js` / `api.js`)
