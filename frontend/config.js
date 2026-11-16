// set the backend url, api routes, and admin url here.
window.APP_CONFIG = Object.freeze({
  MODE: "demo", // change to "api" when Flask is ready.
  API_BASE_URL: "http://127.0.0.1:5000/api", // Or "/api" for same-origin hosting.
  ADMIN_URL: "http://127.0.0.1:5000/admin/", // Set to your teammate's actual admin URL.
  REQUEST_TIMEOUT_MS: 12000,
  ENDPOINTS: {
    login: "/auth/login",
    me: "/auth/me",
    logout: "/auth/logout",
    catalog: "/courses",
    studentCourses: "/student/courses",
    enroll: "/student/enrollments",
    drop: courseId => `/student/enrollments/${encodeURIComponent(courseId)}`,
    teacherCourses: "/teacher/courses",
    roster: courseId => `/teacher/courses/${encodeURIComponent(courseId)}/students`,
    grade: (courseId, studentId) => `/teacher/courses/${encodeURIComponent(courseId)}/students/${encodeURIComponent(studentId)}/grade`
  }
});
