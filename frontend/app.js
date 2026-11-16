// handles page display and button actions, calls api.js for data.
(() => {
  const state = {
    user: null, view: "my-courses", myCourses: [], catalog: [], teaching: [],
    roster: null, selectedCourseId: null, search: "", drafts: new Map(),
    loading: false, busy: false, error: "", requestNumber: 0
  };
  const api = window.Api;
  const config = window.APP_CONFIG;
  const $ = id => document.getElementById(id);
  const content = $("main-content");
  let toastTimer;
  const sameId = (a, b) => String(a) === String(b);
  const escape = value => String(value ?? "").replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[character]));
  const disabled = () => state.busy ? "disabled" : "";

  function toast(message) {
    clearTimeout(toastTimer);
    $("toast").textContent = message;
    $("toast").hidden = false;
    toastTimer = setTimeout(() => { $("toast").hidden = true; }, 5500);
  }
  function clearSession(message = "") {
    state.requestNumber++;
    Object.assign(state, { user: null, selectedCourseId: null, roster: null, myCourses: [], catalog: [], teaching: [], error: "", loading: false, busy: false, search: "" });
    state.drafts.clear();
    $("portal-view").hidden = true;
    $("login-view").hidden = false;
    $("login-form").reset();
    $("login-button").disabled = false;
    $("login-button").textContent = "Sign in →";
    $("login-error").textContent = message;
    $("main-content").innerHTML = "";
    $("username").focus();
  }
  function expired(error) {
    if (error.status !== 401) return false;
    clearSession("Your session has ended. Please sign in again.");
    return true;
  }
  function openPortal(user) {
    state.user = user;
    state.view = user.role === "admin" ? "admin" : "my-courses";
    state.search = "";
    $("login-view").hidden = true;
    $("portal-view").hidden = false;
    $("password").value = "";
    $("profile-name").textContent = user.name;
    $("profile-role").textContent = user.role;
    $("avatar").textContent = user.name.split(/\s+/).map(word => word[0]).slice(0, 2).join("");
    $("breadcrumb").textContent = user.role[0].toUpperCase() + user.role.slice(1) + " portal";
    $("connection-label").textContent = config.MODE === "demo" ? "Preview mode" : "Connected to API";
    $("storage-note").textContent = config.MODE === "demo" ? "Preview · Data is saved in this browser" : "University enrollment portal";
    return loadView();
  }

  // request number prevents an older response from replacing a newer view.
  async function loadView() {
    if (!state.user) return false;
    const requestNumber = ++state.requestNumber;
    const userId = state.user.id;
    state.loading = true;
    state.error = "";
    render();
    try {
      let result;
      if (state.user.role === "student") result = await Promise.all([api.studentCourses(), api.catalog()]);
      else if (state.user.role === "teacher") result = state.selectedCourseId === null ? await api.teacherCourses() : await api.roster(state.selectedCourseId);
      if (requestNumber !== state.requestNumber || !state.user || !sameId(state.user.id, userId)) return false;
      if (state.user.role === "student") [state.myCourses, state.catalog] = result;
      else if (state.user.role === "teacher") {
        if (state.selectedCourseId === null) state.teaching = result;
        else state.roster = result;
      }
      return true;
    } catch (error) {
      if (requestNumber !== state.requestNumber) return false;
      if (!expired(error)) state.error = error.message;
      return false;
    } finally {
      if (requestNumber === state.requestNumber) { state.loading = false; render(); }
    }
  }
  function heading(label, title, subtitle, action = "") {
    return `<div class="page-heading"><div><h1>${escape(title)}</h1><p>${escape(subtitle)}</p></div>${action}</div>`;
  }
  function feedback() {
    if (state.loading) return '<div class="loading-state" role="status">Loading…</div>';
    if (state.error) return `<div class="error-panel" role="alert"><p>${escape(state.error)}</p><button class="outline-button" data-action="retry" ${disabled()}>Retry / refresh</button></div>`;
    return "";
  }
  function courseCell(course) {
    return `<strong>${escape(course.name)}</strong>`;
  }
  function countCell(course) {
    const full = course.enrollment_count >= course.capacity;
    return `${course.enrollment_count} / ${course.capacity}${full ? " (Full)" : ""}`;
  }
  function courseButton(course) {
    const id = escape(course.id);
    if (state.user.role === "teacher") return `<button class="action-button" data-roster="${id}" aria-label="Open ${escape(course.name)} roster" ${disabled()}>View roster →</button>`;
    if (state.view === "my-courses") return `<button class="action-button drop" data-drop="${id}" ${disabled()}>Drop course</button>`;
    if (course.is_enrolled) return '<span class="badge">Enrolled</span>';
    if (course.enrollment_count >= course.capacity) return '<button class="action-button" disabled>Class full</button>';
    return `<button class="action-button" data-enroll="${id}" ${disabled()}>+ Enroll</button>`;
  }
  function currentCourses() {
    return state.user.role === "teacher" ? state.teaching : state.view === "catalog" ? state.catalog : state.myCourses;
  }
  function courseRows() {
    const query = state.search.trim().toLowerCase();
    const list = currentCourses().filter(course => `${course.name} ${course.teacher_name} ${course.time}`.toLowerCase().includes(query));
    if (!list.length) {
      const message = query ? "No courses match your search." : state.user.role === "teacher" ? "No teaching courses are assigned to you yet." : state.view === "catalog" ? "No courses are currently offered." : "You have not enrolled in any courses. Open Add courses to find a class.";
      return `<tr><td colspan="5" class="empty">${message}</td></tr>`;
    }
    return list.map(course => `<tr><td>${courseCell(course)}</td><td>${escape(course.teacher_name)}</td><td class="time-cell">${escape(course.time)}</td><td>${countCell(course)}</td><td>${courseButton(course)}</td></tr>`).join("");
  }
  function table(title, subtitle) {
    return `<section class="table-card"><div class="table-toolbar"><div><h2>${title}</h2><p>${subtitle}</p></div><input id="course-search" class="search" type="search" placeholder="Search courses or teachers" aria-label="Search courses or teachers" value="${escape(state.search)}"></div><div class="table-scroll"><table><caption class="sr-only">${title}: course name, teacher, meeting time, and enrolled students versus capacity.</caption><thead><tr><th scope="col">Course</th><th scope="col">Teacher</th><th scope="col">Meeting time</th><th scope="col">Enrollment</th><th scope="col">Action</th></tr></thead><tbody id="course-rows">${courseRows()}</tbody></table></div></section>`;
  }
  function renderStudent() {
    const catalog = state.view === "catalog";
    const title = catalog ? "All courses" : "Your courses";
    const action = `<button class="outline-button" data-view="${catalog ? "my-courses" : "catalog"}" ${disabled()}>${catalog ? "← Your courses" : "Add courses →"}</button>`;
    content.innerHTML = heading("STUDENT WORKSPACE", title, catalog ? "View available classes and enroll." : "Classes you are enrolled in.", action) + feedback() +
      (state.loading ? "" :
        table(catalog ? "Add courses" : "Your courses", catalog ? "Enroll while seats are available." : "Your current enrolled classes.") +
        '<p class="info-note">Enrollment counts show enrolled students / maximum capacity. Full courses cannot accept new students.</p>');
  }
  function rosterRows() {
    const roster = state.roster;
    if (!roster) return "";
    const list = roster.students.filter(student => student.student_name.toLowerCase().includes(state.search.trim().toLowerCase()));
    if (!list.length) return `<tr><td colspan="3" class="empty">${state.search ? "No students match your search." : "No students are enrolled in this course."}</td></tr>`;
    return list.map(student => {
      const id = String(student.student_id);
      const grade = state.drafts.has(id) ? state.drafts.get(id) : student.grade ?? "";
      return `<tr><td><strong>${escape(student.student_name)}</strong></td><td>${student.grade === null ? '<span class="badge neutral">Not graded</span>' : escape(student.grade)}</td><td><form class="grade-form" data-student="${escape(id)}"><input name="grade" type="number" min="0" max="100" step="any" placeholder="—" aria-label="Grade for ${escape(student.student_name)}" value="${escape(grade)}" ${disabled()}><button class="action-button" type="submit" ${disabled()}>Save</button></form></td></tr>`;
    }).join("");
  }
  function renderTeacher() {
    const hasRoster = state.selectedCourseId !== null;
    if (hasRoster) {
      const course = state.roster?.course;
      content.innerHTML = heading("TEACHER WORKSPACE", course?.name || "Course roster", course ? `${course.time} · ${course.enrollment_count} / ${course.capacity} students` : "View your enrolled students and their grades.", `<button class="outline-button" data-action="back" ${disabled()}>← Your courses</button>`) + feedback() +
        (state.loading || !state.roster ? "" : `<section class="table-card"><div class="table-toolbar"><div><h2>Student roster & grades</h2><p>Enter 0–100 and save each student. Leave blank for Not graded.</p></div><input id="student-search" class="search" type="search" aria-label="Search students" placeholder="Search students" value="${escape(state.search)}"></div><div class="table-scroll"><table><caption class="sr-only">Students and grades for ${escape(course.name)}.</caption><thead><tr><th scope="col">Student</th><th scope="col">Saved grade</th><th scope="col">Edit grade</th></tr></thead><tbody id="roster-rows">${rosterRows()}</tbody></table></div></section><p id="unsaved-note" class="info-note" ${state.drafts.size ? "" : "hidden"}>You have unsaved grade changes. Select Save for each student.</p>`);
      return;
    }
    content.innerHTML = heading("TEACHER WORKSPACE", "Your teaching courses", "Select a class to view students and edit grades.") + feedback() +
      (state.loading ? "" : table("Courses", "Only the classes you teach are listed here."));
  }
  function renderAdmin() {
    let url = "";
    try {
      const parsed = new URL(config.ADMIN_URL, window.location.href);
      if (["http:", "https:"].includes(parsed.protocol)) url = parsed.href;
    } catch { /* missing admin URL is handled by the message below. */ }
    content.innerHTML = heading("ADMINISTRATOR", "Administration", "Continue to your team's administrator page.") + feedback() +
      '<section class="handoff-card"><h2>Admin workspace</h2><p>Manage university records in the administrator workspace.</p>' +
      (config.MODE === "api" && url ? `<a id="admin-link" class="primary admin-link" href="${escape(url)}">Open admin page →</a>` : '<p class="muted">The administrator workspace is not connected in preview mode.</p>') + '</section>';
  }
  function render() {
    if (!state.user) return;
    const items = state.user.role === "student" ? [["my-courses", "Your courses"], ["catalog", "Add courses"]] : state.user.role === "teacher" ? [["my-courses", "Teaching courses"]] : [["admin", "Admin page"]];
    $("navigation").innerHTML = items.map(([view, label]) => `<button data-view="${view}" class="${state.view === view ? "active" : ""}" ${state.view === view ? 'aria-current="page"' : ""} ${disabled()}>${label}</button>`).join("");
    $("logout-button").disabled = state.busy;
    content.setAttribute("aria-busy", String(state.loading || state.busy));
    if (state.user.role === "student") renderStudent();
    else if (state.user.role === "teacher") renderTeacher();
    else renderAdmin();
    if (!state.loading && state.user.role !== "admin") {
      content.insertAdjacentHTML("beforeend", `<div class="page-controls"><button class="text-button" data-action="refresh" ${disabled()}>Refresh records</button><span class="muted">${state.busy ? "Saving…" : ""}</span></div>`);
    }
  }
  function allowDiscard() {
    return !state.drafts.size || window.confirm("Leave this view and discard unsaved grade edits?");
  }
  async function navigate(view) {
    if (!state.user || state.busy || !allowDiscard()) return;
    const allowed = state.user.role === "student" ? ["my-courses", "catalog"] : state.user.role === "teacher" ? ["my-courses"] : ["admin"];
    if (!allowed.includes(view)) return;
    state.drafts.clear();
    state.view = view; state.selectedCourseId = null; state.roster = null; state.search = "";
    await loadView();
  }
  async function changeEnrollment(courseId, drop = false) {
    if (state.busy || state.loading || state.user?.role !== "student") return;
    const course = (drop ? state.myCourses : state.catalog).find(item => sameId(item.id, courseId));
    if (!course) return;
    if (drop && !window.confirm(`Drop ${course.name}? You may need an available seat to enroll again.`)) return;
    if (!drop && (course.is_enrolled || course.enrollment_count >= course.capacity)) return;
    state.busy = true; state.error = ""; render();
    try {
      if (drop) await api.drop(course.id); else await api.enroll(course.id);
      const refreshed = await loadView();
      if (state.user) toast(`${drop ? "Dropped" : "Enrolled in"} ${course.name}.${refreshed ? "" : " The change was saved, but the list could not refresh. Please retry."}`);
    } catch (error) {
      if (!expired(error)) {
        if (error.status === 409 || error.status === 404) await loadView();
        if (state.user) state.error = error.message;
      }
    } finally { state.busy = false; render(); }
  }

  document.querySelectorAll("[data-demo]").forEach(button => {
    button.addEventListener("click", () => {
      $("username").value = button.dataset.demo;
      $("password").value = "demo123";
      $("login-error").textContent = "";
    });
  });
  $("login-form").addEventListener("submit", async event => {
    event.preventDefault();
    if ($("login-button").disabled) return;
    const username = $("username").value.trim();
    const password = $("password").value;
    if (!username || !password) { $("login-error").textContent = "Enter a username and password."; return; }
    $("login-button").disabled = true;
    $("login-button").textContent = "Signing in…";
    $("login-error").textContent = "";
    try { await openPortal(await api.login(username, password)); }
    catch (error) { $("login-error").textContent = error.message; }
    finally { $("login-button").disabled = false; $("login-button").textContent = "Sign in →"; }
  });
  $("logout-button").addEventListener("click", async () => {
    if (state.busy || !allowDiscard()) return;
    state.busy = true; render();
    try { await api.logout(); clearSession(); toast("You have signed out."); }
    catch (error) { if (!expired(error)) { state.error = `Sign out failed. ${error.message}`; } }
    finally { state.busy = false; render(); }
  });
  $("navigation").addEventListener("click", event => {
    const button = event.target.closest("[data-view]");
    if (button) navigate(button.dataset.view);
  });
  content.addEventListener("click", async event => {
    const button = event.target.closest("button");
    if (!button || button.disabled || state.busy || !state.user) return;
    if (button.dataset.view) { await navigate(button.dataset.view); return; }
    if (button.dataset.enroll) { await changeEnrollment(button.dataset.enroll); return; }
    if (button.dataset.drop) { await changeEnrollment(button.dataset.drop, true); return; }
    if (button.dataset.roster && state.user.role === "teacher") {
      const course = state.teaching.find(item => sameId(item.id, button.dataset.roster));
      if (!course || !allowDiscard()) return;
      state.drafts.clear(); state.selectedCourseId = course.id; state.roster = null; state.search = "";
      await loadView(); return;
    }
    if (button.dataset.action === "back") { await navigate("my-courses"); return; }
    if (["retry", "refresh"].includes(button.dataset.action) && allowDiscard()) {
      state.drafts.clear(); await loadView();
    }
  });
  content.addEventListener("input", event => {
    if (event.target.id === "course-search") {
      state.search = event.target.value; $("course-rows").innerHTML = courseRows();
    } else if (event.target.id === "student-search") {
      state.search = event.target.value; $("roster-rows").innerHTML = rosterRows();
    } else if (event.target.matches('.grade-form input[name="grade"]')) {
      const studentId = event.target.closest("form").dataset.student;
      const student = state.roster.students.find(item => sameId(item.student_id, studentId));
      const value = event.target.value;
      if (student && (value === "" ? null : Number(value)) === student.grade) state.drafts.delete(studentId);
      else state.drafts.set(studentId, value);
      $("unsaved-note").hidden = state.drafts.size === 0;
    }
  });
  content.addEventListener("submit", async event => {
    const form = event.target.closest(".grade-form");
    if (!form) return;
    event.preventDefault();
    if (state.busy || state.loading || state.user?.role !== "teacher" || !state.roster) return;
    const student = state.roster.students.find(item => sameId(item.student_id, form.dataset.student));
    if (!student) return;
    const input = form.elements.grade;
    if (!input.checkValidity()) { input.reportValidity(); return; }
    const value = input.value.trim();
    const grade = value === "" ? null : Number(value);
    if (grade !== null && (!Number.isFinite(grade) || grade < 0 || grade > 100)) { toast("Enter a grade between 0 and 100, or leave it blank."); return; }
    state.drafts.set(String(student.student_id), value);
    state.busy = true; state.error = ""; render();
    try {
      const saved = await api.updateGrade(state.roster.course.id, student.student_id, grade);
      if (!sameId(saved.student_id, student.student_id)) throw new Error("The server returned a different student. Refresh the roster before continuing.");
      Object.assign(student, saved);
      state.drafts.delete(String(student.student_id));
      toast(`Grade saved for ${student.student_name}.`);
    } catch (error) { if (!expired(error)) state.error = error.message; }
    finally { state.busy = false; render(); }
  });
  window.addEventListener("beforeunload", event => {
    if (state.drafts.size || state.busy) { event.preventDefault(); event.returnValue = ""; }
  });
  async function start() {
    $("demo-box").hidden = config.MODE !== "demo";
    try { await openPortal(await api.me()); }
    catch (error) { clearSession(error.status === 401 ? "" : error.message); }
    finally { $("login-button").disabled = false; $("login-button").textContent = "Sign in →"; }
  }
  start();
})();
