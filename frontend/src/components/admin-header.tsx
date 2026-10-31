"use client";
import { Bell, Menu, Search } from "lucide-react";

export function AdminHeader({ onOpenMenu }: { onOpenMenu: () => void }) {
  return (
    <header className="sticky top-0 z-20 flex h-[72px] items-center gap-3 border-b border-slate-200 bg-white/90 px-4 backdrop-blur lg:px-8">
      <button
        className="rounded-lg p-2 hover:bg-slate-100 lg:hidden"
        onClick={onOpenMenu}
      >
        <Menu />
      </button>
      <div className="relative hidden max-w-md flex-1 md:block">
        <Search className="absolute left-3 top-2.5 text-slate-400" size={18} />
        <input
          aria-label="Global search"
          placeholder="Search students, faculty, or actions…"
          className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-10 pr-4 text-sm outline-none focus:border-brand-500 focus:bg-white"
        />
      </div>
      <div className="ml-auto flex items-center gap-2">
        {/* <button className="hidden rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-brand-700 sm:block">
          + Quick action
        </button> */}
        <button
          className="relative rounded-xl border border-slate-200 p-2.5 hover:bg-slate-50"
          aria-label="Notifications"
        >
          <Bell size={19} />
          <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-rose-500 ring-2 ring-white" />
        </button>
      </div>
    </header>
  );
}
