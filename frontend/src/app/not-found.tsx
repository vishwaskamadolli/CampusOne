import Link from "next/link";
import { GraduationCap } from "lucide-react";

export default function NotFound() {
  return <main className="grid min-h-screen place-items-center bg-canvas p-6"><section className="max-w-md rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-soft"><GraduationCap className="mx-auto text-brand-600" size={40}/><p className="mt-5 text-sm font-semibold text-brand-700">404</p><h1 className="mt-2 text-2xl font-bold">Page not found</h1><p className="mt-2 text-sm text-slate-500">The requested college management page does not exist or is unavailable to your role.</p><Link href="/dashboard" className="mt-6 inline-block rounded-xl bg-brand-600 px-5 py-3 text-sm font-semibold text-white">Return to dashboard</Link></section></main>;
}
