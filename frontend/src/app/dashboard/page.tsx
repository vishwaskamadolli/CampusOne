"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle } from "lucide-react";
import { api, SessionUser } from "@/lib/api";
import { Dashboard } from "@/components/dashboard";
import { RolePortal } from "@/components/role-portal";
export default function PortalPage() {
  const router = useRouter();
  const [user, setUser] = useState<SessionUser | null>(null);
  useEffect(() => {
    api<SessionUser>("/auth/me")
      .then((session) => session.mustChangePassword ? router.replace("/change-password") : setUser(session))
      .catch(() => router.replace("/login"));
  }, [router]);
  if (!user)
    return (
      <main className="grid min-h-screen place-items-center bg-canvas">
        <LoaderCircle className="animate-spin text-brand-600" />
      </main>
    );
  if (user.roles.includes("admin")) return <Dashboard user={user} />;
  return <RolePortal user={user} />;
}
