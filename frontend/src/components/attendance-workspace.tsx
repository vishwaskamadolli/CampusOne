"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  CalendarDays,
  Check,
  CheckCircle2,
  Download,
  FileClock,
  GraduationCap,
  History,
  LoaderCircle,
  Search,
  ShieldCheck,
  UserRound,
  UsersRound,
  X,
  XCircle,
} from "lucide-react";
import { api } from "@/lib/api";
import { toastAction, toastError } from "@/lib/toast";
import { Pagination, usePagination } from "@/components/pagination";
import {
  SearchableSelect,
  type SearchableSelectOption,
} from "@/components/searchable-select";

type Row = Record<string, any> & { _id: string };
type Report = { rows: Row[]; total: number; counts: Record<string, number> };
const localDate = () => {
  const date = new Date();
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 10);
};

export function AttendanceWorkspace() {
  const today = localDate();
  const month = today.slice(0, 7);
  const [from, setFrom] = useState(`${month}-01`);
  const [to, setTo] = useState(today);
  const [courseId, setCourseId] = useState("");
  const [studentId, setStudentId] = useState("");
  const [classes, setClasses] = useState<Row[]>([]);
  const [students, setStudents] = useState<Row[]>([]);
  const [report, setReport] = useState<Report>({
    rows: [],
    total: 0,
    counts: {},
  });
  const [corrections, setCorrections] = useState<Row[]>([]);
  const [audits, setAudits] = useState<Row[]>([]);
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [statuses, setStatuses] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const recordsPagination = usePagination(report.rows);
  const pendingCorrections = useMemo(
    () => corrections.filter((item) => item.status === "pending"),
    [corrections],
  );
  const classOptions = useMemo<SearchableSelectOption[]>(
    () => [
      {
        value: "",
        label: "All classes",
        description: "Include every class in the report",
      },
      ...classes.map((item) => ({
        value: item._id,
        label: item.name || "Unnamed class",
        description: "Class",
      })),
    ],
    [classes],
  );
  const studentOptions = useMemo<SearchableSelectOption[]>(
    () => [
      {
        value: "",
        label: "All students",
        description: "Include every student in the report",
      },
      ...students.map((item) => ({
        value: item._id,
        label: item.name || "Unnamed student",
        description: [
          item.rollNumber ? `Roll ${item.rollNumber}` : "",
          item.courseId?.name,
          item.sectionId?.name ? `Section ${item.sectionId.name}` : "",
        ]
          .filter(Boolean)
          .join(" · "),
      })),
    ],
    [students],
  );
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const query = new URLSearchParams({
        from,
        to,
        ...(courseId ? { courseId } : {}),
        ...(studentId ? { studentId } : {}),
      });
      const [data, pending, history] = await Promise.all([
        api<Report>(`/attendance/reports?${query}`),
        api<Row[]>("/attendance/corrections"),
        api<Row[]>(
          `/attendance/audits${studentId ? `?studentId=${studentId}` : ""}`,
        ),
      ]);
      setReport(data);
      setCorrections(pending);
      setAudits(history);
    } catch (error) {
      toastError(error);
    } finally {
      setLoading(false);
    }
  }, [from, to, courseId, studentId]);
  useEffect(() => {
    Promise.all([
      api<Row[]>("/academics/classes"),
      api<Row[]>("/people/students"),
    ])
      .then(([c, s]) => {
        setClasses(c);
        setStudents(s);
      })
      .catch(toastError);
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  async function review(item: Row, status: "approved" | "rejected") {
    await toastAction(
      () =>
        api(`/attendance/corrections/${item._id}`, {
          method: "PATCH",
          body: JSON.stringify({ status, reason: reasons[item._id] }),
        }),
      { loading: "Updating correction…", success: `Correction ${status}` },
    );
    await load();
  }
  async function correct(row: Row) {
    await toastAction(
      () =>
        api(
          `/attendance/sessions/${row.session._id}/records/${row.studentId._id}`,
          {
            method: "PATCH",
            body: JSON.stringify({
              status: statuses[row._id] || row.status,
              reason: reasons[row._id],
            }),
          },
        ),
      { loading: "Correcting attendance…", success: "Attendance corrected" },
    );
    await load();
  }
  function exportExcel() {
    const headers = [
      "Date",
      "Period",
      "Class",
      "Section",
      "Subject",
      "Student",
      "Roll Number",
      "Status",
    ];
    const lines = report.rows.map((row) => [
      row.session?.date,
      row.session?.period,
      row.session?.courseId?.name,
      row.session?.sectionId?.name,
      row.session?.subjectId?.name,
      row.studentId?.name,
      row.studentId?.rollNumber,
      row.status,
    ]);
    const csv = [headers, ...lines]
      .map((line) =>
        line
          .map((cell) => `"${String(cell ?? "").replaceAll('"', '""')}"`)
          .join(","),
      )
      .join("\n");
    const link = document.createElement("a");
    link.href = URL.createObjectURL(
      new Blob([csv], { type: "text/csv;charset=utf-8" }),
    );
    link.download = `attendance-${from}-${to}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
  }

  const isToday = from === today && to === today;
  const isThisMonth = from === `${month}-01` && to === today;

  return (
    <section className="space-y-6">
      <header className="relative overflow-hidden rounded-3xl bg-slate-900 from-slate-950 via-slate-900 to-brand-900 px-5 py-6 text-white shadow-soft sm:px-7 sm:py-7">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -right-10 -top-20 h-56 w-56 rounded-full bg-brand-500/20 blur-3xl"
        />
        <div className="relative flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
          <div>
            <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] text-emerald-200">
              <Activity size={14} />
              Campus operations
            </p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">
              Attendance
            </h1>
            <p className="mt-2 max-w-xl text-sm leading-relaxed text-slate-300">
              Explore attendance trends, review requested changes, and keep a
              clear record of every correction.
            </p>
          </div>
          <button
            type="button"
            onClick={exportExcel}
            disabled={!report.rows.length || loading}
            className="relative flex shrink-0 items-center justify-center gap-2 rounded-xl bg-white px-4 py-3 text-sm font-semibold text-slate-900 shadow-sm transition hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Download size={17} className="text-brand-700" />
            Export report
          </button>
        </div>
      </header>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <AttendanceMetric
          label="Attendance records"
          value={report.total}
          detail="In the selected date range"
          icon={<UsersRound size={19} />}
          tone="brand"
        />
        <AttendanceMetric
          label="Present"
          value={report.counts.present || 0}
          detail="Marked present"
          icon={<CheckCircle2 size={19} />}
          tone="emerald"
        />
        <AttendanceMetric
          label="Absent"
          value={report.counts.absent || 0}
          detail="Needs attention"
          icon={<XCircle size={19} />}
          tone="rose"
        />
        <AttendanceMetric
          label="Pending reviews"
          value={pendingCorrections.length}
          detail="Correction requests"
          icon={<FileClock size={19} />}
          tone="amber"
        />
      </div>

      <section className="overflow-visible rounded-2xl border border-slate-200 bg-white p-4 shadow-soft sm:p-5">
        <div className="flex flex-col justify-between gap-4 border-b border-slate-100 pb-4 sm:flex-row sm:items-center">
          <div>
            <h2 className="text-base font-bold text-slate-900">
              Report filters
            </h2>
            <p className="mt-1 text-xs text-slate-500">
              Select a date range and narrow the report by class or student.
            </p>
          </div>
          <div className="flex w-full gap-2 sm:w-auto">
            <button
              type="button"
              aria-pressed={isToday}
              onClick={() => {
                setFrom(today);
                setTo(today);
              }}
              className={`flex-1 rounded-xl border px-3 py-2 text-xs font-semibold transition sm:flex-none ${
                isToday
                  ? "border-brand-200 bg-brand-50 text-brand-700"
                  : "border-slate-200 text-slate-600 hover:bg-slate-50"
              }`}
            >
              Today
            </button>
            <button
              type="button"
              aria-pressed={isThisMonth}
              onClick={() => {
                setFrom(`${month}-01`);
                setTo(today);
              }}
              className={`flex-1 rounded-xl border px-3 py-2 text-xs font-semibold transition sm:flex-none ${
                isThisMonth
                  ? "border-brand-200 bg-brand-50 text-brand-700"
                  : "border-slate-200 text-slate-600 hover:bg-slate-50"
              }`}
            >
              This month
            </button>
          </div>
        </div>

        <div className="grid gap-4 pt-4 sm:grid-cols-2 xl:grid-cols-4">
          <label className="text-xs font-semibold text-slate-600">
            From date
            <input
              type="date"
              value={from}
              onChange={(event) => setFrom(event.target.value)}
              className="mt-1.5 h-12 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 shadow-sm outline-none transition hover:border-slate-300 focus:border-brand-500 focus:ring-4 focus:ring-brand-100"
            />
          </label>
          <label className="text-xs font-semibold text-slate-600">
            To date
            <input
              type="date"
              value={to}
              onChange={(event) => setTo(event.target.value)}
              className="mt-1.5 h-12 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 shadow-sm outline-none transition hover:border-slate-300 focus:border-brand-500 focus:ring-4 focus:ring-brand-100"
            />
          </label>
          <div>
            <p className="mb-1.5 text-xs font-semibold text-slate-600">Class</p>
            <SearchableSelect
              label="Class"
              value={courseId}
              options={classOptions}
              onChange={setCourseId}
              placeholder="All classes"
              searchPlaceholder="Search classes..."
              icon={<GraduationCap size={16} />}
            />
          </div>
          <div>
            <p className="mb-1.5 text-xs font-semibold text-slate-600">
              Student
            </p>
            <SearchableSelect
              label="Student"
              value={studentId}
              options={studentOptions}
              onChange={setStudentId}
              placeholder="All students"
              searchPlaceholder="Search name or roll number..."
              icon={<UserRound size={16} />}
            />
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-4">
          <span className="mr-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
            Other statuses
          </span>
          <AttendanceStatusBadge
            status="late"
            count={report.counts.late || 0}
          />
          <AttendanceStatusBadge
            status="excused"
            count={report.counts.excused || 0}
          />
          {loading && (
            <span className="ml-auto inline-flex items-center gap-2 text-xs text-slate-400">
              <LoaderCircle size={14} className="animate-spin" />
              Updating report
            </span>
          )}
        </div>
      </section>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-soft">
        <div className="flex flex-col justify-between gap-3 border-b border-slate-100 px-4 py-4 sm:flex-row sm:items-center sm:px-5">
          <div className="flex items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-brand-50 text-brand-700">
              <CalendarDays size={19} />
            </span>
            <div>
              <h2 className="font-bold text-slate-900">Attendance records</h2>
              <p className="mt-0.5 text-xs text-slate-500">
                {report.total} {report.total === 1 ? "record" : "records"} in
                this report
              </p>
            </div>
          </div>
          <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1.5 text-[11px] font-semibold text-slate-600">
            <CalendarDays size={13} />
            {from} – {to}
          </span>
        </div>

        {loading ? (
          <div className="space-y-3 p-4 sm:p-5">
            {[1, 2, 3].map((item) => (
              <div
                key={item}
                className="h-20 animate-pulse rounded-xl bg-slate-100"
              />
            ))}
          </div>
        ) : report.rows.length ? (
          <>
            <div className="hidden overflow-x-auto lg:block">
              <table className="w-full min-w-[1100px] text-left text-sm">
                <thead className="bg-slate-50 text-[10px] uppercase tracking-[0.12em] text-slate-500">
                  <tr>
                    <th className="px-5 py-3 font-semibold">Date / period</th>
                    <th className="px-4 py-3 font-semibold">Student</th>
                    <th className="px-4 py-3 font-semibold">Class</th>
                    <th className="px-4 py-3 font-semibold">Subject</th>
                    <th className="px-4 py-3 font-semibold">Status</th>
                    <th className="w-[300px] px-4 py-3 font-semibold">
                      Direct correction
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {recordsPagination.paginatedItems.map((row) => (
                    <tr
                      key={row._id}
                      className="align-top transition hover:bg-slate-50/60"
                    >
                      <td className="whitespace-nowrap px-5 py-4">
                        <p className="font-semibold text-slate-800">
                          {row.session?.date}
                        </p>
                        <p className="mt-1 text-xs text-slate-500">
                          Period {row.session?.period}
                        </p>
                      </td>
                      <td className="px-4 py-4">
                        <p className="font-semibold text-slate-800">
                          {row.studentId?.name || "Unknown student"}
                        </p>
                        <p className="mt-1 text-xs text-slate-500">
                          {row.studentId?.rollNumber || "No roll number"}
                        </p>
                      </td>
                      <td className="px-4 py-4">
                        <p className="font-medium text-slate-700">
                          {row.session?.courseId?.name}
                        </p>
                        <p className="mt-1 text-xs text-slate-500">
                          {row.session?.departmentId?.name} · Section{" "}
                          {row.session?.sectionId?.name}
                        </p>
                      </td>
                      <td className="px-4 py-4 text-slate-700">
                        {row.session?.subjectId?.name || "—"}
                      </td>
                      <td className="px-4 py-4">
                        <AttendanceStatusBadge status={row.status} />
                      </td>
                      <td className="px-4 py-4">
                        <AttendanceCorrectionEditor
                          row={row}
                          status={statuses[row._id] || row.status}
                          reason={reasons[row._id] || ""}
                          onStatusChange={(value) =>
                            setStatuses((current) => ({
                              ...current,
                              [row._id]: value,
                            }))
                          }
                          onReasonChange={(value) =>
                            setReasons((current) => ({
                              ...current,
                              [row._id]: value,
                            }))
                          }
                          onSave={() => void correct(row).catch(toastError)}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="divide-y divide-slate-100 lg:hidden">
              {recordsPagination.paginatedItems.map((row) => (
                <article key={row._id} className="space-y-4 p-4 sm:p-5">
                  <div className="flex items-start gap-3">
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand-50 text-sm font-bold text-brand-700">
                      {(row.studentId?.name || "?")
                        .split(" ")
                        .map((part: string) => part[0])
                        .slice(0, 2)
                        .join("")
                        .toUpperCase()}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <h3 className="truncate text-sm font-bold text-slate-900">
                          {row.studentId?.name || "Unknown student"}
                        </h3>
                        <AttendanceStatusBadge status={row.status} />
                      </div>
                      <p className="mt-1 text-xs text-slate-500">
                        {row.studentId?.rollNumber || "No roll number"}
                      </p>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3 rounded-xl bg-slate-50 p-3 text-xs">
                    <div>
                      <p className="text-slate-400">Date / period</p>
                      <p className="mt-1 font-semibold text-slate-700">
                        {row.session?.date} · P{row.session?.period}
                      </p>
                    </div>
                    <div>
                      <p className="text-slate-400">Subject</p>
                      <p className="mt-1 font-semibold text-slate-700">
                        {row.session?.subjectId?.name || "—"}
                      </p>
                    </div>
                    <div className="col-span-2">
                      <p className="text-slate-400">Class / stream / section</p>
                      <p className="mt-1 font-semibold text-slate-700">
                        {row.session?.courseId?.name} ·{" "}
                        {row.session?.departmentId?.name} ·{" "}
                        {row.session?.sectionId?.name}
                      </p>
                    </div>
                  </div>
                  <div>
                    <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">
                      Correct attendance
                    </p>
                    <AttendanceCorrectionEditor
                      row={row}
                      status={statuses[row._id] || row.status}
                      reason={reasons[row._id] || ""}
                      onStatusChange={(value) =>
                        setStatuses((current) => ({
                          ...current,
                          [row._id]: value,
                        }))
                      }
                      onReasonChange={(value) =>
                        setReasons((current) => ({
                          ...current,
                          [row._id]: value,
                        }))
                      }
                      onSave={() => void correct(row).catch(toastError)}
                    />
                  </div>
                </article>
              ))}
            </div>
            <Pagination
              page={recordsPagination.page}
              pageCount={recordsPagination.pageCount}
              pageSize={recordsPagination.pageSize}
              total={report.rows.length}
              onPageChange={recordsPagination.setPage}
              onPageSizeChange={(size) => {
                recordsPagination.setPageSize(size);
                recordsPagination.setPage(1);
              }}
            />
          </>
        ) : (
          <div className="px-5 py-14 text-center">
            <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-slate-100 text-slate-400">
              <Search size={21} />
            </span>
            <h3 className="mt-4 text-sm font-bold text-slate-800">
              No attendance records found
            </h3>
            <p className="mx-auto mt-1 max-w-sm text-xs leading-relaxed text-slate-500">
              Try a different date range or clear the class and student filters
              to see more records.
            </p>
          </div>
        )}
      </section>

      <div className="grid gap-6 xl:grid-cols-2">
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-soft">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-4 sm:px-5">
            <div className="flex items-center gap-3">
              <span className="grid h-10 w-10 place-items-center rounded-xl bg-amber-50 text-amber-700">
                <FileClock size={19} />
              </span>
              <div>
                <h2 className="font-bold text-slate-900">
                  Correction requests
                </h2>
                <p className="mt-0.5 text-xs text-slate-500">
                  Review teacher-submitted changes
                </p>
              </div>
            </div>
            <span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-bold text-amber-700">
              {pendingCorrections.length} pending
            </span>
          </div>
          <div className="max-h-[600px] space-y-3 overflow-y-auto p-4 sm:p-5">
            {pendingCorrections.map((item) => (
              <article
                key={item._id}
                className="rounded-2xl border border-slate-200 bg-white p-4 transition hover:border-amber-200 hover:shadow-sm"
              >
                <div className="flex items-start gap-3">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-amber-50 text-sm font-bold text-amber-700">
                    {(item.requestedBy?.name || "T")
                      .split(" ")
                      .map((part: string) => part[0])
                      .slice(0, 2)
                      .join("")
                      .toUpperCase()}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm font-bold text-slate-800">
                        {item.requestedBy?.name || "Teacher"}
                      </p>
                      <span className="rounded-full bg-amber-50 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-amber-700">
                        Awaiting review
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-slate-500">
                      {item.sessionId?.courseId?.name} ·{" "}
                      {item.sessionId?.departmentId?.name} ·{" "}
                      {item.sessionId?.sectionId?.name}
                    </p>
                  </div>
                </div>
                <div className="mt-3 rounded-xl bg-slate-50 p-3">
                  <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">
                    Request reason
                  </p>
                  <p className="mt-1 text-xs leading-relaxed text-slate-700">
                    {item.reason}
                  </p>
                  {item.changes?.length > 0 && (
                    <p className="mt-2 text-[11px] font-medium text-slate-500">
                      {item.changes.length} attendance{" "}
                      {item.changes.length === 1 ? "entry" : "entries"}{" "}
                      requested for correction
                    </p>
                  )}
                </div>
                <label className="mt-3 block text-[11px] font-semibold text-slate-600">
                  Review note <span className="text-rose-500">*</span>
                  <input
                    value={reasons[item._id] || ""}
                    onChange={(event) =>
                      setReasons((current) => ({
                        ...current,
                        [item._id]: event.target.value,
                      }))
                    }
                    placeholder="Add a reason for your decision"
                    className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs font-normal text-slate-700 outline-none transition placeholder:text-slate-400 focus:border-brand-500 focus:ring-4 focus:ring-brand-100"
                  />
                </label>
                <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                  <button
                    type="button"
                    disabled={!reasons[item._id]?.trim()}
                    onClick={() =>
                      void review(item, "approved").catch(toastError)
                    }
                    className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-brand-600 px-3 py-2.5 text-xs font-semibold text-white transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <Check size={15} />
                    Approve request
                  </button>
                  <button
                    type="button"
                    disabled={!reasons[item._id]?.trim()}
                    onClick={() =>
                      void review(item, "rejected").catch(toastError)
                    }
                    className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl border border-rose-200 bg-white px-3 py-2.5 text-xs font-semibold text-rose-700 transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <X size={15} />
                    Reject request
                  </button>
                </div>
              </article>
            ))}
            {!pendingCorrections.length && (
              <div className="py-10 text-center">
                <span className="mx-auto grid h-11 w-11 place-items-center rounded-xl bg-emerald-50 text-emerald-600">
                  <ShieldCheck size={20} />
                </span>
                <p className="mt-3 text-sm font-semibold text-slate-700">
                  All caught up
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  There are no pending correction requests.
                </p>
              </div>
            )}
          </div>
        </section>

        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-soft">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-4 sm:px-5">
            <div className="flex items-center gap-3">
              <span className="grid h-10 w-10 place-items-center rounded-xl bg-violet-50 text-violet-700">
                <History size={19} />
              </span>
              <div>
                <h2 className="font-bold text-slate-900">Audit history</h2>
                <p className="mt-0.5 text-xs text-slate-500">
                  Latest attendance changes
                </p>
              </div>
            </div>
            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">
              Latest 20
            </span>
          </div>
          <div className="max-h-[600px] space-y-1 overflow-y-auto p-4 sm:p-5">
            {audits.slice(0, 20).map((audit) => (
              <article
                key={audit._id}
                className="relative flex gap-3 rounded-xl p-3 transition hover:bg-slate-50"
              >
                <span className="relative z-10 grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-violet-50 text-violet-700">
                  <History size={16} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <p className="text-xs font-bold text-slate-800">
                      {audit.studentId?.name || "Student"}
                    </p>
                    <span className="text-[11px] text-slate-400">changed</span>
                    <AttendanceStatusBadge status={audit.previousStatus} />
                    <span className="text-[11px] text-slate-400">to</span>
                    <AttendanceStatusBadge status={audit.newStatus} />
                  </div>
                  <p className="mt-1.5 text-xs leading-relaxed text-slate-600">
                    {audit.reason}
                  </p>
                  <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] text-slate-400">
                    <span>{audit.actorId?.name || "Admin"}</span>
                    {audit.createdAt && (
                      <>
                        <span aria-hidden="true">·</span>
                        <time dateTime={audit.createdAt}>
                          {new Date(audit.createdAt).toLocaleString("en-IN", {
                            day: "2-digit",
                            month: "short",
                            year: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </time>
                      </>
                    )}
                  </p>
                </div>
              </article>
            ))}
            {!audits.length && (
              <div className="py-10 text-center">
                <span className="mx-auto grid h-11 w-11 place-items-center rounded-xl bg-slate-100 text-slate-400">
                  <History size={20} />
                </span>
                <p className="mt-3 text-sm font-semibold text-slate-700">
                  No corrections recorded
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  Approved attendance changes will appear here.
                </p>
              </div>
            )}
          </div>
        </section>
      </div>
    </section>
  );
}

const attendanceStatuses: SearchableSelectOption[] = [
  { value: "present", label: "Present", description: "Student attended" },
  { value: "absent", label: "Absent", description: "Student did not attend" },
  { value: "late", label: "Late", description: "Student arrived late" },
  { value: "excused", label: "Excused", description: "Absence was excused" },
];

function AttendanceMetric({
  label,
  value,
  detail,
  icon,
  tone,
}: {
  label: string;
  value: number;
  detail: string;
  icon: React.ReactNode;
  tone: "brand" | "emerald" | "rose" | "amber";
}) {
  const tones = {
    brand: "bg-brand-50 text-brand-700",
    emerald: "bg-emerald-50 text-emerald-700",
    rose: "bg-rose-50 text-rose-700",
    amber: "bg-amber-50 text-amber-700",
  };
  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-soft sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium text-slate-500">{label}</p>
          <p className="mt-2 text-2xl font-bold tracking-tight text-slate-900">
            {value.toLocaleString()}
          </p>
          <p className="mt-1 text-[11px] text-slate-400">{detail}</p>
        </div>
        <span className={`rounded-xl p-2.5 ${tones[tone]}`}>{icon}</span>
      </div>
    </article>
  );
}

function AttendanceStatusBadge({
  status,
  count,
}: {
  status: string;
  count?: number;
}) {
  const tones: Record<string, string> = {
    present: "bg-emerald-50 text-emerald-700 ring-emerald-600/10",
    absent: "bg-rose-50 text-rose-700 ring-rose-600/10",
    late: "bg-amber-50 text-amber-700 ring-amber-600/10",
    excused: "bg-slate-100 text-slate-600 ring-slate-500/10",
  };
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-bold capitalize ring-1 ring-inset ${
        tones[status] || tones.excused
      }`}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {status}
      {count !== undefined && (
        <span className="ml-0.5 opacity-75">{count}</span>
      )}
    </span>
  );
}

