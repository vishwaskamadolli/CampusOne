"use client";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  LoaderCircle,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  Upload,
  X,
  BookOpen,
  Check,
  LockKeyhole,
  Mail,
  Settings,
  UserPlus,
} from "lucide-react";
import { ResultsImportWorkspace } from "@/components/results-import-workspace";
import { api } from "@/lib/api";
import { toastAction, toastError } from "@/lib/toast";
import { Pagination, usePagination } from "@/components/pagination";

type Item = Record<string, any> & {
  _id: string;
  name?: string;
  title?: string;
  code?: string;
  isActive?: boolean;
  status?: string;
};
type Field = {
  key: string;
  label: string;
  type?:
    | "text"
    | "number"
    | "date"
    | "datetime-local"
    | "select"
    | "multiselect"
    | "textarea"
    | "checkbox";
  required?: boolean;
  options?: { label: string; value: string }[];
  createOnly?: boolean;
};
const academicTabs = [
  "academic-years",
  "classes",
  "streams",
  "sections",
  "subjects",
  "stream-subjects",
  "class-teachers",
];

export function ModuleWorkspace({ module }: { module: string }) {
  const [tab, setTab] = useState(
    module === "Academics" ? "academic-years" : "",
  );
  const [items, setItems] = useState<Item[]>([]);
  const [refs, setRefs] = useState<Record<string, Item[]>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Item | null>(null);
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [pendingDelete, setPendingDelete] = useState<Item | null>(null);
  const [structure, setStructure] = useState({
    courseId: "",
    departmentId: "",
  });
  const resource =
    module === "Academics"
      ? tab
      : module === "Faculty"
        ? "teachers"
        : module === "Students"
          ? "students"
          : module === "Attendance"
            ? "attendance/sessions"
            : module === "Examinations"
              ? "examinations"
              : "events";
  const endpoint =
    module === "Academics"
      ? `/academics/${resource}`
      : module === "Faculty" || module === "Students"
        ? `/people/${resource}`
        : `/${resource}`;
  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setItems(await api<Item[]>(endpoint));
      if (
        ["Academics", "Faculty", "Students", "Examinations"].includes(module)
      ) {
        const names = [
          "academic-years",
          "streams",
          "classes",
          "sections",
          "subjects",
          "stream-subjects",
          "class-teachers",
        ];
        const values = await Promise.all(
          names.map((n) => api<Item[]>(`/academics/${n}`).catch(() => [])),
        );
        const teachers = await api<Item[]>("/people/teachers").catch(() => []);
        setRefs({
          ...Object.fromEntries(names.map((n, i) => [n, values[i]])),
          teachers,
        });
      }
    } catch (e) {
      toastError(e, "Unable to load records");
      setError(e instanceof Error ? e.message : "Unable to load records");
    } finally {
      setLoading(false);
    }
  }, [endpoint, module]);
  useEffect(() => {
    void load();
  }, [load]);
  const fields = useMemo(
    () => getFields(module, resource, refs, structure),
    [module, resource, refs, structure],
  );
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    setError("");
    const fd = new FormData(e.currentTarget);
    const body: Object = Object.fromEntries(
      fields
        .filter((f) => !f.createOnly || !editing)
        .map((f) => [
          f.key,
          f.type === "number"
            ? Number(fd.get(f.key))
            : f.type === "multiselect"
              ? fd.getAll(f.key)
              : f.type === "checkbox"
                ? fd.get(f.key) === "on"
                : fd.get(f.key),
        ]),
    );
    try {
      const result = await toastAction(
        () =>
          api<any>(editing ? `${endpoint}/${editing._id}` : endpoint, {
            method: editing ? "PATCH" : "POST",
            body: JSON.stringify(body),
          }),
        {
          loading: editing ? "Updating record…" : "Saving record…",
          success: editing ? "Record updated" : "Record created",
        },
      );
      setSuccess(
        editing
          ? "Updated successfully"
          : result.notification
            ? `Teacher account created. Invitation ${result.notification.status}${result.notification.channel ? ` by ${result.notification.channel}` : ""}.`
            : "Saved successfully",
      );
      setOpen(false);
      setEditing(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to save");
    } finally {
      setSaving(false);
    }
  }
  async function importCsv(file: File) {
    const text = await file.text();
    const [head, ...lines] = text.trim().split(/\r?\n/);
    const keys = head.split(",").map((x) => x.trim());
    const rows = lines.map((line) =>
      Object.fromEntries(
        line.split(",").map((value, i) => [keys[i], value.trim()]),
      ),
    );
    try {
      const result = await toastAction(
        () =>
          api<{ imported: number }>("/people/students/import", {
            method: "POST",
            body: JSON.stringify({ rows }),
          }),
        { loading: "Importing students…", success: "Students imported" },
      );
      setSuccess(`${result.imported} students imported`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Import failed");
    }
  }
  async function remove(item: Item) {
    setPendingDelete(item);
  }
  async function confirmRemove() {
    if (!pendingDelete) return;
    try {
      if (module === "Events")
        await toastAction(
          () => api(`${endpoint}/${pendingDelete._id}`, { method: "DELETE" }),
          { loading: "Deleting record…", success: "Record deleted" },
        );
      else if (module === "Faculty" || module === "Students")
        await toastAction(
          () =>
            api(`${endpoint}/${pendingDelete._id}/status`, {
              method: "PATCH",
              body: JSON.stringify({ isActive: false }),
            }),
          { loading: "Deactivating record…", success: "Record deactivated" },
        );
      else
        await toastAction(
          () => api(`${endpoint}/${pendingDelete._id}`, { method: "DELETE" }),
          { loading: "Checking dependencies…", success: "Record deactivated" },
        );
      setPendingDelete(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to update record");
    }
  }
  async function publish(item: Item) {
    try {
      await toastAction(
        () =>
          api(`${endpoint}/${item._id}`, {
            method: "PATCH",
            body: JSON.stringify({ status: "published" }),
          }),
        { loading: "Publishing…", success: "Published successfully" },
      );
      setSuccess("Published and notifications created");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to publish");
    }
  }
  async function resendTeacherInvitation(item: Item) {
    try {
      const result = await toastAction(
        () =>
          api<{ notification: { status: string; channel?: string } }>(
            `/people/teachers/${item._id}/resend-invitation`,
            { method: "POST" },
          ),
        {
          loading: "Sending invitation…",
          success: "Invitation request completed",
        },
      );
      setSuccess(
        `Invitation ${result.notification.status}${result.notification.channel ? ` by ${result.notification.channel}` : ""}.`,
      );
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to resend invitation");
    }
  }
  const filtered = items.filter((i) =>
    JSON.stringify(i).toLowerCase().includes(query.toLowerCase()),
  );
  const pagination = usePagination(filtered);
  return (
    <section>
      <div className="mb-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="mt-1 text-3xl font-bold">{module}</h1>
        </div>
        <div className="flex gap-2">
          {module === "Students" && (
            <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold">
              <Upload size={17} />
              Import CSV
              <input
                type="file"
                accept=".csv"
                className="hidden"
                onChange={(e) =>
                  e.target.files?.[0] && importCsv(e.target.files[0])
                }
              />
            </label>
          )}
          {module !== "Attendance" && module !== "Examinations" && (
            <button
              onClick={() => {
                setEditing(null);
                setStructure({ courseId: "", departmentId: "" });
                setOpen(true);
              }}
              className="flex items-center justify-center gap-2 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white"
            >
              <Plus size={17} />
              Add {singular(resource)}
            </button>
          )}
        </div>
      </div>
      {module === "Academics" && (
        <div className="mb-5 flex gap-2 overflow-x-auto pb-2">
          {academicTabs.map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`whitespace-nowrap rounded-lg px-3 py-2 text-sm font-semibold capitalize ${tab === t ? "bg-slate-900 text-white" : "border border-slate-200 bg-white text-slate-600"}`}
            >
              {t.replace("-", " ")}
            </button>
          ))}
        </div>
      )}
      {(error || success) && (
        <div
          className={`mb-4 flex items-center gap-2 rounded-xl p-3 text-sm ${error ? "bg-rose-50 text-rose-700" : "bg-emerald-50 text-emerald-700"}`}
        >
          {error ? <AlertCircle size={18} /> : <CheckCircle2 size={18} />}{" "}
          {error || success}
          <button
            className="ml-auto"
            onClick={() => {
              setError("");
              setSuccess("");
            }}
          >
            <X size={16} />
          </button>
        </div>
      )}
      <div className="rounded-2xl border border-slate-200 bg-white shadow-soft">
        <div className="flex gap-3 border-b border-slate-100 p-4">
          <div className="relative flex-1">
            <Search
              className="absolute left-3 top-2.5 text-slate-400"
              size={17}
            />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search records…"
              className="w-full rounded-lg border border-slate-200 py-2 pl-9 pr-3 text-sm"
            />
          </div>
          <button
            onClick={load}
            className="rounded-lg border border-slate-200 p-2"
          >
            <RefreshCw size={18} />
          </button>
        </div>
        {loading ? (
          <div className="grid h-48 place-items-center">
            <LoaderCircle className="animate-spin text-brand-600" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center">
            <p className="font-semibold">No records found</p>
            <p className="mt-1 text-sm text-slate-500">
              Add the first record to begin.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-5 py-3">Record</th>
                  <th className="px-5 py-3">Details</th>
                  <th className="px-5 py-3">Status</th>
                  <th className="px-5 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {pagination.paginatedItems.map((item) => (
                  <tr key={item._id} className="border-t border-slate-100">
                    <td className="px-5 py-4 font-semibold">
                      {display(item)}
                      {module === "Faculty" && (
                        <p className="mt-1 max-w-md text-xs font-normal text-slate-500">
                          {item.teachingSubjectIds?.length
                            ? item.teachingSubjectIds
                                .map(
                                  (subject: Item) =>
                                    subject.name || subject.code,
                                )
                                .join(", ")
                            : "No teaching subjects assigned"}
                        </p>
                      )}
                    </td>
                    <td className="px-5 py-4 text-slate-500">
                      {item.code ||
                        item.type ||
                        item.employeeNumber ||
                        item.streamId?.name ||
                        (item.courseId?.name && item.sectionId?.name
                          ? `${item.courseId.name} · ${item.departmentId?.name || ""} · ${item.sectionId.name}`
                          : undefined) ||
                        item.date ||
                        "—"}
                    </td>
                    <td className="px-5 py-4">
                      <span
                        className={`rounded-full px-2.5 py-1 text-xs font-semibold ${(item.isActive ?? item.status !== "cancelled") ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600"}`}
                      >
                        {item.status ||
                          ((item.isActive ?? true) ? "Active" : "Inactive")}
                      </span>
                      {module === "Faculty" &&
                        item.userId?.credentialDeliveryStatus && (
                          <p className="mt-1 text-xs capitalize text-slate-500">
                            Invitation {item.userId.credentialDeliveryStatus}
                            {item.userId.credentialDeliveryChannel
                              ? ` by ${item.userId.credentialDeliveryChannel}`
                              : ""}
                          </p>
                        )}
                    </td>
                    <td className="px-5 py-4 text-right">
                      {module === "Events" &&
                        item.status !== "published" && (
                          <button
                            onClick={() => publish(item)}
                            className="mr-3 text-xs font-semibold text-brand-700"
                          >
                            Publish
                          </button>
                        )}
                      {module !== "Attendance" && (
                        <>
                          {module === "Faculty" &&
                            item.userId?.mustChangePassword && (
                              <button
                                onClick={() =>
                                  void resendTeacherInvitation(item)
                                }
                                className="mr-3 text-xs font-semibold text-brand-700"
                              >
                                Resend invitation
                              </button>
                            )}
                          <button
                            onClick={() => {
                              setEditing(item);
                              setStructure({
                                courseId: fieldValue(item, "courseId"),
                                departmentId: fieldValue(item, "departmentId"),
                              });
                              setOpen(true);
                            }}
                            className="mr-3 text-slate-500"
                            aria-label="Edit"
                          >
                            <Pencil size={17} />
                          </button>
                          <button
                            onClick={() => remove(item)}
                            className="text-rose-600"
                            aria-label="Deactivate or delete"
                          >
                            <Trash2 size={17} />
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {!loading && filtered.length > 0 && <Pagination page={pagination.page} pageCount={pagination.pageCount} pageSize={pagination.pageSize} total={filtered.length} onPageChange={pagination.setPage} onPageSizeChange={(size) => { pagination.setPageSize(size); pagination.setPage(1); }}/>} 
      </div>
      {module === "Examinations" && <ResultsImportWorkspace refs={refs} exams={items} onRefresh={load} />}
      {pendingDelete && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-title"
        >
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
            <h2 id="delete-title" className="text-xl font-bold">
              Deactivate record?
            </h2>
            <p className="mt-2 text-sm text-slate-500">
              {display(pendingDelete)} will be hidden from active records.
              Linked records will be protected.
            </p>
            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={() => setPendingDelete(null)}
                className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold"
              >
                Cancel
              </button>
              <button
                onClick={confirmRemove}
                className="rounded-xl bg-rose-500 px-4 py-2 text-sm font-semibold text-white"
              >
                Deactivate
              </button>
            </div>
          </div>
        </div>
      )}
      {open && (module === "Faculty" ? (
        <TeacherModal
          editing={editing}
          refs={refs}
          saving={saving}
          error={error}
          submit={submit}
          close={() => { setOpen(false); setEditing(null); }}
        />
      ) : (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4">
          <form
            onSubmit={submit}
            className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl"
          >
            <div className="mb-5 flex items-center justify-between">
              <h2 className="text-xl font-bold">
                {editing ? "Edit" : "Add"} {singular(resource)}
              </h2>
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  setEditing(null);
                }}
              >
                <X />
              </button>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              {fields
                .filter((f) => !f.createOnly || !editing)
                .map((f) => (
                  <label
                    key={f.key}
                    className={`text-sm font-semibold ${f.type === "textarea" ? "sm:col-span-2" : ""}`}
                  >
                    {f.label}
                    {f.required && (
                      <span className="ml-1 text-rose-500">*</span>
                    )}
                    {f.type === "multiselect" ? (
                      <>
                        <select
                          name={f.key}
                          multiple
                          defaultValue={fieldValues(editing, f.key)}
                          className="mt-2 h-36 w-full rounded-xl border border-slate-200 p-3 font-normal"
                        >
                          {f.options?.map((o) => (
                            <option key={o.value} value={o.value}>
                              {o.label}
                            </option>
                          ))}
                        </select>
                        <span className="mt-1 block text-xs font-normal text-slate-500">
                          Use Ctrl/Cmd to select multiple subjects.
                        </span>
                      </>
                    ) : f.type === "select" ? (
                      <select
                        name={f.key}
                        required={f.required}
                        defaultValue={fieldValue(editing, f.key)}
                        onChange={(event) => {
                          if (f.key === "courseId" || f.key === "departmentId")
                            setStructure((current) => ({
                              ...current,
                              [f.key]: event.target.value,
                            }));
                        }}
                        className="mt-2 w-full rounded-xl border border-slate-200 p-3 font-normal"
                      >
                        <option value="">Select {f.label}</option>
                        {f.options?.map((o) => (
                          <option key={o.value} value={o.value}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                    ) : f.type === "textarea" ? (
                      <textarea
                        name={f.key}
                        required={f.required}
                        defaultValue={fieldValue(editing, f.key)}
                        rows={4}
                        className="mt-2 w-full rounded-xl border border-slate-200 p-3 font-normal"
                      />
                    ) : (
                      <input
                        name={f.key}
                        required={f.required}
                        type={f.type || "text"}
                        placeholder={
                          !f.type || f.type === "text"
                            ? `Enter ${f.label.toLowerCase()}`
                            : undefined
                        }
                        defaultValue={
                          f.type === "checkbox"
                            ? undefined
                            : fieldValue(editing, f.key)
                        }
                        defaultChecked={
                          f.type === "checkbox"
                            ? f.createOnly
                              ? true
                              : Boolean(editing?.[f.key])
                            : undefined
                        }
                        className="mt-2 w-full rounded-xl border border-slate-200 p-3 font-normal"
                      />
                    )}
                  </label>
                ))}
            </div>
            <button
              disabled={saving}
              className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-brand-600 py-3 font-semibold text-white"
            >
              {saving && <LoaderCircle size={17} className="animate-spin" />}
              Save record
            </button>
          </form>
        </div>
      ))}
    </section>
  );
}
function TeacherModal({ editing, refs, saving, error, submit, close }: { editing: Item | null; refs: Record<string, Item[]>; saving: boolean; error: string; submit: (event: FormEvent<HTMLFormElement>) => void; close: () => void }) {
  const [departmentId, setDepartmentId] = useState(fieldValue(editing, "departmentId"));
  const [subjectSearch, setSubjectSearch] = useState("");
  const [subjectsOpen, setSubjectsOpen] = useState(false);
  const [selectedSubjects, setSelectedSubjects] = useState<string[]>(fieldValues(editing, "teachingSubjectIds"));
  const mappedIds = new Set((refs["stream-subjects"] || []).filter((mapping) => fieldValue(mapping, "streamId") === departmentId).map((mapping) => fieldValue(mapping, "subjectId")));
  const availableSubjects = (refs.subjects || []).filter((subject) => mappedIds.has(subject._id));
  const filteredSubjects = availableSubjects.filter((subject) => `${subject.name} ${subject.code || ""}`.toLowerCase().includes(subjectSearch.toLowerCase()));
  const selectedDetails = (refs.subjects || []).filter((subject) => selectedSubjects.includes(subject._id));
  const fieldClass = "mt-2 w-full rounded-xl border border-slate-200 bg-white px-3.5 py-3 text-sm font-normal outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-100";
  function selectSubject(subjectId: string) { if (!selectedSubjects.includes(subjectId)) setSelectedSubjects((current) => [...current, subjectId]); setSubjectSearch(""); }
  function changeStream(value: string) { setDepartmentId(value); const permitted = new Set((refs["stream-subjects"] || []).filter((mapping) => fieldValue(mapping, "streamId") === value).map((mapping) => fieldValue(mapping, "subjectId"))); setSelectedSubjects((current) => current.filter((subjectId) => permitted.has(subjectId))); }
  return <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/50 p-3 backdrop-blur-sm sm:p-6" role="dialog" aria-modal="true" aria-labelledby="teacher-modal-title">
    <form onSubmit={submit} className="flex max-h-[94vh] w-full max-w-5xl flex-col overflow-hidden rounded-3xl bg-white shadow-2xl">
      <header className="flex shrink-0 items-start gap-4 border-b border-slate-100 px-5 py-5 sm:px-7"><span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-brand-50 text-brand-700"><UserPlus size={24}/></span><div className="min-w-0 flex-1"><h2 id="teacher-modal-title" className="text-2xl font-bold tracking-tight text-slate-900">{editing ? "Edit Teacher" : "Add Teacher"}</h2><p className="mt-1 text-sm text-slate-500">Enter teacher details and {editing ? "update their academic profile." : "create a secure account."}</p></div><button type="button" onClick={close} className="rounded-xl p-2 text-slate-500 hover:bg-slate-100" aria-label="Close"><X size={22}/></button></header>
      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto bg-slate-50/60 p-4 sm:p-6">
        <TeacherSection icon={UserPlus} title="Personal Information"><TeacherField label="Teacher Full Name" required><input name="name" required defaultValue={editing?.userId?.name || fieldValue(editing,"name")} placeholder="Enter teacher full name" className={fieldClass}/></TeacherField><TeacherField label="Email Address" required><input name="email" type="email" required defaultValue={editing?.userId?.email || fieldValue(editing,"email")} placeholder="Enter email address" className={fieldClass}/></TeacherField><TeacherField label="Employee ID" required><input name="employeeNumber" required defaultValue={fieldValue(editing,"employeeNumber")} placeholder="Enter employee ID" className={fieldClass}/></TeacherField><TeacherField label="Phone Number"><input name="phone" type="tel" defaultValue={fieldValue(editing,"phone")} placeholder="Enter phone number" className={fieldClass}/></TeacherField></TeacherSection>
        <TeacherSection icon={BookOpen} title="Academic Information"><TeacherField label="Stream" required><select name="departmentId" required value={departmentId} onChange={(event) => changeStream(event.target.value)} className={fieldClass}><option value="">Select stream</option>{(refs.streams || []).map((stream) => <option key={stream._id} value={stream._id}>{stream.name}</option>)}</select></TeacherField><TeacherField label="Highest Qualification"><input name="qualification" defaultValue={fieldValue(editing,"qualification")} placeholder="Enter highest qualification" className={fieldClass}/></TeacherField><div className="sm:col-span-2"><label className="text-sm font-semibold text-slate-800">Teaching Subjects</label><div className="relative"><button type="button" onClick={() => setSubjectsOpen(!subjectsOpen)} className={`${fieldClass} flex min-h-12 items-center justify-between text-left ${!departmentId ? "cursor-not-allowed bg-slate-50 text-slate-400" : ""}`} disabled={!departmentId}><span>{departmentId ? "Search and select subjects" : "Select a stream first"}</span><Search size={17} className="text-slate-400"/></button>{subjectsOpen && <div className="absolute z-20 mt-2 w-full rounded-xl border border-slate-200 bg-white p-2 shadow-xl"><input autoFocus value={subjectSearch} onChange={(event) => setSubjectSearch(event.target.value)} placeholder="Search subjects…" className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-brand-500"/><div className="mt-2 max-h-44 overflow-y-auto">{filteredSubjects.map((subject) => <button type="button" key={subject._id} onClick={() => selectSubject(subject._id)} className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm hover:bg-brand-50"><span>{subject.name}<small className="ml-2 text-slate-400">{subject.code}</small></span>{selectedSubjects.includes(subject._id) && <Check size={16} className="text-brand-600"/>}</button>)}{!filteredSubjects.length && <p className="p-3 text-center text-sm text-slate-500">No subjects found</p>}</div></div>}</div><div className="mt-3 flex min-h-8 flex-wrap gap-2">{selectedDetails.map((subject) => <span key={subject._id} className="inline-flex items-center gap-2 rounded-lg bg-brand-50 px-3 py-1.5 text-sm font-medium text-brand-700">{subject.name}<button type="button" onClick={() => setSelectedSubjects((current) => current.filter((id) => id !== subject._id))} aria-label={`Remove ${subject.name}`}><X size={14}/></button></span>)}</div>{selectedSubjects.map((subjectId) => <input key={subjectId} type="hidden" name="teachingSubjectIds" value={subjectId}/>)}</div></TeacherSection>
        {!editing && <TeacherSection icon={Settings} title="Account Settings" single><label className="flex items-start gap-3"><input name="createLoginAccount" type="checkbox" defaultChecked className="mt-1 h-5 w-5 rounded border-slate-300 text-brand-600 focus:ring-brand-500"/><span><b className="block text-sm text-slate-900">Create Login Account</b><span className="mt-1 block text-sm text-slate-500">A secure temporary password will be generated and sent via email or SMS.</span><span className="mt-3 flex items-center gap-2 rounded-xl bg-brand-50 p-3 text-sm text-brand-800"><LockKeyhole size={17}/>The teacher must change the password on first login.</span></span></label></TeacherSection>}
        {error && <p className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
      </div>
      <footer className="sticky bottom-0 flex shrink-0 items-center justify-end gap-3 border-t border-slate-200 bg-white px-5 py-4 sm:px-7"><button type="button" onClick={close} className="rounded-xl border border-slate-200 px-5 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50">Cancel</button><button disabled={saving} className="flex min-w-36 items-center justify-center gap-2 rounded-xl bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-brand-700 disabled:opacity-50">{saving && <LoaderCircle size={17} className="animate-spin"/>}Save Record</button></footer>
    </form>
  </div>;
}
function TeacherSection({icon:Icon,title,children,single=false}:{icon:any;title:string;children:React.ReactNode;single?:boolean}) { return <section className="overflow-visible rounded-2xl border border-slate-200 bg-white"><div className="flex items-center gap-2 rounded-t-2xl border-b border-slate-100 bg-gradient-to-r from-brand-50 to-white px-4 py-3 text-slate-900"><Icon size={18} className="text-brand-700"/><h3 className="font-bold">{title}</h3></div><div className={`${single ? "block" : "grid sm:grid-cols-2"} gap-4 p-4 sm:p-5`}>{children}</div></section>; }
function TeacherField({label,required=false,children}:{label:string;required?:boolean;children:React.ReactNode}) { return <label className="text-sm font-semibold text-slate-800">{label}{required && <span className="ml-1 text-rose-500">*</span>}{children}</label>; }
function LegacyParentLinks({ students }: { students: Item[] }) {
  const [parents, setParents] = useState<Item[]>([]);
  const [links, setLinks] = useState<Item[]>([]);
  const [message, setMessage] = useState("");
  const refresh = useCallback(async () => {
    const [users, linked] = await Promise.all([
      api<Item[]>("/users"),
      api<Item[]>("/people/parent-links"),
    ]);
    setParents(users.filter((user) => user.roles?.includes("parent")));
    setLinks(linked);
  }, []);
  useEffect(() => {
    void refresh();
  }, [refresh]);
  async function createParent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const result = await api<any>("/users", {
      method: "POST",
      body: JSON.stringify({
        name: data.get("name"),
        email: data.get("email"),
        roles: ["parent"],
      }),
    });
    setMessage(
      `Parent created. Development setup token: ${result.developmentSetupToken || "sent by email"}`,
    );
    event.currentTarget.reset();
    await refresh();
  }
  async function link(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    await api("/people/parent-links", {
      method: "POST",
      body: JSON.stringify({
        parentUserId: data.get("parentUserId"),
        studentId: data.get("studentId"),
        relationship: data.get("relationship"),
      }),
    });
    setMessage("Parent and student linked successfully.");
    await refresh();
  }
  return (
    <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-soft">
      <h2 className="font-bold">Parent accounts and child links</h2>
      <div className="mt-4 grid gap-6 lg:grid-cols-2">
        <form onSubmit={createParent} className="space-y-3">
          <h3 className="text-sm font-semibold">Create parent account</h3>
          <input
            name="name"
            required
            placeholder="Parent name"
            className="w-full rounded-lg border p-2.5 text-sm"
          />
          <input
            name="email"
            required
            type="email"
            placeholder="Email"
            className="w-full rounded-lg border p-2.5 text-sm"
          />
          <button className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white">
            Create account
          </button>
        </form>
        <form onSubmit={link} className="space-y-3">
          <h3 className="text-sm font-semibold">Link child</h3>
          <select
            name="parentUserId"
            required
            className="w-full rounded-lg border p-2.5 text-sm"
          >
            <option value="">Select parent</option>
            {parents.map((p) => (
              <option key={p._id} value={p._id}>
                {p.name} · {p.email}
              </option>
            ))}
          </select>
          <select
            name="studentId"
            required
            className="w-full rounded-lg border p-2.5 text-sm"
          >
            <option value="">Select student</option>
            {students.map((s) => (
              <option key={s._id} value={s._id}>
                {s.name} · {s.rollNumber}
              </option>
            ))}
          </select>
          <select
            name="relationship"
            className="w-full rounded-lg border p-2.5 text-sm"
          >
            <option value="guardian">Guardian</option>
            <option value="father">Father</option>
            <option value="mother">Mother</option>
          </select>
          <button className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white">
            Link child
          </button>
        </form>
      </div>
      {message && (
        <p className="mt-4 rounded-lg bg-brand-50 p-3 text-xs text-brand-700">
          {message}
        </p>
      )}
      <p className="mt-4 text-xs text-slate-500">
        {links.length} verified parent-child relationship
        {links.length === 1 ? "" : "s"}
      </p>
    </section>
  );
}
function opts(items: Item[] = []) {
  return items.map((i) => ({
    value: i._id,
    label: i.name || i.title || i.userId?.name || i.code || i._id,
  }));
}
function fieldValue(item: Item | null, key: string) {
  const value = item?.[key];
  if (value && typeof value === "object") return value._id || "";
  if ((key.endsWith("Date") || key.endsWith("At")) && value)
    return String(value).slice(0, key.endsWith("At") ? 16 : 10);
  return value ?? "";
}
function fieldValues(item: Item | null, key: string) {
  const value = item?.[key];
  return Array.isArray(value)
    ? value.map((entry) => String(entry?._id || entry))
    : [];
}
function singular(s: string) {
  return s.replace(/ies$/, "y").replace(/s$/, " ").trim();
}
function display(i: Item) {
  return (
    i.name ||
    i.title ||
    i.userId?.name ||
    i.teacherId?.userId?.name ||
    i.studentId?.name ||
    i.subjectId?.name ||
    "Record"
  );
}
function getFields(
  module: string,
  r: string,
  refs: Record<string, Item[]>,
  structure: { courseId: string; departmentId: string },
): Field[] {
  const common: Field[] = [{ key: "name", label: "Name", required: true }];
  const validSections = (refs.sections || []).filter(
    (item) =>
      fieldValue(item, "courseId") === structure.courseId &&
      fieldValue(item, "departmentId") === structure.departmentId,
  );
  const mappedSubjectIds = new Set(
    (refs["stream-subjects"] || [])
      .filter(
        (mapping) => fieldValue(mapping, "streamId") === structure.departmentId,
      )
      .map((mapping) => fieldValue(mapping, "subjectId")),
  );
  const validSubjects = (refs.subjects || []).filter((subject) =>
    mappedSubjectIds.has(subject._id),
  );
  if (module === "Faculty")
    return [
      { key: "name", label: "Teacher Full Name", required: true },
      { key: "email", label: "Email Address", required: true },
      { key: "employeeNumber", label: "Employee ID", required: true },
      {
        key: "departmentId",
        label: "Stream",
        type: "select",
        required: true,
        options: opts(refs.streams),
      },
      { key: "phone", label: "Phone Number" },
      { key: "qualification", label: "Highest Qualification" },
      {
        key: "teachingSubjectIds",
        label: "Teaching Subjects",
        type: "multiselect",
        options: opts(validSubjects),
      },
      {
        key: "createLoginAccount",
        label: "Create Login Account",
        type: "checkbox",
        required: true,
        createOnly: true,
      },
    ];
  if (module === "Students")
    return [
      { key: "name", label: "Student Full Name", required: true },
      { key: "rollNumber", label: "Roll Number", required: true },
      { key: "admissionNumber", label: "Admission Number", required: true },
      {
        key: "courseId",
        label: "Class",
        type: "select",
        required: true,
        options: opts(refs.classes),
      },
      {
        key: "departmentId",
        label: "Stream",
        type: "select",
        required: true,
        options: opts(refs.streams),
      },
      {
        key: "sectionId",
        label: "Section",
        type: "select",
        required: true,
        options: opts(validSections),
      },
      { key: "email", label: "Email Address" },
      { key: "phone", label: "Phone Number" },
    ];
  if (module === "Examinations")
    return [
      { key: "name", label: "Examination Name", required: true },
      {
        key: "academicYearId",
        label: "Academic Year",
        type: "select",
        required: true,
        options: opts(refs["academic-years"]),
      },
      {
        key: "courseId",
        label: "Class",
        type: "select",
        required: true,
        options: opts(refs.classes),
      },
      {
        key: "departmentId",
        label: "Stream",
        type: "select",
        required: true,
        options: opts(refs.streams),
      },
      {
        key: "sectionId",
        label: "Section",
        type: "select",
        required: true,
        options: opts(validSections),
      },
      { key: "startDate", label: "Start Date", type: "date", required: true },
      { key: "endDate", label: "End Date", type: "date", required: true },
    ];
  if (module === "Events")
    return [
      { key: "title", label: "Title", required: true },
      {
        key: "type",
        label: "Type",
        type: "select",
        required: true,
        options: ["event", "holiday", "exam", "meeting", "notice"].map((v) => ({
          value: v,
          label: v,
        })),
      },
      {
        key: "startsAt",
        label: "Start Date and Time",
        type: "datetime-local",
        required: true,
      },
      { key: "endsAt", label: "End Date and Time", type: "datetime-local" },
      {
        key: "description",
        label: "Description",
        type: "textarea",
        required: true,
      },
      {
        key: "targetAllParents",
        label: "Notify All Parents",
        type: "checkbox",
      },
    ];
  if (r === "streams")
    return [{ key: "name", label: "Stream Name", required: true }];
  if (r === "academic-years")
    return [
      { key: "name", label: "Academic Year Name", required: true },
      { key: "startDate", label: "Start Date", type: "date", required: true },
      { key: "endDate", label: "End Date", type: "date", required: true },
    ];
  if (r === "classes")
    return [
      { key: "name", label: "Class Name", required: true },
    ];
  if (r === "sections")
    return [
      { key: "name", label: "Section Name", required: true },
      {
        key: "courseId",
        label: "Class",
        type: "select",
        required: true,
        options: opts(refs.classes),
      },
      {
        key: "departmentId",
        label: "Stream",
        type: "select",
        required: true,
        options: opts(refs.streams),
      },
      {
        key: "capacity",
        label: "Student Capacity",
        type: "number",
        required: true,
      },
    ];
  if (r === "subjects")
    return [
      { key: "name", label: "Subject Name", required: true },
      { key: "code", label: "Subject Code", required: true },
      {
        key: "category",
        label: "Category",
        type: "select",
        required: true,
        options: [
          { label: "Language", value: "Language" },
          { label: "Core", value: "Core" },
        ],
      },
    ];
  if (r === "stream-subjects")
    return [
      {
        key: "streamId",
        label: "Stream",
        type: "select",
        required: true,
        options: opts(refs.streams),
      },
      {
        key: "subjectId",
        label: "Subject",
        type: "select",
        required: true,
        options: opts(refs.subjects),
      },
    ];
  if (r === "class-teachers")
    return [
      {
        key: "academicYearId",
        label: "Academic Year",
        type: "select",
        required: true,
        options: opts(refs["academic-years"]),
      },
      {
        key: "courseId",
        label: "Class",
        type: "select",
        required: true,
        options: opts(refs.classes),
      },
      {
        key: "departmentId",
        label: "Stream",
        type: "select",
        required: true,
        options: opts(refs.streams),
      },
      {
        key: "sectionId",
        label: "Section",
        type: "select",
        required: true,
        options: opts(validSections),
      },
      {
        key: "teacherId",
        label: "Class Teacher",
        type: "select",
        required: true,
        options: opts(refs.teachers),
      },
    ];
  return common;
}
