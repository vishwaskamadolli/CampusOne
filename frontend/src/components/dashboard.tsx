"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { SessionUser } from "@/lib/api";
import { ModuleWorkspace } from "@/components/module-workspace";
import { TimetableWorkspace } from "@/components/timetable-workspace";
import { AdminSidebar } from "@/components/admin-sidebar";
import { AdminHeader } from "@/components/admin-header";
import { AttendanceWorkspace } from "@/components/attendance-workspace";
import { ExaminationsWorkspace } from "@/components/examinations-workspace";
import { ParentManagementWorkspace } from "@/components/parent-links";
import {
  Activity,
  CalendarDays,
  ClipboardCheck,
  GraduationCap,
  MoreHorizontal,
  Sparkles,
  TrendingDown,
  TrendingUp,
  UserCheck,
  Users,
  X,
  ChevronDown,
} from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const attendance = [
  { m: "Jul", v: 86 },
  { m: "Aug", v: 89 },
  { m: "Sep", v: 87 },
  { m: "Oct", v: 92 },
  { m: "Nov", v: 91 },
  { m: "Dec", v: 94 },
];
const enrollment = [
  { n: "CSE", v: 1240 },
  { n: "ECE", v: 860 },
  { n: "ME", v: 620 },
  { n: "Civil", v: 480 },
  { n: "BBA", v: 710 },
];
const tasks = [
  {
    title: "Approve internal assessment marks",
    meta: "2nd PUC · 8 submissions",
    tag: "Academic",
    color: "bg-violet-100 text-violet-700",
  },
  {
    title: "Review attendance corrections",
    meta: "12 requests awaiting approval",
    tag: "Attendance",
    color: "bg-amber-100 text-amber-700",
  },
  {
    title: "Publish Diwali holiday notice",
    meta: "Scheduled for 4:00 PM today",
    tag: "Notice",
    color: "bg-blue-100 text-blue-700",
  },
];
const alerts = [
  {
    icon: TrendingDown,
    title: "38 students below 75% attendance",
    text: "Across all PUC streams",
    tone: "bg-rose-50 text-rose-600",
  },
  {
    icon: UserCheck,
    title: "Faculty workload balanced",
    text: "92% within assigned limit",
    tone: "bg-emerald-50 text-emerald-600",
  },
];

