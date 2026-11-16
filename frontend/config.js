// set the backend url, api routes, and admin url here.
window.APP_CONFIG = Object.freeze({
  MODE: "api",
  API_BASE_URL: "/api",
  ADMIN_URL: "/admin/",
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
