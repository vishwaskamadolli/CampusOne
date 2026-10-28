"use client";
import { useCallback, useEffect, useState } from "react";
import { Download, LoaderCircle } from "lucide-react";
import { api } from "@/lib/api";
import { toastAction, toastError } from "@/lib/toast";
import { Pagination, usePagination } from "@/components/pagination";

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
  return (
    <section>
      <div className="mb-6">
        <h1 className="mt-1 text-3xl font-bold">Attendance</h1>
        <p className="text-sm text-slate-500">
          Daily and monthly attendance reports, corrections, and audit history.
        </p>
      </div>
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-soft">
        <div className="grid gap-3 md:grid-cols-6">
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="rounded-lg border border-slate-200 p-2 text-sm"
          />
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="rounded-lg border border-slate-200 p-2 text-sm"
          />
          <select
            value={courseId}
            onChange={(e) => setCourseId(e.target.value)}
            className="rounded-lg border border-slate-200 p-2 text-sm"
          >
            <option value="">All classes</option>
            {classes.map((item) => (
              <option key={item._id} value={item._id}>
                {item.name}
              </option>
            ))}
          </select>
          <select
            value={studentId}
            onChange={(e) => setStudentId(e.target.value)}
            className="rounded-lg border border-slate-200 p-2 text-sm"
          >
            <option value="">All students</option>
            {students.map((item) => (
              <option key={item._id} value={item._id}>
                {item.name} · {item.rollNumber}
              </option>
            ))}
          </select>
          <button
            onClick={() => {
              setFrom(today);
              setTo(today);
            }}
            className="rounded-lg border border-slate-200 px-3 text-sm"
          >
            Today
          </button>
          <button
            onClick={() => {
              setFrom(`${month}-01`);
              setTo(today);
            }}
            className="rounded-lg border border-slate-200 px-3 text-sm"
          >
            This month
          </button>
        </div>
        <div className="mt-4 flex flex-wrap gap-3">
          {["present", "absent", "late", "excused"].map((status) => (
            <span
              key={status}
              className="rounded-lg bg-slate-50 px-3 py-2 text-sm capitalize"
            >
              {status}: <b>{report.counts[status] || 0}</b>
            </span>
          ))}
          <button
            onClick={exportExcel}
            className="ml-auto flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white"
          >
            <Download size={16} />
            Excel export
          </button>
        </div>
      </div>
      <div className="mt-6 rounded-2xl border border-slate-200 bg-white shadow-soft">
        <h2 className="border-b border-slate-100 p-5 font-bold">
          Attendance records
        </h2>
        {loading ? (
          <LoaderCircle className="m-6 animate-spin text-brand-600" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                <tr>
                  <th className="p-3">Date</th>
                  <th>Student</th>
                  <th>Class</th>
                  <th>Subject</th>
                  <th>Status</th>
                  <th>Direct correction</th>
                </tr>
              </thead>
              <tbody>
                {recordsPagination.paginatedItems.map((row) => (
                  <tr key={row._id} className="border-t border-slate-100">
                    <td className="p-3">
                      {row.session?.date} · P{row.session?.period}
                    </td>
                    <td>{row.studentId?.name}</td>
                    <td>
                      {row.session?.courseId?.name} ·{" "}
                      {row.session?.departmentId?.name} ·{" "}
                      {row.session?.sectionId?.name}
                    </td>
                    <td>{row.session?.subjectId?.name}</td>
                    <td className="capitalize">{row.status}</td>
                    <td>
                      <div className="flex gap-2">
                        <select
                          value={statuses[row._id] || row.status}
                          onChange={(e) =>
                            setStatuses({
                              ...statuses,
                              [row._id]: e.target.value,
                            })
                          }
                          className="rounded border p-1"
                        >
                          {["present", "absent", "late", "excused"].map((s) => (
                            <option key={s}>{s}</option>
                          ))}
                        </select>
                        <input
                          value={reasons[row._id] || ""}
                          onChange={(e) =>
                            setReasons({
                              ...reasons,
                              [row._id]: e.target.value,
                            })
                          }
                          placeholder="Mandatory reason"
                          className="rounded border p-1"
                        />
                        <button
                          disabled={!reasons[row._id]?.trim()}
                          onClick={() => void correct(row).catch(toastError)}
                          className="rounded bg-slate-900 px-2 text-white disabled:opacity-40"
                        >
                          Save
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!report.rows.length && (
              <p className="p-8 text-center text-slate-500">
                No attendance records.
              </p>
            )}
            <Pagination page={recordsPagination.page} pageCount={recordsPagination.pageCount} pageSize={recordsPagination.pageSize} total={report.rows.length} onPageChange={recordsPagination.setPage} onPageSizeChange={(size) => { recordsPagination.setPageSize(size); recordsPagination.setPage(1); }}/>
          </div>
        )}
      </div>
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-soft">
          <h2 className="font-bold">Correction requests</h2>
          <div className="mt-3 space-y-3">
            {corrections
              .filter((item) => item.status === "pending")
              .map((item) => (
                <div
                  key={item._id}
                  className="rounded-xl bg-slate-50 p-3 text-sm"
                >
                  <b>{item.requestedBy?.name}</b>
                  <p>
                    {item.sessionId?.courseId?.name} ·{" "}
                    {item.sessionId?.departmentId?.name} ·{" "}
                    {item.sessionId?.subjectId?.name}
                  </p>
                  <p className="text-slate-500">{item.reason}</p>
                  <input
                    value={reasons[item._id] || ""}
                    onChange={(e) =>
                      setReasons({ ...reasons, [item._id]: e.target.value })
                    }
                    placeholder="Mandatory review reason"
                    className="mt-2 w-full rounded border p-2"
                  />
                  <div className="mt-2 flex gap-2">
                    <button
                      disabled={!reasons[item._id]?.trim()}
                      onClick={() =>
                        void review(item, "approved").catch(toastError)
                      }
                      className="rounded bg-brand-600 px-3 py-1.5 text-white disabled:opacity-40"
                    >
                      Approve
                    </button>
                    <button
                      disabled={!reasons[item._id]?.trim()}
                      onClick={() =>
                        void review(item, "rejected").catch(toastError)
                      }
                      className="rounded bg-rose-500 px-3 py-1.5 text-white disabled:opacity-40"
                    >
                      Reject
                    </button>
                  </div>
                </div>
              ))}
            {!corrections.some((item) => item.status === "pending") && (
              <p className="text-sm text-slate-500">No pending requests.</p>
            )}
          </div>
        </section>
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-soft">
          <h2 className="font-bold">Audit history</h2>
          <div className="mt-3 space-y-2">
            {audits.slice(0, 20).map((audit) => (
              <div
                key={audit._id}
                className="rounded-xl bg-slate-50 p-3 text-sm"
              >
                <b>{audit.studentId?.name}</b>: {audit.previousStatus} →{" "}
                {audit.newStatus}
                <p className="text-xs text-slate-500">
                  {audit.reason} · {audit.actorId?.name}
                </p>
              </div>
            ))}
            {!audits.length && (
              <p className="text-sm text-slate-500">No corrections recorded.</p>
            )}
          </div>
        </section>
      </div>
    </section>
  );
}
