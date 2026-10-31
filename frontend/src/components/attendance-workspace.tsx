"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  BookOpen,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronDown,
  Download,
  FileClock,
  GraduationCap,
  History,
  Layers3,
  LoaderCircle,
  Search,
  ShieldCheck,
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
  const [departmentId, setDepartmentId] = useState("");
  const [sectionId, setSectionId] = useState("");
  const [classes, setClasses] = useState<Row[]>([]);
  const [streams, setStreams] = useState<Row[]>([]);
  const [sections, setSections] = useState<Row[]>([]);
  const [report, setReport] = useState<Report>({
    rows: [],
    total: 0,
    counts: {},
  });
  const [corrections, setCorrections] = useState<Row[]>([]);
  const [audits, setAudits] = useState<Row[]>([]);
  const [auditDate, setAuditDate] = useState("");
  const [auditCourseId, setAuditCourseId] = useState("");
  const [auditDepartmentId, setAuditDepartmentId] = useState("");
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [statuses, setStatuses] = useState<Record<string, string>>({});
  const [recordSearch, setRecordSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [correctionsExpanded, setCorrectionsExpanded] = useState(false);

  const filteredAudits = useMemo(() => {
    return audits.filter((audit) => {
      if (auditDate) {
        const sessionDate = audit.sessionId?.date;
        const createdDate = audit.createdAt
          ? new Date(audit.createdAt).toISOString().slice(0, 10)
          : "";
        if (sessionDate !== auditDate && createdDate !== auditDate) {
          return false;
        }
      }
      if (auditCourseId) {
        const sessionCourse =
          audit.sessionId?.courseId?._id || audit.sessionId?.courseId;
        const studentCourse =
          audit.studentId?.courseId?._id || audit.studentId?.courseId;
        if (
          String(sessionCourse || "") !== auditCourseId &&
          String(studentCourse || "") !== auditCourseId
        ) {
          return false;
        }
      }
      if (auditDepartmentId) {
        const sessionDept =
          audit.sessionId?.departmentId?._id || audit.sessionId?.departmentId;
        const studentDept =
          audit.studentId?.departmentId?._id || audit.studentId?.departmentId;
        if (
          String(sessionDept || "") !== auditDepartmentId &&
          String(studentDept || "") !== auditDepartmentId
        ) {
          return false;
        }
      }
      return true;
    });
  }, [audits, auditDate, auditCourseId, auditDepartmentId]);

  const searchedRows = useMemo(() => {
    const q = recordSearch.trim().toLowerCase();
    if (!q) return report.rows;
    return report.rows.filter((row) => {
      const studentName = (row.studentId?.name || "").toLowerCase();
      const rollNumber = (row.studentId?.rollNumber || "").toLowerCase();
      const subjectName = (row.session?.subjectId?.name || "").toLowerCase();
      const className = (row.session?.courseId?.name || "").toLowerCase();
      const streamName = (row.session?.departmentId?.name || "").toLowerCase();
      const sectionName = (row.session?.sectionId?.name || "").toLowerCase();
      const status = (row.status || "").toLowerCase();
      const date = (row.session?.date || "").toLowerCase();
      return (
        studentName.includes(q) ||
        rollNumber.includes(q) ||
        subjectName.includes(q) ||
        className.includes(q) ||
        streamName.includes(q) ||
        sectionName.includes(q) ||
        status.includes(q) ||
        date.includes(q)
      );
    });
  }, [report.rows, recordSearch]);

  const recordsPagination = usePagination(searchedRows);
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

  const streamOptions = useMemo<SearchableSelectOption[]>(
    () => [
      {
        value: "",
        label: "All streams",
        description: "Include every stream in the report",
      },
      ...streams.map((item) => ({
        value: item._id,
        label: item.name || "Unnamed stream",
        description: "Stream",
      })),
    ],
    [streams],
  );

  const filteredSections = useMemo(() => {
    return sections.filter((s) => {
      const matchCourse = !courseId || s.courseId?._id === courseId || s.courseId === courseId;
      const matchStream = !departmentId || s.departmentId?._id === departmentId || s.departmentId === departmentId;
      return matchCourse && matchStream;
    });
  }, [sections, courseId, departmentId]);

  const sectionOptions = useMemo<SearchableSelectOption[]>(
    () => [
      {
        value: "",
        label: "All sections",
        description: "Include every section in the report",
      },
      ...filteredSections.map((item) => {
        const cName = item.courseId?.name;
        const sName = item.departmentId?.name;
        const desc = [cName, sName].filter(Boolean).join(" · ") || "Section";
        return {
          value: item._id,
          label: `Section ${item.name || ""}`.trim(),
          description: desc,
        };
      }),
    ],
    [filteredSections],
  );

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const query = new URLSearchParams({
        from,
        to,
        ...(courseId ? { courseId } : {}),
        ...(departmentId ? { departmentId } : {}),
        ...(sectionId ? { sectionId } : {}),
      });
      const [data, pending, history] = await Promise.all([
        api<Report>(`/attendance/reports?${query}`),
        api<Row[]>("/attendance/corrections"),
        api<Row[]>("/attendance/audits"),
      ]);
      setReport(data);
      setCorrections(pending);
      setAudits(history);
    } catch (error) {
      toastError(error);
    } finally {
      setLoading(false);
    }
  }, [from, to, courseId, departmentId, sectionId]);

  useEffect(() => {
    Promise.all([
      api<Row[]>("/academics/classes"),
      api<Row[]>("/academics/streams"),
      api<Row[]>("/academics/sections"),
    ])
      .then(([c, str, sec]) => {
        setClasses(c);
        setStreams(str);
        setSections(sec);
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
  async function toggleStatus(row: Row, newStatus: "present" | "absent") {
    const studentName = row.studentId?.name || "Student";
    await toastAction(
      () =>
        api(
          `/attendance/sessions/${row.session._id}/records/${row.studentId._id}`,
          {
            method: "PATCH",
            body: JSON.stringify({
              status: newStatus,
              reason: `Direct status toggle to ${newStatus}`,
            }),
          },
        ),
      {
        loading: `Updating ${studentName} to ${newStatus}…`,
        success: `${studentName} marked ${newStatus}`,
      },
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

      {/* Collapsible Correction requests section */}
      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-soft transition-all">
        <button
          type="button"
          onClick={() => setCorrectionsExpanded((prev) => !prev)}
          className="flex w-full cursor-pointer items-center justify-between p-4 text-left transition select-none hover:bg-slate-50/80 sm:px-5"
          aria-expanded={correctionsExpanded}
        >
          <div className="flex items-center gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-amber-50 text-amber-700">
              <FileClock size={19} />
            </span>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="font-bold text-slate-900">
                  Correction requests
                </h2>
                <span
                  className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${
                    pendingCorrections.length > 0
                      ? "bg-amber-100 text-amber-800"
                      : "bg-slate-100 text-slate-600"
                  }`}
                >
                  {pendingCorrections.length} pending
                </span>
              </div>
              <p className="mt-0.5 text-xs text-slate-500">
                Review teacher-submitted changes
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-slate-500">
              {correctionsExpanded ? "Hide" : "Show"}
            </span>
            <span
              className={`grid h-8 w-8 place-items-center rounded-lg border border-slate-200 bg-white text-slate-500 transition-transform duration-200 ${
                correctionsExpanded ? "rotate-180" : ""
              }`}
            >
              <ChevronDown size={16} />
            </span>
          </div>
        </button>

        {correctionsExpanded && (
          <div className="border-t border-slate-100 max-h-[600px] space-y-3 overflow-y-auto p-4 sm:p-5">
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
        )}
      </section>

      <section className="overflow-visible rounded-2xl border border-slate-200 bg-white p-4 shadow-soft sm:p-5">
        <div className="flex flex-col justify-between gap-4 border-b border-slate-100 pb-4 sm:flex-row sm:items-center">
          <div>
            <h2 className="text-base font-bold text-slate-900">
              Report filters
            </h2>
            <p className="mt-1 text-xs text-slate-500">
              Select a date range and narrow the report by class, stream, or section.
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

        <div className="grid gap-4 pt-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
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
              onChange={(val) => {
                setCourseId(val);
                setSectionId("");
              }}
              placeholder="All classes"
              searchPlaceholder="Search classes..."
              icon={<GraduationCap size={16} />}
            />
          </div>
          <div>
            <p className="mb-1.5 text-xs font-semibold text-slate-600">Stream</p>
            <SearchableSelect
              label="Stream"
              value={departmentId}
              options={streamOptions}
              onChange={(val) => {
                setDepartmentId(val);
                setSectionId("");
              }}
              placeholder="All streams"
              searchPlaceholder="Search streams..."
              icon={<Layers3 size={16} />}
            />
          </div>
          <div>
            <p className="mb-1.5 text-xs font-semibold text-slate-600">Section</p>
            <SearchableSelect
              label="Section"
              value={sectionId}
              options={sectionOptions}
              onChange={setSectionId}
              placeholder="All sections"
              searchPlaceholder="Search sections..."
              icon={<BookOpen size={16} />}
            />
          </div>
        </div>

        {loading && (
          <div className="mt-4 flex items-center justify-end border-t border-slate-100 pt-3">
            <span className="inline-flex items-center gap-2 text-xs text-slate-400">
              <LoaderCircle size={14} className="animate-spin" />
              Updating report
            </span>
          </div>
        )}
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
                {recordSearch
                  ? `${searchedRows.length} of ${report.total} records match search`
                  : `${report.total} ${report.total === 1 ? "record" : "records"} in this report`}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2.5">
            {/* Small search bar */}
            <div className="relative w-full sm:w-56">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
                <Search size={14} />
              </span>
              <input
                type="text"
                value={recordSearch}
                onChange={(e) => {
                  setRecordSearch(e.target.value);
                  recordsPagination.setPage(1);
                }}
                placeholder="Search records..."
                className="h-9 w-full rounded-xl border border-slate-200 bg-white pl-8 pr-7 text-xs font-medium text-slate-800 shadow-2xs placeholder:text-slate-400 focus:border-brand-500 focus:outline-hidden"
              />
              {recordSearch && (
                <button
                  type="button"
                  onClick={() => {
                    setRecordSearch("");
                    recordsPagination.setPage(1);
                  }}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  title="Clear search"
                >
                  <X size={13} />
                </button>
              )}
            </div>

            <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1.5 text-[11px] font-semibold text-slate-600">
              <CalendarDays size={13} />
              {from} – {to}
            </span>
          </div>
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
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 text-[10px] uppercase tracking-[0.12em] text-slate-500">
                  <tr>
                    <th className="px-4 py-3 font-semibold whitespace-nowrap">Date / Period</th>
                    <th className="px-4 py-3 font-semibold">Student</th>
                    <th className="px-4 py-3 font-semibold">Class &amp; Stream</th>
                    <th className="px-4 py-3 font-semibold">Subject</th>
                    <th className="px-4 py-3 font-semibold">Status</th>
                    <th className="px-4 py-3 font-semibold whitespace-nowrap">
                      Direct Correction
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {recordsPagination.paginatedItems.map((row) => (
                    <tr
                      key={row._id}
                      className="align-middle transition hover:bg-slate-50/60"
                    >
                      <td className="whitespace-nowrap px-4 py-3">
                        <p className="font-semibold text-slate-800">
                          {row.session?.date}
                        </p>
                        <p className="mt-0.5 text-xs text-slate-500">
                          Period {row.session?.period}
                        </p>
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-semibold text-slate-800">
                          {row.studentId?.name || "Unknown student"}
                        </p>
                        <p className="mt-0.5 text-xs text-slate-500">
                          {row.studentId?.rollNumber || "No roll number"}
                        </p>
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-medium text-slate-700">
                          {row.session?.courseId?.name}
                        </p>
                        <p className="mt-0.5 text-xs text-slate-500">
                          {row.session?.departmentId?.name} · Sec{" "}
                          {row.session?.sectionId?.name}
                        </p>
                      </td>
                      <td className="px-4 py-3 text-slate-700">
                        {row.session?.subjectId?.name || "—"}
                      </td>
                      <td className="px-4 py-3">
                        <AttendanceStatusBadge status={row.status} />
                      </td>
                      <td className="px-4 py-3">
                        <AttendanceDirectToggle
                          row={row}
                          status={row.status}
                          onToggle={(newStatus) =>
                            void toggleStatus(row, newStatus).catch(toastError)
                          }
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
                  <div className="flex items-center justify-between border-t border-slate-100 pt-3">
                    <p className="text-xs font-semibold text-slate-600">
                      Direct correction
                    </p>
                    <AttendanceDirectToggle
                      row={row}
                      status={row.status}
                      onToggle={(newStatus) =>
                        void toggleStatus(row, newStatus).catch(toastError)
                      }
                    />
                  </div>
                </article>
              ))}
            </div>
            <Pagination
              page={recordsPagination.page}
              pageCount={recordsPagination.pageCount}
              pageSize={recordsPagination.pageSize}
              total={searchedRows.length}
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
              {recordSearch ? "No matching records found" : "No attendance records found"}
            </h3>
            <p className="mx-auto mt-1 max-w-sm text-xs leading-relaxed text-slate-500">
              {recordSearch
                ? `No records matched "${recordSearch}". Try clearing your search.`
                : "Try a different date range or clear the class, stream, or section filters."}
            </p>
            {recordSearch && (
              <button
                type="button"
                onClick={() => setRecordSearch("")}
                className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-brand-50 px-3 py-1.5 text-xs font-semibold text-brand-700 hover:bg-brand-100"
              >
                Clear search
              </button>
            )}
          </div>
        )}
      </section>

      <section className="overflow-visible rounded-2xl border border-slate-200 bg-white shadow-soft">
        <div className="flex flex-col gap-4 border-b border-slate-100 p-4 sm:p-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-violet-50 text-violet-700">
              <History size={19} />
            </span>
            <div>
              <h2 className="font-bold text-slate-900">Audit history</h2>
              <p className="mt-0.5 text-xs text-slate-500">
                Latest attendance changes
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {/* Calendar filter reusing Report filters date input style */}
            <div className="relative w-full sm:w-44">
              <input
                type="date"
                value={auditDate}
                onChange={(event) => setAuditDate(event.target.value)}
                aria-label="Filter audit history by date"
                className="h-12 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 shadow-sm outline-none transition hover:border-slate-300 focus:border-brand-500 focus:ring-4 focus:ring-brand-100"
              />
              {auditDate && (
                <button
                  type="button"
                  onClick={() => setAuditDate("")}
                  className="absolute right-8 top-1/2 -translate-y-1/2 rounded-full p-1 text-slate-400 hover:text-slate-600"
                  title="Clear date"
                  aria-label="Clear date"
                >
                  <X size={14} />
                </button>
              )}
            </div>

            {/* Class filter reusing SearchableSelect */}
            <div className="w-full sm:w-48">
              <SearchableSelect
                label="Class"
                value={auditCourseId}
                options={classOptions}
                onChange={setAuditCourseId}
                placeholder="All classes"
                searchPlaceholder="Search classes..."
                icon={<GraduationCap size={16} />}
              />
            </div>

            {/* Stream filter reusing SearchableSelect */}
            <div className="w-full sm:w-48">
              <SearchableSelect
                label="Stream"
                value={auditDepartmentId}
                options={streamOptions}
                onChange={setAuditDepartmentId}
                placeholder="All streams"
                searchPlaceholder="Search streams..."
                icon={<Layers3 size={16} />}
              />
            </div>

            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">
              {auditDate || auditCourseId || auditDepartmentId
                ? `${filteredAudits.length} found`
                : "Latest 20"}
            </span>
          </div>
        </div>
        <div className="max-h-[600px] space-y-1 overflow-y-auto p-4 sm:p-5">
          {(auditDate || auditCourseId || auditDepartmentId
            ? filteredAudits
            : filteredAudits.slice(0, 20)
          ).map((audit) => (
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
          {!filteredAudits.length && (
            <div className="py-10 text-center">
              <span className="mx-auto grid h-11 w-11 place-items-center rounded-xl bg-slate-100 text-slate-400">
                <History size={20} />
              </span>
              <p className="mt-3 text-sm font-semibold text-slate-700">
                {auditDate || auditCourseId || auditDepartmentId
                  ? "No matching audit records"
                  : "No corrections recorded"}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                {auditDate || auditCourseId || auditDepartmentId
                  ? "Try adjusting or resetting your audit filters."
                  : "Approved attendance changes will appear here."}
              </p>
            </div>
          )}
        </div>
      </section>
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

function AttendanceDirectToggle({
  status,
  row,
  onToggle,
}: {
  status: string;
  row: Row;
  onToggle: (newStatus: "present" | "absent") => void;
}) {
  const isPresent = status === "present";

  return (
    <button
      type="button"
      role="switch"
      aria-checked={isPresent}
      aria-label={`Toggle attendance status for ${row.studentId?.name || "student"}. Currently ${status}`}
      onClick={() => onToggle(isPresent ? "absent" : "present")}
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
  );
}
