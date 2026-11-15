// example data from lab 8, for testing purpose, delete the file after connecting real api.
window.DEMO_SEED = {
  users: [
    { id: "s1", username: "jose", name: "Jose Santos", role: "student" },
    { id: "s2", username: "betty", name: "Betty Brown", role: "student" },
    { id: "s3", username: "john", name: "John Stuart", role: "student" },
    { id: "s4", username: "li", name: "Li Cheng", role: "student" },
    { id: "s5", username: "nancy", name: "Nancy Little", role: "student" },
    { id: "s6", username: "mindy", name: "Mindy Norris", role: "student" },
    { id: "s7", username: "aditya", name: "Aditya Ranganath", role: "student" },
    { id: "s8", username: "yiwen", name: "Yi Wen Chen", role: "student" },
    { id: "t1", username: "rjenkins", name: "Ralph Jenkins", role: "teacher" },
    { id: "t2", username: "swalker", name: "Susan Walker", role: "teacher" },
    { id: "t3", username: "ahepworth", name: "Ammon Hepworth", role: "teacher" },
    { id: "a1", username: "admin", name: "Administrator", role: "admin" }
  ],
  courses: [
    { id: "c1", name: "Math 101", teacher_id: "t1", time: "MWF 10:00-10:50 AM", capacity: 8 },
    { id: "c2", name: "Physics 121", teacher_id: "t2", time: "TR 11:00-11:50 AM", capacity: 10 },
    { id: "c3", name: "CS 106", teacher_id: "t3", time: "MWF 2:00-2:50 PM", capacity: 10 },
    { id: "c4", name: "CS 162", teacher_id: "t3", time: "TR 3:00-3:50 PM", capacity: 4 }
  ],
  enrollments: [
    { course_id: "c1", student_id: "s1", grade: 92 },
    { course_id: "c1", student_id: "s2", grade: 65 },
    { course_id: "c1", student_id: "s3", grade: 86 },
    { course_id: "c1", student_id: "s4", grade: 77 },
    { course_id: "c2", student_id: "s5", grade: 53 },
    { course_id: "c2", student_id: "s4", grade: 85 },
    { course_id: "c2", student_id: "s6", grade: 94 },
    { course_id: "c2", student_id: "s3", grade: 91 },
    { course_id: "c2", student_id: "s2", grade: 88 },
    { course_id: "c3", student_id: "s7", grade: 93 },
    { course_id: "c3", student_id: "s8", grade: 85 },
    { course_id: "c3", student_id: "s5", grade: 57 },
    { course_id: "c3", student_id: "s6", grade: 68 },
    { course_id: "c4", student_id: "s7", grade: 99 },
    { course_id: "c4", student_id: "s5", grade: 87 },
    { course_id: "c4", student_id: "s8", grade: 92 },
    { course_id: "c4", student_id: "s3", grade: 67 }
  ]
};
