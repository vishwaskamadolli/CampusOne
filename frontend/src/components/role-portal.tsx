"use client";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Bell,
  BookOpen,
  CalendarDays,
  CalendarClock,
  CheckCircle2,
  ClipboardCheck,
  GraduationCap,
  LoaderCircle,
  LogOut,
  Users,
} from "lucide-react";
import { api, SessionUser } from "@/lib/api";
import { TimetableWorkspace } from "@/components/timetable-workspace";
import { TeacherAttendanceWorkspace } from "@/components/teacher-attendance";
import { ParentAttendanceCalendar } from "@/components/parent-attendance-calendar";
import { ExamTimetableList } from "@/components/exam-timetable-list";
type Row = Record<string, any> & { _id: string };
export function RolePortal({ user }: { user: SessionUser }) {
  const router = useRouter();
  const teacher = user.roles.includes("teacher");
  const today = new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(new Date());
  async function logout() {
    await api("/auth/logout", { method: "POST" });
    router.push("/login");
  }
  return (
    <main className="min-h-screen bg-canvas">
      <header className="flex h-20 items-center border-b border-slate-200 bg-white px-4 sm:px-5 lg:px-10">
        <div className="flex items-center gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-brand-600 text-white">
            <GraduationCap size={21} />
          </span>
          <div>
            <b>CampusOne</b>
            <p className="text-xs text-slate-500">
              {teacher ? "Teacher" : "Parent"} portal
            </p>
          </div>
        </div>
        <button
          onClick={logout}
          className="ml-auto flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold"
        >
          <LogOut size={17} />
          <span className="hidden sm:inline">Logout</span>
        </button>
      </header>
      <div className="mx-auto max-w-7xl p-4 sm:p-5 lg:p-10">
        <p className="text-sm font-semibold uppercase text-brand-700">{today}</p>
        <h1 className="mt-2 text-2xl font-bold sm:text-3xl">Welcome, {user.name}</h1>
        <p className="mt-1 text-slate-500">
          {teacher
            ? "Manage only your assigned classes, attendance, and results."
            : "Attendance, published results, events, and alerts for your linked children."}
        </p>
        {!teacher && <ExamTimetableList />}
        {teacher ? <TeacherWorkspace /> : <ParentWorkspace />}
      </div>
    </main>
  );
}

function TeacherWorkspace() {
  return <TeacherAttendanceWorkspace />;
}

function LegacyTeacherWorkspace() {
  const [view, setView] = useState<"work" | "timetable">("work");
  const [assignments, setAssignments] = useState<Row[]>([]);
  const [students, setStudents] = useState<Row[]>([]);
  const [selected, setSelected] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    api<Row[]>("/people/teacher/assignments")
      .then(setAssignments)
      .finally(() => setLoading(false));
  }, []);
  async function choose(id: string) {
    setSelected(id);
    const a = assignments.find((x) => x._id === id);
    if (a)
      setStudents(
        await api<Row[]>(
          `/people/students?courseId=${a.courseId._id}&departmentId=${a.departmentId._id}&sectionId=${a.sectionId._id}`,
        ),
      );
  }
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const records = students.map((s) => ({
      studentId: s._id,
      status: fd.get(`status-${s._id}`),
    }));
    try {
      await api("/attendance/sessions", {
        method: "POST",
        body: JSON.stringify({
          assignmentId: selected,
          date: fd.get("date"),
          period: Number(fd.get("period")),
          records,
        }),
      });
      setMessage("Attendance submitted and absence alerts created.");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Submission failed");
    }
  }
  if (loading)
    return <LoaderCircle className="mt-10 animate-spin text-brand-600" />;
  if (view === "timetable")
    return (
      <>
        <PortalTabs
          active="timetable"
          onChange={setView}
          timetableLabel="My Timetable"
        />
        <TimetableWorkspace mode="teacher" />
      </>
    );
  return (
    <>
      <PortalTabs
        active="work"
        onChange={setView}
        timetableLabel="My Timetable"
      />
      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-soft">
          <h2 className="font-bold">Assigned classes</h2>
          <div className="mt-4 space-y-2">
            {assignments.length ? (
              assignments.map((a) => (
                <button
                  onClick={() => choose(a._id)}
                  key={a._id}
                  className={`w-full rounded-xl border p-3 text-left text-sm ${selected === a._id ? "border-brand-500 bg-brand-50" : "border-slate-200"}`}
                >
                  <b>{a.subjectId?.name}</b>
                  <p className="text-xs text-slate-500">
                    {a.courseId?.name} · {a.departmentId?.name} ·{" "}
                    {a.sectionId?.name}
                  </p>
                </button>
              ))
            ) : (
              <Empty text="No assignments yet" />
            )}
          </div>
        </section>
        <form
          onSubmit={submit}
          className="rounded-2xl border border-slate-200 bg-white p-5 shadow-soft lg:col-span-2"
        >
          <h2 className="font-bold">Take period attendance</h2>
          <div className="my-4 flex gap-3">
            <label className="text-sm font-semibold">
              Attendance Date
              <input
                required
                name="date"
                type="date"
                className="mt-1 block rounded-lg border p-2 text-sm font-normal"
              />
            </label>
            <label className="text-sm font-semibold">
              Period Number
              <input
                required
                name="period"
                type="number"
                min="1"
                max="12"
                placeholder="1–12"
                className="mt-1 block w-28 rounded-lg border p-2 text-sm font-normal"
              />
            </label>
          </div>
          {students.length ? (
            <div className="space-y-2">
              {students.map((s) => (
                <div
                  key={s._id}
                  className="flex items-center justify-between rounded-xl bg-slate-50 p-3"
                >
                  <span>
                    <b className="text-sm">{s.name}</b>
                    <small className="ml-2 text-slate-500">
                      {s.rollNumber}
                    </small>
                  </span>
                  <select
                    name={`status-${s._id}`}
                    className="rounded-lg border bg-white p-2 text-sm"
                  >
                    <option value="present">Present</option>
                    <option value="absent">Absent</option>
                    <option value="late">Late</option>
                    <option value="excused">Excused</option>
                  </select>
                </div>
              ))}
              <button className="mt-4 w-full rounded-xl bg-brand-600 py-3 font-semibold text-white">
                Submit attendance
              </button>
            </div>
          ) : (
            <Empty text="Select an assigned class" />
          )}
          {message && (
            <p className="mt-4 rounded-lg bg-brand-50 p-3 text-sm text-brand-700">
              {message}
            </p>
          )}
        </form>
      </div>
    </>
  );
}

