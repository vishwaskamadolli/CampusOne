"use client";
import { useEffect, useState } from "react";
import { BookOpen, CalendarClock, CheckCheck, CheckCircle2, ClipboardCheck, GraduationCap, LoaderCircle, Users } from "lucide-react";
import { api } from "@/lib/api";
import { toastAction, toastError } from "@/lib/toast";
import { TimetableWorkspace } from "@/components/timetable-workspace";
import { ExamTimetableList } from "@/components/exam-timetable-list";

type Row = Record<string, any> & { _id: string };
const statuses = ["present", "absent", "late", "excused"];
const localDate = () => {
  const date = new Date();
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 10);
};

export function TeacherAttendanceWorkspace() {
  const [view, setView] = useState<"attendance" | "timetable" | "exams">("attendance");
  const [date, setDate] = useState(localDate());
  const [periods, setPeriods] = useState<Row[]>([]);
  const [selected, setSelected] = useState<Row | null>(null);
  const [selectedSession, setSelectedSession] = useState<Row | null>(null);
  const [students, setStudents] = useState<Row[]>([]);
  const [values, setValues] = useState<Record<string, string>>({});
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(true);
  const [periodError, setPeriodError] = useState("");
  const [studentsLoading, setStudentsLoading] = useState(false);
  const [studentsError, setStudentsError] = useState("");
  const [classTeachers, setClassTeachers] = useState<Row[]>([]);
  const [classTeachersLoading, setClassTeachersLoading] = useState(true);
  const [classTeachersError, setClassTeachersError] = useState("");
  const [classSummary, setClassSummary] = useState<any>(null);
  async function loadPeriods() {
    setLoading(true);
    setPeriodError("");
    try {
      setPeriods(await api<Row[]>(`/attendance/today?date=${date}`));
      setSelected(null);
      setSelectedSession(null);
      setStudents([]);
    } catch (error) {
      setPeriodError(error instanceof Error ? error.message : "Unable to load assigned periods");
      toastError(error);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void loadPeriods();
  }, [date]);
  useEffect(() => {
    api<Row[]>("/people/teacher/class-teachers")
      .then(setClassTeachers)
      .catch((error) => {
        setClassTeachersError(error instanceof Error ? error.message : "Unable to load class teacher assignments");
        toastError(error);
      })
      .finally(() => setClassTeachersLoading(false));
  }, []);
  async function loadClassSummary(item: Row) {
    try {
      setClassSummary(
        await api(
          `/attendance/class-summary?courseId=${item.courseId._id}&departmentId=${item.departmentId._id}&sectionId=${item.sectionId._id}`,
        ),
      );
    } catch (error) {
      toastError(error);
    }
  }
  async function choose(period: Row) {
    setSelected(period);
    setSelectedSession(null);
    setStudents([]);
    setValues({});
    setStudentsError("");
    setStudentsLoading(true);
    try {
      if (period.submitted && period.sessionId) {
        const result = await api<{ session: Row; records: Row[] }>(
          `/attendance/sessions/${period.sessionId}`,
        );
        setSelectedSession(result.session);
        setStudents(
          result.records.map((record) => ({
            ...record.studentId,
            recordId: record._id,
          })),
        );
        setValues(
          Object.fromEntries(
            result.records.map((record) => [
              record.studentId._id,
              record.status,
            ]),
          ),
        );
      } else {
        const rows = await api<Row[]>(
          `/people/students?courseId=${period.courseId._id}&departmentId=${period.departmentId._id}&sectionId=${period.sectionId._id}`,
        );
        setStudents(rows);
        setValues(
          Object.fromEntries(rows.map((student) => [student._id, "present"])),
        );
      }
    } catch (error) {
      setStudentsError(error instanceof Error ? error.message : "Unable to load students");
      toastError(error);
    } finally {
      setStudentsLoading(false);
    }
  }
  async function submit() {
    if (!selected) return toastError(new Error("Select an assigned timetable period"));
    if (!students.length) return toastError(new Error("No active students are available for this class"));
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return toastError(new Error("Select a valid attendance date"));
    if (students.some((student) => !statuses.includes(values[student._id] || "")))
      return toastError(new Error("Select a valid attendance status for every student"));
    if (!selected.submitted && selected.attendanceOpen === false)
      return toastError(new Error(selected.attendanceBlockedReason || "Attendance is not open for this period"));
    const records = students.map((student) => ({
      studentId: student._id,
      status: values[student._id] || "present",
    }));
    if (selected.submitted) {
      await toastAction(
        () =>
          api(`/attendance/sessions/${selected.sessionId}/corrections`, {
            method: "POST",
            body: JSON.stringify({ changes: records, reason }),
          }),
        {
          loading: "Sending correction request…",
          success: "Correction requested",
        },
      );
      setReason("");
      return;
    }
    const result = await toastAction(
      () =>
        api<{ session: Row; recordCount: number }>("/attendance/sessions", {
          method: "POST",
          body: JSON.stringify({
            timetableId: selected.timetableId,
            entryId: selected.entryId,
            date,
            exceptionReason: reason,
            records,
          }),
        }),
      { loading: "Submitting attendance…", success: "Attendance submitted" },
    );
    const updated = { ...selected, submitted: true, sessionId: result.session._id };
    setPeriods((current) => current.map((period) => period.entryId === selected.entryId ? updated : period));
    setSelected(updated);
    setSelectedSession(result.session);
  }
  return (
    <div className="mt-8">
      <nav className="mb-6 grid grid-cols-3 rounded-2xl border border-slate-200 bg-white p-1 shadow-sm">
        <button
          onClick={() => setView("attendance")}
          className={`flex min-w-0 flex-col items-center justify-center gap-1 rounded-xl px-2 py-2.5 text-xs font-semibold sm:flex-row sm:gap-2 sm:px-5 sm:text-sm ${view === "attendance" ? "bg-brand-50 text-brand-700" : "text-slate-500 hover:bg-slate-50 hover:text-slate-900"}`}
        >
          <BookOpen size={17}/><span className="sm:hidden">Classes</span><span className="hidden sm:inline">Classes &amp; Attendance</span>
        </button>
        <button
          onClick={() => setView("timetable")}
          className={`flex min-w-0 flex-col items-center justify-center gap-1 rounded-xl px-2 py-2.5 text-xs font-semibold sm:flex-row sm:gap-2 sm:px-5 sm:text-sm ${view === "timetable" ? "bg-brand-50 text-brand-700" : "text-slate-500 hover:bg-slate-50 hover:text-slate-900"}`}
        >
          <CalendarClock size={17}/><span className="sm:hidden">Timetable</span><span className="hidden sm:inline">My Timetable</span>
        </button>
        <button onClick={() => setView("exams")} className={`flex min-w-0 flex-col items-center justify-center gap-1 rounded-xl px-2 py-2.5 text-xs font-semibold sm:flex-row sm:gap-2 sm:px-5 sm:text-sm ${view === "exams" ? "bg-brand-50 text-brand-700" : "text-slate-500 hover:bg-slate-50 hover:text-slate-900"}`}><ClipboardCheck size={17}/><span className="sm:hidden">Exams</span><span className="hidden sm:inline">Exam Timetable</span></button>
      </nav>
      {view === "timetable" ? (
        <TimetableWorkspace mode="teacher" />
      ) : view === "exams" ? (
        <ExamTimetableList />
      ) : (
        <>
          <div className="mb-6 grid grid-cols-2 gap-3 xl:grid-cols-4"><SummaryCard icon={BookOpen} label="Assigned Classes" value={classTeachers.length}/><SummaryCard icon={CalendarClock} label="Selected Day Periods" value={periods.length}/><SummaryCard icon={ClipboardCheck} label="Attendance Pending" value={periods.filter(period=>!period.submitted).length} tone="amber"/><SummaryCard icon={CheckCircle2} label="Attendance Submitted" value={periods.filter(period=>period.submitted).length}/></div>
          <section className="mb-6 grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-soft sm:grid-cols-3"><button onClick={()=>setView("attendance")} className="flex items-center gap-3 rounded-xl bg-brand-50 p-3 text-left text-sm font-semibold text-brand-800"><ClipboardCheck size={19}/>Mark Attendance</button><button onClick={()=>setView("timetable")} className="flex items-center gap-3 rounded-xl bg-blue-50 p-3 text-left text-sm font-semibold text-blue-800"><CalendarClock size={19}/>View My Timetable</button><button onClick={()=>setView("exams")} className="flex items-center gap-3 rounded-xl bg-violet-50 p-3 text-left text-sm font-semibold text-violet-800"><GraduationCap size={19}/>View Exam Timetable</button></section>
          <div className="mb-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-soft">
            <div className="flex items-start justify-between gap-3"><div><h2 className="font-bold">My Class Teacher Assignments</h2><p className="mt-1 text-sm text-slate-500">Classes assigned for the current academic year.</p></div><Users className="text-brand-600" size={20}/></div>
            <div className="mt-3 flex flex-wrap gap-2">
              {classTeachersLoading ? (
                <LoaderCircle className="animate-spin text-brand-600" />
              ) : classTeachersError ? (
                <p className="text-sm text-rose-700">{classTeachersError}</p>
              ) : classTeachers.length ? (
                classTeachers.map((item) => (
                  <button
                    key={item._id}
                    onClick={() => void loadClassSummary(item)}
                    className="w-full rounded-xl border border-slate-200 px-4 py-3 text-left text-sm sm:w-auto"
                  >
                    <b>
                      {item.courseId?.name} · {item.departmentId?.name} ·{" "}
                      {item.sectionId?.name}
                    </b>
                    <span className="ml-2 text-slate-500">
                      {item.academicYearId?.name}
                    </span>
                  </button>
                ))
              ) : (
                <p className="text-sm text-slate-500">
                  No class teacher assignment.
                </p>
              )}
            </div>
            {classSummary && (
              <div className="mt-4">
                <p className="text-sm font-semibold">
                  Overall attendance: {classSummary.percentage}%
                </p>
                <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                  {classSummary.students.map((student: Row) => (
                    <div
                      key={student._id}
                      className="rounded-lg bg-slate-50 p-2 text-sm"
                    >
                      <b>{student.name}</b>
                      <p className="text-xs text-slate-500">
                        {student.rollNumber} · {student.percentage}%
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
          <div className="space-y-6">
            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-soft">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <h2 className="font-bold">Assigned periods</h2>
                <input
                  type="date"
                  value={date}
                  onChange={(event) => setDate(event.target.value)}
                  className="rounded-lg border border-slate-200 p-2 text-xs"
                />
              </div>
              <p className="mt-1 text-xs text-slate-500">
                Published timetable periods for the selected day.
              </p>
              <div className="mt-4 space-y-2">
                {!loading && !periodError && periods.length > 0 && (
                  <div className="hidden overflow-x-auto md:block">
                    <table className="w-full min-w-[850px] text-left text-sm">
                      <thead><tr className="border-b text-xs uppercase text-slate-500">
                        <th className="p-3">Period</th><th className="p-3">Time</th><th className="p-3">Class</th>
                        <th className="p-3">Section</th><th className="p-3">Subject</th><th className="p-3">Attendance Status</th><th className="p-3">Action</th>
                      </tr></thead>
                      <tbody>{periods.map((period) => (
                        <tr key={period.entryId} className={`border-b last:border-0 ${selected?.entryId === period.entryId ? "bg-brand-50" : ""}`}>
                          <td className="p-3 font-semibold">{period.period}</td>
                          <td className="p-3">{period.startTime}–{period.endTime}</td>
                          <td className="p-3">{period.courseId?.name}<small className="block text-slate-500">{period.departmentId?.name}</small></td>
                          <td className="p-3">{period.sectionId?.name}</td>
                          <td className="p-3">{period.subjectId?.name}</td>
                          <td className="p-3"><span className={`rounded-full px-2 py-1 text-xs font-semibold ${period.submitted ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>{period.submitted ? "Submitted" : "Pending"}</span></td>
                          <td className="p-3">
                            <button onClick={() => void choose(period)} className="rounded-lg border border-slate-200 px-3 py-1.5 font-semibold hover:bg-slate-50">{period.submitted ? "View / Correct" : "Mark attendance"}</button>
                            {!period.submitted && period.attendanceOpen === false && <small className="mt-1 block max-w-44 text-amber-700">{period.attendanceBlockedReason}</small>}
                          </td>
                        </tr>
                      ))}</tbody>
                    </table>
                  </div>
                )}
                {loading ? (
                  <LoaderCircle className="animate-spin text-brand-600" />
                ) : periodError ? (
                  <p className="py-8 text-center text-sm text-rose-700">{periodError}</p>
                ) : periods.length ? (
                  <div className="space-y-3 md:hidden">{periods.map((period) => (
                    <button
                      key={period.entryId}
                      onClick={() => choose(period)}
                      className={`w-full rounded-xl border p-4 text-left text-sm ${selected?.entryId === period.entryId ? "border-brand-500 bg-brand-50" : "border-slate-200 bg-white"}`}
                    >
                      <div className="flex justify-between">
                        <span><small className="mr-2 rounded bg-slate-100 px-1.5 py-0.5 text-slate-600">P{period.period}</small><b>{period.subjectId?.name}</b></span>
                        <span
                          className={
                            period.submitted
                              ? "text-emerald-700"
                              : "text-slate-500"
                          }
                        >
                          {period.submitted
                            ? "Submitted"
                            : `${period.startTime}–${period.endTime}`}
                        </span>
                      </div>
                      <p className="mt-2 text-xs font-medium text-slate-700">{period.startTime}–{period.endTime}</p>
                      <p className="text-xs text-slate-500">
                        {period.courseId?.name} · {period.departmentId?.name} ·{" "}
                        {period.sectionId?.name}
                        {period.room ? ` · ${period.room}` : ""}
                      </p>
                      {period.substitution && (
                        <p className="mt-1 text-xs text-amber-700">
                          Authorized substitution
                        </p>
                      )}
                    </button>
                  ))}</div>
                ) : (
                  <p className="py-8 text-center text-sm text-slate-500">
                    No published periods are assigned to you on this date.
                  </p>
                )}
              </div>
            </section>
            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-soft">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <h2 className="font-bold">
                  {selected?.submitted
                    ? "Request correction"
                    : "Mark attendance"}
                </h2>
                {students.length > 0 && !selected?.submitted && (
                  <button
                    onClick={() =>
                      setValues(
                        Object.fromEntries(
                          students.map((student) => [student._id, "present"]),
                        ),
                      )
                    }
                    className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold"
                  >
                    <CheckCheck size={16} />
                    Mark all present
                  </button>
                )}
              </div>
              {selectedSession?.submittedAt && (
                <p className="mt-2 text-xs text-slate-500">
                  Submitted {new Date(selectedSession.submittedAt).toLocaleString("en-IN")}
                </p>
              )}
              {selected && !selected.submitted && selected.attendanceOpen === false && (
                <p className="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-700">{selected.attendanceBlockedReason}</p>
              )}
              {studentsLoading ? (
                <div className="grid place-items-center py-12"><LoaderCircle className="animate-spin text-brand-600" /></div>
              ) : studentsError ? (
                <p className="py-12 text-center text-sm text-rose-700">{studentsError}</p>
              ) : students.length ? (
                <div className="mt-4 space-y-2">
                  {students.map((student) => {
                    const isPresent = (values[student._id] || "present") === "present";
                    return (
                      <div
                        key={student._id}
                        className="flex items-center justify-between gap-3 rounded-xl bg-slate-50 p-3 transition hover:bg-slate-100/60"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold text-slate-800">
                            {student.name}
                          </p>
                          <p className="text-xs text-slate-400">
                            {student.rollNumber ? `Roll ${student.rollNumber}` : "No roll number"}
                          </p>
                        </div>
                        <div className="flex shrink-0 items-center gap-2.5">
                          <span
                            className={`text-xs font-bold select-none ${
                              isPresent ? "text-emerald-700" : "text-rose-700"
                            }`}
                          >
                            {isPresent ? "Present" : "Absent"}
                          </span>
                          <button
                            type="button"
                            role="switch"
                            aria-checked={isPresent}
                            aria-label={`Toggle attendance status for ${student.name || "student"}. Currently ${isPresent ? "Present" : "Absent"}`}
                            onClick={() =>
                              setValues((prev) => ({
                                ...prev,
                                [student._id]: isPresent ? "absent" : "present",
                              }))
                            }
                            className={`relative inline-flex h-6 w-14 shrink-0 cursor-pointer items-center rounded-full p-0.5 transition-colors duration-200 ease-in-out focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-brand-500 ${
                              isPresent ? "bg-emerald-600" : "bg-rose-600"
                            }`}
                          >
                            <span
                              className={`pointer-events-none absolute text-[9px] font-extrabold uppercase tracking-wider text-white select-none ${
                                isPresent ? "left-1.5" : "right-1.5"
                              }`}
                            >
                              {isPresent ? "P" : "A"}
                            </span>
                            <span
                              className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-xs ring-0 transition duration-200 ease-in-out ${
                                isPresent ? "translate-x-[32px]" : "translate-x-0"
                              }`}
                            />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                  {(selected?.submitted || selected?.substitution) && (
                    <textarea
                      value={reason}
                      onChange={(event) => setReason(event.target.value)}
                      required
                      placeholder={
                        selected?.submitted
                          ? "Mandatory correction reason"
                          : "Mandatory substitution reason"
                      }
                      className="w-full rounded-xl border border-slate-200 p-3 text-sm"
                    />
                  )}
                  <button
                    disabled={
                      !selected ||
                      (!selected.submitted && selected.attendanceOpen === false) ||
                      ((selected.submitted || selected.substitution) &&
                        !reason.trim())
                    }
                    onClick={() => void submit().catch(toastError)}
                    className="w-full rounded-xl bg-brand-600 py-3 font-semibold text-white disabled:opacity-50"
                  >
                    {selected?.submitted
                      ? "Request correction"
                      : "Submit attendance"}
                  </button>
                </div>
              ) : (
                <p className="py-12 text-center text-sm text-slate-500">
                  Select a period to load students.
                </p>
              )}
            </section>
          </div>
        </>
      )}
    </div>
  );
}

function SummaryCard({icon:Icon,label,value,tone="green"}:{icon:any;label:string;value:number;tone?:"green"|"amber"}) {
  return <article className="rounded-2xl border border-slate-200 bg-white p-3 shadow-soft sm:p-4"><div className="flex items-center justify-between"><span className={`rounded-xl p-2 ${tone==="amber"?"bg-amber-50 text-amber-700":"bg-brand-50 text-brand-700"}`}><Icon size={18}/></span><span className="text-xl font-bold text-slate-900 sm:text-2xl">{value}</span></div><p className="mt-2 text-xs font-medium leading-tight text-slate-500 sm:mt-3 sm:text-sm">{label}</p></article>;
}
