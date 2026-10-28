"use client";
import { useEffect, useState } from "react";
import { LoaderCircle } from "lucide-react";
import { api } from "@/lib/api";
import { toastError } from "@/lib/toast";

type CalendarData = { month: string; percentage: number; days: Array<{ _id:string; status:string; session?:{date:string;period:number;subjectId?:{name:string}} }> };
const currentMonth = () => { const date = new Date(); return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0,7); };

export function ParentAttendanceCalendar({ studentId }: { studentId: string }) {
  const [month,setMonth] = useState(currentMonth());
  const [data,setData] = useState<CalendarData|null>(null);
  const [loading,setLoading] = useState(true);
  useEffect(() => { setLoading(true); api<CalendarData>(`/attendance/calendar/${studentId}?month=${month}`).then(setData).catch(toastError).finally(() => setLoading(false)); }, [studentId,month]);
  return <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-soft"><div className="flex items-center justify-between"><div><h2 className="font-bold">Attendance calendar</h2><p className="text-sm text-slate-500">{data?.percentage ?? 0}% attendance this month</p></div><input type="month" value={month} onChange={(event) => setMonth(event.target.value)} className="rounded-lg border border-slate-200 p-2 text-sm"/></div>{loading ? <LoaderCircle className="mt-6 animate-spin text-brand-600"/> : data?.days.length ? <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">{data.days.map((row) => <div key={row._id} className={`rounded-xl p-3 text-sm ${row.status === "absent" ? "bg-rose-50 text-rose-700" : row.status === "late" ? "bg-amber-100 text-amber-700" : "bg-emerald-50 text-emerald-700"}`}><b>{row.session?.date}</b><p className="text-xs">Period {row.session?.period} · {row.session?.subjectId?.name} · {row.status}</p></div>)}</div> : <p className="mt-6 text-sm text-slate-500">No attendance records for this month.</p>}</section>;
}
