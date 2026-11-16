// sends requests from app.js to the backend, match the urls in config.js and the response fields below with the backend.
(() => {
  const config = window.APP_CONFIG;
  let csrfToken = null;
  const validId = id => (typeof id === "string" && id.length > 0) || (typeof id === "number" && Number.isFinite(id));
  class ApiError extends Error {
    constructor(message, status = 0, code = "REQUEST_FAILED") {
      super(message); this.name = "ApiError"; this.status = status; this.code = code;
    }
  }
  async function request(path, { method = "GET", body } = {}) {
    if (!["demo", "api"].includes(config.MODE)) throw new ApiError("Set MODE to demo or api in config.js.");
    if (config.MODE === "demo") {
      try { return await window.MockApi.request(path, { method, body }); }
      catch (error) { throw new ApiError(error.message, error.status || 0, error.code); }
    }
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), config.REQUEST_TIMEOUT_MS);
    try {
      const headers = { Accept: "application/json" };
      if (body !== undefined) headers["Content-Type"] = "application/json";
      if (method !== "GET" && csrfToken) headers["X-CSRF-Token"] = csrfToken;
      const response = await fetch(config.API_BASE_URL.replace(/\/$/, "") + path, {
        method, headers, credentials: "include", cache: "no-store",
        signal: controller.signal,
        ...(body !== undefined ? { body: JSON.stringify(body) } : {})
      });
      const text = response.status === 204 ? "" : await response.text();
      let data = null;
      if (text) {
        try { data = JSON.parse(text); }
        catch { throw new ApiError("The service returned an unexpected response. Please refresh or contact support.", response.status, "INVALID_RESPONSE"); }
      }
      if (!response.ok) throw new ApiError(data?.error?.message || `Request failed (${response.status}). Please try again.`, response.status, data?.error?.code);
      return data;
    } catch (error) {
      if (error instanceof ApiError) throw error;
      if (error.name === "AbortError") throw new ApiError("The server took too long to respond. Please try again.", 0, "TIMEOUT");
      throw new ApiError("Cannot connect to the enrollment service. Please check your connection and try again.", 0, "NETWORK_ERROR");
    } finally { clearTimeout(timeout); }
  }
  function readUser(data) {
    const user = data?.user;
    if (!user || !validId(user.id) || typeof user.name !== "string" || typeof user.username !== "string" || !["student", "teacher", "admin"].includes(user.role)) throw new ApiError("Your account information could not be read. Please sign in again or contact support.", 502, "INVALID_RESPONSE");
    if (config.MODE === "api" && (typeof data.csrf_token !== "string" || !data.csrf_token)) throw new ApiError("A secure session could not be established. Please sign in again or contact support.", 502, "INVALID_RESPONSE");
    csrfToken = typeof data.csrf_token === "string" ? data.csrf_token : null;
    return user;
  }
  function readCourse(course) {
    if (!course || !validId(course.id) || typeof course.name !== "string" || typeof course.teacher_name !== "string" || typeof course.time !== "string" || !Number.isInteger(course.enrollment_count) || !Number.isInteger(course.capacity) || course.enrollment_count < 0 || course.capacity < 1 || typeof course.is_enrolled !== "boolean") throw new ApiError("Course information could not be read. Please refresh or contact support.", 502, "INVALID_RESPONSE");
    return course;
  }
  function readCourses(data) {
    if (!Array.isArray(data?.courses)) throw new ApiError("The course list could not be read. Please refresh or contact support.", 502, "INVALID_RESPONSE");
    return data.courses.map(readCourse);
  }
  function readStudent(student) {
    if (!student || !validId(student.student_id) || typeof student.student_name !== "string" || !(student.grade === null || (Number.isFinite(student.grade) && student.grade >= 0 && student.grade <= 100))) throw new ApiError("Student information could not be read. Please refresh or contact support.", 502, "INVALID_RESPONSE");
    return student;
  }
  const endpoints = config.ENDPOINTS;
  window.Api = {
    ApiError,
    async login(username, password) { return readUser(await request(endpoints.login, { method: "POST", body: { username, password } })); },
    async me() { return readUser(await request(endpoints.me)); },
    async logout() { await request(endpoints.logout, { method: "POST" }); csrfToken = null; },
    async catalog() { return readCourses(await request(endpoints.catalog)); },
    async studentCourses() { return readCourses(await request(endpoints.studentCourses)); },
    async teacherCourses() { return readCourses(await request(endpoints.teacherCourses)); },
    async enroll(courseId) { await request(endpoints.enroll, { method: "POST", body: { course_id: courseId } }); },
    async drop(courseId) { await request(endpoints.drop(courseId), { method: "DELETE" }); },
    async roster(courseId) {
      const data = await request(endpoints.roster(courseId));
      if (!Array.isArray(data?.students)) throw new ApiError("The student list could not be read. Please refresh or contact support.", 502, "INVALID_RESPONSE");
      return { course: readCourse(data.course), students: data.students.map(readStudent) };
    },
    async updateGrade(courseId, studentId, grade) {
      const data = await request(endpoints.grade(courseId, studentId), { method: "PATCH", body: { grade } });
      return readStudent(data?.student);
    }
  };
})();
