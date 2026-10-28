 "use client";

import { useRouter } from "next/navigation";
import {
  Activity,
  BookOpen,
  CalendarClock,
  CalendarDays,
  ClipboardCheck,
  GraduationCap,
  LayoutDashboard,
  MoreHorizontal,
  Settings,
  Users,
  X,
} from "lucide-react";
import { api, SessionUser } from "@/lib/api";

const nav = [
  { label: "Overview", icon: LayoutDashboard },
  { label: "Students", icon: GraduationCap },
  { label: "Parents", icon: Users },
  { label: "Faculty", icon: Users },
  { label: "Academics", icon: BookOpen },
  { label: "Attendance", icon: ClipboardCheck },
  { label: "Timetable", icon: CalendarClock },
  { label: "Examinations", icon: Activity },
  { label: "Events", icon: CalendarDays },
];

export function AdminSidebar({
  user,
  active, 
 menuOpen,
  onSelect,
  onClose,
}: {
  user: SessionUser;
  active: string;
  menuOpen: boolean;
  onSelect: (label: string) => void;
  onClose: () => void;
}) {
  const router = useRouter();

  async function logout() {
    await api("/auth/logout", { method: "POST" });
    router.push("/login");
  }

  return (
    <aside
      aria-label="Admin sidebar"
      className={`fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r border-slate-200/80 bg-white shadow-xl shadow-slate-900/5 transition-transform duration-200 lg:sticky lg:top-0 lg:h-screen lg:shadow-none ${
        menuOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
      }`}
    >
      {/* Branding */}
      <div className="flex h-[88px] shrink-0 items-center justify-between border-b border-slate-100 px-5">
        <div className="flex min-w-0 items-center gap-3">
          <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-brand-600 text-white shadow-sm shadow-brand-600/20">
            <GraduationCap size={23} strokeWidth={1.9} />
          </div>
          <div className="min-w-0">
            <div className="truncate text-[17px] font-bold tracking-tight text-slate-900">CampusOne</div>
            <div className="mt-0.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">College ERP</div>
          </div>
        </div>
        <button
          type="button"
          aria-label="Close navigation"
          onClick={onClose}
          className="rounded-lg p-2 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900 lg:hidden"
        >
          <X size={20} />
        </button>
      </div>

      {/* Main navigation */}
      <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-4 pt-6">
        <p className="mb-3 px-3 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">Workspace</p>
        <nav aria-label="Admin navigation" className="space-y-1">
          {nav.map(({ label, icon: Icon }) => {
            const selected = active === label;
            return (
              <button
                type="button"
                key={label}
                aria-current={selected ? "page" : undefined}
                onClick={() => {
                  onSelect(label);
                  onClose();
                }}
                className={`group relative flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-[13px] font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 ${
                  selected
                    ? "bg-brand-50 font-semibold text-brand-700"
                    : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                }`}
              >
                {selected && <span aria-hidden="true" className="absolute bottom-2 left-0 top-2 w-[3px] rounded-r-full bg-brand-600" />}
                <Icon
                  size={19}
                  strokeWidth={selected ? 2.2 : 1.8}
                  className={`shrink-0 ${selected ? "text-brand-600" : "text-slate-400 group-hover:text-slate-600"}`}
                />
                <span className="flex-1">{label}</span>
                {label === "Attendance" && (
                  <span className="rounded-md bg-rose-100 px-2 py-0.5 text-[10px] font-bold text-rose-700">12</span>
                )}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Settings and account */}
      <div className="shrink-0 border-t border-slate-100 px-3 pb-4 pt-3">
        <button
          type="button"
          className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-[13px] font-medium text-slate-600 transition-colors hover:bg-slate-50 hover:text-slate-900"
        >
          <Settings size={19} strokeWidth={1.8} className="text-slate-400" />
          Settings
        </button>
        <button
          type="button"
          onClick={logout}
          aria-label={`Sign out ${user.name}`}
          className="mt-3 flex w-full items-center gap-3 rounded-2xl border border-slate-100 bg-slate-50/80 p-3 text-left transition-colors hover:border-slate-200 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
        >
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-slate-900 text-xs font-semibold text-white">
            {user.name
              .split(" ")
              .map((part) => part[0])
              .slice(0, 2)
              .join("")}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] font-semibold text-slate-900">{user.name}</p>
            <p className="mt-0.5 truncate text-[11px] text-slate-500">College Admin · Sign out</p>
          </div>
          <MoreHorizontal size={18} className="shrink-0 text-slate-400" />
        </button>
      </div>
    </aside>
  );
}
