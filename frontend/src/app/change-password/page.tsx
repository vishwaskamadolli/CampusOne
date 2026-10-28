"use client";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { KeyRound, LoaderCircle } from "lucide-react";
import { AuthShell } from "@/components/auth-shell";
import { api } from "@/lib/api";
import { toastAction } from "@/lib/toast";

export default function ChangePasswordPage() {
  const router = useRouter();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (newPassword !== confirmPassword) return setError("New passwords do not match");
    setLoading(true); setError("");
    try {
      await toastAction(() => api("/auth/change-password", { method: "POST", body: JSON.stringify({ currentPassword, newPassword }) }), { loading: "Updating password…", success: "Password updated. Sign in again" });
      router.replace("/login");
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to change password"); }
    finally { setLoading(false); }
  }
  return <AuthShell title="Change temporary password" subtitle="Choose a private password before continuing to your dashboard."><form onSubmit={submit} className="space-y-4"><label className="block text-sm font-semibold">Temporary password<input required type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-4 py-3"/></label><label className="block text-sm font-semibold">New password<input required minLength={10} type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-4 py-3"/></label><label className="block text-sm font-semibold">Confirm new password<input required minLength={10} type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-4 py-3"/></label>{error && <p className="rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}<button disabled={loading} className="flex w-full items-center justify-center gap-2 rounded-xl bg-brand-600 py-3 font-semibold text-white disabled:opacity-60">{loading ? <LoaderCircle className="animate-spin" size={18}/> : <KeyRound size={18}/>}Change password</button></form></AuthShell>;
}
