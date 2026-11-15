// for testing prupose. delete this file after connecting the real api.
(() => {
  const DATA_KEY = "lab8-preview-data-v2";
  const SESSION_KEY = "lab8-preview-user-v2";
  const copy = value => JSON.parse(JSON.stringify(value));
  const fail = (status, code, message) => { throw Object.assign(new Error(message), { status, code }); };
  function readData() {
    try {
      const saved = JSON.parse(localStorage.getItem(DATA_KEY));
      const seed = copy(window.DEMO_SEED);
      if (saved === null) return seed;
      if (!Array.isArray(saved) || !saved.every(item => item &&
        seed.users.some(user => user.role === "student" && user.id === item.student_id) &&
        seed.courses.some(course => course.id === item.course_id) &&
        (item.grade === null || (Number.isFinite(item.grade) && item.grade >= 0 && item.grade <= 100)))) {
        fail(422, "INVALID_PREVIEW_DATA", "Preview data is damaged. Clear this site's browser data to reset it.");
      }
      seed.enrollments = saved;
      return seed;
    } catch (error) {
      if (error.status) throw error;
      fail(503, "STORAGE_UNAVAILABLE", "Browser storage is unavailable. Open the page with a local web server and allow site storage.");
    }
  }
  function saveData(data) {
    try { localStorage.setItem(DATA_KEY, JSON.stringify(data.enrollments)); }
    catch { fail(503, "STORAGE_UNAVAILABLE", "The change could not be saved in this browser. Allow site storage and retry."); }
  }
  function currentUser(data) {
    let id;
    try { id = sessionStorage.getItem(SESSION_KEY); }
    catch { fail(503, "STORAGE_UNAVAILABLE", "This browser does not allow preview sessions. Use a local web server."); }
    const user = data.users.find(item => item.id === id);
    if (!user) fail(401, "NOT_AUTHENTICATED", "Your session has ended. Please sign in again.");
    return user;
  }
  function requireRole(user, role) {
    if (user.role !== role) fail(403, "FORBIDDEN", "You do not have permission to perform this action.");
  }
  function courseView(data, course, user) {
    return {
      id: course.id, name: course.name,
      teacher_name: data.users.find(item => item.id === course.teacher_id).name,
      time: course.time, capacity: course.capacity,
      enrollment_count: data.enrollments.filter(item => item.course_id === course.id).length,
      is_enrolled: data.enrollments.some(item => item.course_id === course.id && item.student_id === user.id)
    };
  }
  function getCourse(data, id) {
    const course = data.courses.find(item => item.id === id);
    if (!course) fail(404, "COURSE_NOT_FOUND", "This course no longer exists.");
    return course;
  }
  window.MockApi = {
    async request(path, { method = "GET", body } = {}) {
      await new Promise(resolve => setTimeout(resolve, 160));
      const data = readData();
      if (path === "/auth/login" && method === "POST") {
        const user = data.users.find(item => item.username === body?.username.trim().toLowerCase());
        if (!user || body?.password !== "demo123") fail(401, "INVALID_CREDENTIALS", "The username or password is incorrect.");
        try { sessionStorage.setItem(SESSION_KEY, user.id); }
        catch { fail(503, "STORAGE_UNAVAILABLE", "Your browser cannot save the preview session."); }
        return { user: copy(user), csrf_token: "preview-csrf" };
      }
      const user = currentUser(data);
      if (path === "/auth/me" && method === "GET") return { user: copy(user), csrf_token: "preview-csrf" };
      if (path === "/auth/logout" && method === "POST") {
        sessionStorage.removeItem(SESSION_KEY); return null;
      }
      if (path === "/courses" && method === "GET") {
        requireRole(user, "student");
        return { courses: data.courses.map(course => courseView(data, course, user)) };
      }
      if (path === "/student/courses" && method === "GET") {
        requireRole(user, "student");
        return { courses: data.courses.filter(course => data.enrollments.some(item => item.course_id === course.id && item.student_id === user.id)).map(course => courseView(data, course, user)) };
      }
      if (path === "/student/enrollments" && method === "POST") {
        requireRole(user, "student");
        const course = getCourse(data, String(body?.course_id));
        if (data.enrollments.some(item => item.course_id === course.id && item.student_id === user.id)) fail(409, "ALREADY_ENROLLED", "You are already enrolled in this course.");
        if (courseView(data, course, user).enrollment_count >= course.capacity) fail(409, "COURSE_FULL", "This course is full. Please choose another course.");
        data.enrollments.push({ course_id: course.id, student_id: user.id, grade: null });
        saveData(data);
        return { course: courseView(data, course, user) };
      }
      const drop = path.match(/^\/student\/enrollments\/([^/]+)$/);
      if (drop && method === "DELETE") {
        requireRole(user, "student");
        const course = getCourse(data, decodeURIComponent(drop[1]));
        if (!data.enrollments.some(item => item.course_id === course.id && item.student_id === user.id)) fail(404, "ENROLLMENT_NOT_FOUND", "You are not enrolled in this course.");
        data.enrollments = data.enrollments.filter(item => !(item.course_id === course.id && item.student_id === user.id));
        saveData(data); return null;
      }
      if (path === "/teacher/courses" && method === "GET") {
        requireRole(user, "teacher");
        return { courses: data.courses.filter(course => course.teacher_id === user.id).map(course => courseView(data, course, user)) };
      }
      const teacherPath = path.match(/^\/teacher\/courses\/([^/]+)\/students(?:\/([^/]+)\/grade)?$/);
      if (teacherPath) {
        requireRole(user, "teacher");
        const course = getCourse(data, decodeURIComponent(teacherPath[1]));
        if (course.teacher_id !== user.id) fail(403, "FORBIDDEN", "This course is assigned to another teacher.");
        const rowView = row => ({ student_id: row.student_id, student_name: data.users.find(item => item.id === row.student_id).name, grade: row.grade });
        if (!teacherPath[2] && method === "GET") return { course: courseView(data, course, user), students: data.enrollments.filter(item => item.course_id === course.id).map(rowView) };
        if (teacherPath[2] && method === "PATCH") {
          const record = data.enrollments.find(item => item.course_id === course.id && item.student_id === decodeURIComponent(teacherPath[2]));
          if (!record) fail(404, "ENROLLMENT_NOT_FOUND", "This student is no longer enrolled in this course.");
          const grade = body?.grade;
          if (grade !== null && (!Number.isFinite(grade) || grade < 0 || grade > 100)) fail(422, "INVALID_GRADE", "Enter a grade between 0 and 100, or leave it blank.");
          record.grade = grade; saveData(data); return { student: rowView(record) };
        }
      }
      fail(404, "ENDPOINT_NOT_FOUND", "The requested API endpoint is not available.");
    }
  };
})();