function ParentWorkspace() {
  const [view, setView] = useState<"work" | "timetable">("work");
  const [children, setChildren] = useState<Row[]>([]);
  const [selected, setSelected] = useState("");
  const [summary, setSummary] = useState<any>(null);
  const [results, setResults] = useState<Row[]>([]);
  const [events, setEvents] = useState<Row[]>([]);
  const [notifications, setNotifications] = useState<Row[]>([]);
  const load = useCallback(async () => {
    const [c, r, e, n] = await Promise.all([
      api<Row[]>("/people/students"),
      api<Row[]>("/results"),
      api<Row[]>("/events"),
      api<Row[]>("/notifications"),
    ]);
    setChildren(c);
    setResults(r);
    setEvents(e);
    setNotifications(n);
    if (c[0]) setSelected(c[0]._id);
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    if (selected) api(`/attendance/summary/${selected}`).then(setSummary);
  }, [selected]);
  const child = children.find((c) => c._id === selected);
  return (
    <div className="mt-8 space-y-6">
      <PortalTabs
        active={view}
        onChange={setView}
        timetableLabel="Class Timetable"
      />
      <div className="flex gap-3 overflow-x-auto">
        {children.length ? (
          children.map((c) => (
            <button
              onClick={() => setSelected(c._id)}
              key={c._id}
              className={`min-w-52 rounded-2xl border p-4 text-left ${selected === c._id ? "border-brand-500 bg-brand-50" : "border-slate-200 bg-white"}`}
            >
              <b>{c.name}</b>
              <p className="text-xs text-slate-500">
                {c.rollNumber} · {c.courseId?.name} · {c.departmentId?.name}
              </p>
            </button>
          ))
        ) : (
          <Empty text="No linked children" />
        )}
      </div>
      {view === "timetable" && selected && (
        <TimetableWorkspace mode="parent" studentId={selected} />
      )}
      {view === "work" && (
        <>
          {child && (
            <div className="grid gap-4 sm:grid-cols-3">
              <Card
                icon={ClipboardCheck}
                label="Attendance"
                value={`${summary?.percentage ?? 0}%`}
              />
              <Card
                icon={BookOpen}
                label="Published results"
                value={String(
                  results.filter((r) => r.studentId?._id === selected).length,
                )}
              />
              <Card
                icon={Bell}
                label="Unread alerts"
                value={String(notifications.filter((n) => !n.readAt).length)}
              />
            </div>
          )}
          <div className="grid gap-6 lg:grid-cols-2">
            <List
              title="Published results"
              rows={results.filter((r) => r.studentId?._id === selected)}
              render={(r) =>
                `${r.examinationId?.name} · ${r.subjectId?.name}: ${r.marks}/${r.maxMarks} · Total ${r.totalMarks}/${r.totalMaxMarks} (${r.percentage}%)`
              }
            />
            <List
              title="Events and announcements"
              rows={events}
              render={(e) =>
                `${e.title} · ${new Date(e.startsAt).toLocaleDateString()}`
              }
            />
            <List
              title="Notifications"
              rows={notifications}
              render={(n) => `${n.title} — ${n.message}`}
            />
          </div>
          {selected && <ParentAttendanceCalendar studentId={selected} />}
        </>
      )}
    </div>
  );
}
function PortalTabs({
  active,
  onChange,
  timetableLabel,
}: {
  active: "work" | "timetable";
  onChange: (value: "work" | "timetable") => void;
  timetableLabel: string;
}) {
  return (
    <nav className="flex gap-2">
      <button
        onClick={() => onChange("work")}
        className={`flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold ${active === "work" ? "bg-slate-900 text-white" : "border border-slate-200 bg-white"}`}
      >
        <ClipboardCheck size={17} />
        Overview
      </button>
      <button
        onClick={() => onChange("timetable")}
        className={`flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold ${active === "timetable" ? "bg-slate-900 text-white" : "border border-slate-200 bg-white"}`}
      >
        <CalendarClock size={17} />
        {timetableLabel}
      </button>
    </nav>
  );
}
function Card({
  icon: Icon,
  label,
  value,
}: {
  icon: any;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-soft">
      <Icon className="text-brand-600" />
      <p className="mt-4 text-2xl font-bold">{value}</p>
      <p className="text-sm text-slate-500">{label}</p>
    </div>
  );
}
function Empty({ text }: { text: string }) {
  return <div className="py-8 text-center text-sm text-slate-500">{text}</div>;
}
function List({
  title,
  rows,
  render,
}: {
  title: string;
  rows: Row[];
  render: (r: Row) => string;
}) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-soft">
      <h2 className="font-bold">{title}</h2>
      <div className="mt-3 space-y-2">
        {rows.length ? (
          rows.map((r) => (
            <div key={r._id} className="rounded-xl bg-slate-50 p-3 text-sm">
              {render(r)}
            </div>
          ))
        ) : (
          <Empty text="No records available" />
        )}
      </div>
    </section>
  );
}