function AttendanceCorrectionEditor({
  row,
  status,
  reason,
  onStatusChange,
  onReasonChange,
  onSave,
}: {
  row: Row;
  status: string;
  reason: string;
  onStatusChange: (value: string) => void;
  onReasonChange: (value: string) => void;
  onSave: () => void;
}) {
  return (
    <div className="space-y-2.5">
      <div
        role="group"
        aria-label={`Choose corrected attendance status for ${row.studentId?.name || "student"}`}
        className="grid grid-cols-2 gap-1.5"
      >
        {attendanceStatuses.map((option) => (
          <button
            key={option.value}
            type="button"
            aria-pressed={status === option.value}
            onClick={() => onStatusChange(option.value)}
            className={`rounded-lg border px-2 py-2 text-[11px] font-semibold capitalize transition ${
              status === option.value
                ? option.value === "present"
                  ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                  : option.value === "absent"
                    ? "border-rose-200 bg-rose-50 text-rose-700"
                    : option.value === "late"
                      ? "border-amber-200 bg-amber-50 text-amber-700"
                      : "border-slate-300 bg-slate-100 text-slate-700"
                : "border-slate-200 bg-white text-slate-500 hover:bg-slate-50"
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>
      <div className="flex gap-2">
        <input
          value={reason}
          onChange={(event) => onReasonChange(event.target.value)}
          aria-label={`Reason for correcting ${row.studentId?.name || "student"} attendance`}
          placeholder="Required reason"
          className="h-10 min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-3 text-xs text-slate-700 shadow-sm outline-none transition placeholder:text-slate-400 hover:border-slate-300 focus:border-brand-500 focus:ring-4 focus:ring-brand-100"
        />
        <button
          type="button"
          disabled={!reason.trim()}
          onClick={onSave}
          className="inline-flex h-10 shrink-0 items-center justify-center gap-1.5 rounded-xl bg-slate-900 px-3 text-xs font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Check size={14} />
          Save
        </button>
      </div>
    </div>
  );
}