export function Dashboard({ user, active = "Overview" }: { user: SessionUser; active?: string }) {
  const router = useRouter();
  const [menu, setMenu] = useState(false);
  const [notice, setNotice] = useState(true);
  function navigate(label: string) {
    router.push(label === "Overview" ? "/dashboard" : `/dashboard/${label.toLowerCase()}`);
  }
  return (
    <div className="min-h-screen lg:flex">
      {menu && (
        <button
          aria-label="Close navigation"
          className="fixed inset-0 z-30 bg-black/30 lg:hidden"
          onClick={() => setMenu(false)}
        />
      )}
      <AdminSidebar user={user} active={active} menuOpen={menu} onSelect={navigate} onClose={() => setMenu(false)} />
      {/*
            <p className="truncate text-xs text-slate-500">
              College Admin · Sign out
            </p>
          </div>
          <MoreHorizontal size={18} />
        </button>
      */}
      <main className="min-w-0 flex-1">
        <AdminHeader onOpenMenu={() => setMenu(true)} />
        {/*
        <header className="sticky top-0 z-20 flex h-[72px] items-center gap-3 border-b border-slate-200 bg-white/90 px-4 backdrop-blur lg:px-8">
          <button
            className="rounded-lg p-2 hover:bg-slate-100 lg:hidden"
            onClick={() => setMenu(true)}
          >
            <Menu />
          </button>
          <div className="relative hidden max-w-md flex-1 md:block">
            <Search
              className="absolute left-3 top-2.5 text-slate-400"
              size={18}
            />
            <input
              aria-label="Global search"
              placeholder="Search students, faculty, or actions…"
              className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-10 pr-4 text-sm outline-none focus:border-brand-500 focus:bg-white"
            />
          </div>
          <div className="ml-auto flex items-center gap-2">
            <button
              className="relative rounded-xl border border-slate-200 p-2.5 hover:bg-slate-50"
              aria-label="Notifications"
            >
              <Bell size={19} />
              <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-rose-500 ring-2 ring-white" />
            </button>
            <button className="hidden rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-brand-700 sm:block">
              + Quick action
            </button>
          </div>
        </header>
        */}
        <div className="mx-auto max-w-[1500px] p-4 lg:p-8">
          {active !== "Overview" &&
            (active === "Timetable" ? (
              <TimetableWorkspace />
            ) : active === "Attendance" ? (
              <AttendanceWorkspace />
            ) : active === "Examinations" ? (
              <ExaminationsWorkspace />
            ) : active === "Parents" ? (
              <ParentManagementWorkspace />
            ) : (
              <ModuleWorkspace module={active} />
            ))}
          <div className={active === "Overview" ? "" : "hidden"}>
            <section className="mb-7 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
              <div>
                <p className="mb-1 text-sm font-medium text-brand-700">
                  THURSDAY, 15 OCTOBER
                </p>
                <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
                  Good morning, Ananya
                </h1>
                <p className="mt-1 text-sm text-slate-500">
                  Here’s what’s happening across your college today.
                </p>
              </div>
              <button className="flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium shadow-sm">
                <CalendarDays size={17} />
                Academic year 2026–27
                <ChevronDown size={15} />
              </button>
            </section>
            {notice && (
              <div className="mb-6 flex items-start gap-3 rounded-2xl bg-slate-900 p-4 text-white shadow-soft">
                <div className="rounded-lg bg-white/10 p-2">
                  <Sparkles size={19} className="text-emerald-300" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-semibold">
                    Your daily operations brief is ready
                  </p>
                  <p className="mt-1 text-xs text-slate-300">
                    3 approvals, 2 timetable conflicts, and 38 attendance
                    interventions need attention.
                  </p>
                </div>
                <button
                  onClick={() => setNotice(false)}
                  className="rounded-lg p-1 hover:bg-white/10"
                >
                  <X size={18} />
                </button>
              </div>
            )}
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {[
                [
                  "Total students",
                  "4,862",
                  "+6.2%",
                  GraduationCap,
                  "bg-emerald-50 text-emerald-700",
                ],
                [
                  "Faculty members",
                  "284",
                  "+12 this year",
                  Users,
                  "bg-blue-50 text-blue-700",
                ],
                [
                  "Today’s attendance",
                  "92.4%",
                  "+1.8%",
                  ClipboardCheck,
                  "bg-violet-50 text-violet-700",
                ],
              ].map(([label, value, change, Icon, tone]) => (
                <div
                  key={label as string}
                  className="rounded-2xl border border-slate-200 bg-white p-5 shadow-soft"
                >
                  <div className="flex items-center justify-between">
                    <div className={`rounded-xl p-2.5 ${tone}`}>
                      <Icon size={20} />
                    </div>
                    <span className="flex items-center gap-1 text-xs font-semibold text-emerald-600">
                      <TrendingUp size={13} />
                      {change as string}
                    </span>
                  </div>
                  <p className="mt-5 text-2xl font-bold">{value as string}</p>
                  <p className="mt-1 text-sm text-slate-500">
                    {label as string}
                  </p>
                </div>
              ))}
            </div>
            <div className="mt-5 grid gap-5 xl:grid-cols-5">
              <ChartCard
                title="Attendance trend"
                subtitle="Average attendance across all streams"
                className="xl:col-span-3"
              >
                <ResponsiveContainer width="100%" height={250}>
                  <AreaChart data={attendance}>
                    <defs>
                      <linearGradient id="green" x1="0" y1="0" x2="0" y2="1">
                        <stop
                          offset="5%"
                          stopColor="var(--color-chart-primary)"
                          stopOpacity={0.25}
                        />
                        <stop
                          offset="95%"
                          stopColor="var(--color-chart-primary)"
                          stopOpacity={0}
                        />
                      </linearGradient>
                    </defs>
                    <CartesianGrid
                      vertical={false}
                      stroke="rgb(var(--color-chart-grid))"
                    />
                    <XAxis
                      dataKey="m"
                      axisLine={false}
                      tickLine={false}
                      fontSize={12}
                    />
                    <YAxis
                      domain={[70, 100]}
                      axisLine={false}
                      tickLine={false}
                      fontSize={12}
                    />
                    <Tooltip />
                    <Area
                      type="monotone"
                      dataKey="v"
                      stroke="var(--color-chart-secondary)"
                      strokeWidth={3}
                      fill="url(#green)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </ChartCard>
              <ChartCard
                title="Enrollment by department"
                subtitle="Active student distribution"
                className="xl:col-span-2"
              >
                <ResponsiveContainer width="100%" height={250}>
                  <BarChart data={enrollment} layout="vertical">
                    <CartesianGrid
                      horizontal={false}
                      stroke="rgb(var(--color-chart-grid))"
                    />
                    <XAxis type="number" hide />
                    <YAxis
                      dataKey="n"
                      type="category"
                      axisLine={false}
                      tickLine={false}
                      fontSize={12}
                    />
                    <Tooltip />
                    <Bar
                      dataKey="v"
                      fill="var(--color-chart-primary)"
                      radius={[0, 7, 7, 0]}
                      barSize={18}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </ChartCard>
            </div>
            <div className="mt-5 grid gap-5 xl:grid-cols-5">
              <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-soft xl:col-span-3">
                <div className="mb-4 flex items-center justify-between">
                  <div>
                    <h2 className="font-bold">Needs your attention</h2>
                    <p className="mt-1 text-xs text-slate-500">
                      Priority approvals and scheduled actions
                    </p>
                  </div>
                  <button className="text-sm font-semibold text-brand-700">
                    View all
                  </button>
                </div>
                <div className="space-y-2">
                  {tasks.map((t, i) => (
                    <button
                      key={t.title}
                      className="flex w-full items-center gap-3 rounded-xl border border-slate-100 p-3 text-left hover:border-brand-200 hover:bg-brand-50/40"
                    >
                      <span className="grid h-8 w-8 place-items-center rounded-full border border-slate-200 text-xs font-bold">
                        {i + 1}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold">
                          {t.title}
                        </span>
                        <span className="block text-xs text-slate-500">
                          {t.meta}
                        </span>
                      </span>
                      <span
                        className={`hidden rounded-full px-2.5 py-1 text-[11px] font-semibold sm:block ${t.color}`}
                      >
                        {t.tag}
                      </span>
                    </button>
                  ))}
                </div>
              </section>
              <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-soft xl:col-span-2">
                <h2 className="font-bold">Campus pulse</h2>
                <p className="mt-1 text-xs text-slate-500">
                  Live operational signals
                </p>
                <div className="mt-4 space-y-3">
                  {alerts.map(({ icon: Icon, title, text, tone }) => (
                    <div key={title} className="flex items-start gap-3">
                      <div className={`rounded-xl p-2.5 ${tone}`}>
                        <Icon size={18} />
                      </div>
                      <div>
                        <p className="text-sm font-semibold">{title}</p>
                        <p className="mt-0.5 text-xs text-slate-500">{text}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
function ChartCard({
  title,
  subtitle,
  className = "",
  children,
}: {
  title: string;
  subtitle: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section
      className={`rounded-2xl border border-slate-200 bg-white p-5 shadow-soft ${className}`}
    >
      <div className="mb-5 flex items-center justify-between">
        <div>
          <h2 className="font-bold">{title}</h2>
          <p className="mt-1 text-xs text-slate-500">{subtitle}</p>
        </div>
        <button className="rounded-lg p-2 hover:bg-slate-50">
          <MoreHorizontal size={19} />
        </button>
      </div>
      {children}
    </section>
  );
}
