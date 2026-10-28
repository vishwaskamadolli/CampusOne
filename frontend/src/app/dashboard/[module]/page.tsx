"use client";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { LoaderCircle } from "lucide-react";
import { Dashboard } from "@/components/dashboard";
import { RolePortal } from "@/components/role-portal";
import { api, SessionUser } from "@/lib/api";

const modules: Record<string, string> = {
  students: "Students",
  parents: "Parents",
  faculty: "Faculty",
  academics: "Academics",
  attendance: "Attendance",
  timetable: "Timetable",
  examinations: "Examinations",
  events: "Events",
};

export default function DashboardModulePage() {
  const { module } = useParams<{ module: string }>();
  const router = useRouter();
  const [user, setUser] = useState<SessionUser | null>(null);
  const active = modules[module];
  useEffect(() => {
    if (!active) { router.replace("/dashboard"); return; }
    api<SessionUser>("/auth/me").then((session) => session.mustChangePassword ? router.replace("/change-password") : setUser(session)).catch(() => router.replace("/login"));
  }, [active, router]);
  if (!user || !active) return <main className="grid min-h-screen place-items-center bg-canvas"><LoaderCircle className="animate-spin text-brand-600"/></main>;
  if (!user.roles.includes("admin")) return <RolePortal user={user}/>;
  return <Dashboard user={user} active={active}/>;
}
