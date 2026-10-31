"use client";
import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Award,
  Bell,
  BookOpen,
  CalendarClock,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronRight,
  ClipboardCheck,
  GraduationCap,
  LoaderCircle,
  LogOut,
  Phone,
  RefreshCw,
  RotateCcw,
  ShieldAlert,
  ShieldCheck,
  Smartphone,
  Sparkles,
  TrendingUp,
  Users,
  X,
} from "lucide-react";
import { api, SessionUser } from "@/lib/api";
import { toastAction, toastError, toastSuccess } from "@/lib/toast";
import { TimetableWorkspace } from "@/components/timetable-workspace";
import { TeacherAttendanceWorkspace } from "@/components/teacher-attendance";
import { ParentAttendanceCalendar } from "@/components/parent-attendance-calendar";
import { ExamTimetableList } from "@/components/exam-timetable-list";

type Row = Record<string, any> & { _id: string };

export function RolePortal({ user }: { user: SessionUser }) {
  const router = useRouter();
  const teacher = user.roles.includes("teacher");
  const [today, setToday] = useState("");

  useEffect(() => {
    setToday(
      new Intl.DateTimeFormat("en-IN", {
        day: "2-digit",
        month: "long",
        year: "numeric",
      }).format(new Date())
    );
  }, []);

  async function logout() {
    await api("/auth/logout", { method: "POST" });
    router.push("/login");
  }

  return (
    <main className="min-h-screen bg-canvas">
      <header className="flex h-20 items-center border-b border-slate-200 bg-white px-4 sm:px-5 lg:px-10">
        <div className="flex items-center gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-brand-600 text-white">
            <GraduationCap size={21} />
          </span>
          <div>
            <b>CampusOne</b>
            <p className="text-xs text-slate-500">
              {teacher ? "Teacher" : "Parent"} portal
            </p>
          </div>
        </div>
        <button
          onClick={logout}
          className="ml-auto flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold transition hover:bg-slate-50"
        >
          <LogOut size={17} />
          <span className="hidden sm:inline">Logout</span>
        </button>
      </header>
      <div className="mx-auto max-w-7xl p-4 sm:p-5 lg:p-10">
        <p className="min-h-5 text-sm font-semibold uppercase text-brand-700" suppressHydrationWarning>
          {today}
        </p>
        <h1 className="mt-2 text-2xl font-bold text-slate-900 sm:text-3xl">
          Welcome, {user.name}
        </h1>
        <p className="mt-1 text-slate-500">
          {teacher
            ? "Manage only your assigned classes, attendance, and results."
            : "Attendance, published results, events, and alerts for your linked children."}
        </p>

        {teacher ? <TeacherAttendanceWorkspace /> : <ParentWorkspace user={user} />}
      </div>
    </main>
  );
}

function SummaryCard({
  icon: Icon,
  label,
  value,
  tone = "default",
}: {
  icon: any;
  label: string;
  value: string | number;
  tone?: "default" | "amber" | "emerald";
}) {
  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-soft">
      <div className="flex items-center justify-between">
        <p className="text-xs text-slate-500 sm:text-sm">{label}</p>
        <span
          className={`rounded-xl p-2 ${
            tone === "amber"
              ? "bg-amber-50 text-amber-700"
              : tone === "emerald"
              ? "bg-emerald-50 text-emerald-700"
              : "bg-brand-50 text-brand-700"
          }`}
        >
          <Icon size={18} />
        </span>
      </div>
      <p className="mt-3 text-xl font-bold text-slate-900 sm:text-2xl">{value}</p>
    </article>
  );
}

function OtpVerificationModal({
  phone,
  onClose,
  onVerified,
}: {
  phone: string;
  onClose: () => void;
  onVerified: () => void;
}) {
  const [otp, setOtp] = useState(["", "", "", "", "", ""]);
  const [error, setError] = useState("");
  const [timer, setTimer] = useState(30);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const demoOtp = process.env.NEXT_PUBLIC_DEMO_OTP || "123456";

  useEffect(() => {
    inputRefs.current[0]?.focus();
  }, []);

  useEffect(() => {
    if (timer <= 0) return;
    const interval = setInterval(() => setTimer((t) => t - 1), 1000);
    return () => clearInterval(interval);
  }, [timer]);

  const handleChange = (index: number, value: string) => {
    if (!/^\d*$/.test(value)) return;
    const digit = value.slice(-1);
    const newOtp = [...otp];
    newOtp[index] = digit;
    setOtp(newOtp);
    setError("");

    if (digit && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace" && !otp[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData("text").trim();
    if (!/^\d+$/.test(pasted)) return;
    const digits = pasted.slice(0, 6).split("");
    const newOtp = [...otp];
    digits.forEach((d, i) => {
      newOtp[i] = d;
    });
    setOtp(newOtp);
    setError("");
    const nextIdx = Math.min(digits.length, 5);
    inputRefs.current[nextIdx]?.focus();
  };

  const handleVerify = () => {
    const entered = otp.join("");
    if (entered.length < 6) {
      setError("Please enter the complete 6-digit OTP code");
      return;
    }
    setIsSubmitting(true);
    setTimeout(() => {
      if (entered === demoOtp) {
        setSuccess(true);
        setError("");
        setTimeout(() => {
          onVerified();
        }, 1200);
      } else {
        setError(`Invalid OTP. Please enter the test code ${demoOtp}.`);
        setIsSubmitting(false);
      }
    }, 400);
  };

  const handleResend = () => {
    setOtp(["", "", "", "", "", ""]);
    setError("");
    setTimer(30);
    toastSuccess(`New OTP sent to ${phone}! (Test code: ${demoOtp})`);
    inputRefs.current[0]?.focus();
  };

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-slate-950/50 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
    >
      <div className="w-full max-w-md overflow-hidden rounded-3xl bg-white p-6 shadow-2xl transition-all sm:p-7">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <span className="grid h-11 w-11 place-items-center rounded-2xl bg-brand-50 text-brand-600">
              <Smartphone size={22} />
            </span>
            <div>
              <h3 className="text-xl font-bold text-slate-900">Verify Phone Number</h3>
              <p className="text-xs text-slate-500">6-digit SMS verification code</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-xl p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          >
            <X size={20} />
          </button>
        </div>

        {success ? (
          <div className="py-8 text-center">
            <div className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-emerald-100 text-emerald-600">
              <CheckCircle2 size={36} />
            </div>
            <h4 className="mt-4 text-lg font-bold text-slate-900">Verification Successful!</h4>
            <p className="mt-1 text-sm text-slate-500">
              Your mobile number <span className="font-semibold text-slate-800">{phone}</span> has been verified.
            </p>
          </div>
        ) : (
          <div className="mt-6">
            <p className="text-sm text-slate-600">
              Enter the 6-digit verification code sent to{" "}
              <strong className="text-slate-900">{phone}</strong>.
            </p>

            <div className="mt-2 rounded-xl bg-amber-50/80 p-2.5 text-center text-xs font-medium text-amber-800">
              Test verification code: <code className="font-bold underline">{demoOtp}</code>
            </div>

            <div className="mt-5 flex justify-center gap-2 sm:gap-2.5" onPaste={handlePaste}>
              {otp.map((digit, idx) => (
                <input
                  key={idx}
                  ref={(el) => {
                    inputRefs.current[idx] = el;
                  }}
                  type="text"
                  inputMode="numeric"
                  maxLength={1}
                  value={digit}
                  onChange={(e) => handleChange(idx, e.target.value)}
                  onKeyDown={(e) => handleKeyDown(idx, e)}
                  className={`h-12 w-11 rounded-xl border text-center text-xl font-bold outline-none transition sm:h-14 sm:w-12 ${
                    error
                      ? "border-rose-400 bg-rose-50/50 text-rose-900"
                      : digit
                      ? "border-brand-500 bg-brand-50/30 text-brand-700 ring-2 ring-brand-100"
                      : "border-slate-200 bg-white text-slate-900 focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
                  }`}
                />
              ))}
            </div>

            {error && <p className="mt-3 text-center text-xs font-semibold text-rose-600">{error}</p>}

            <div className="mt-5 flex items-center justify-between text-xs text-slate-500">
              <span>Didn&apos;t receive code?</span>
              {timer > 0 ? (
                <span className="font-medium text-slate-400">Resend in {timer}s</span>
              ) : (
                <button
                  type="button"
                  onClick={handleResend}
                  className="font-bold text-brand-600 hover:text-brand-700 hover:underline"
                >
                  Resend Code
                </button>
              )}
            </div>

            <div className="mt-6 flex gap-3">
              <button
                type="button"
                onClick={onClose}
                className="w-1/3 rounded-xl border border-slate-200 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={otp.join("").length < 6 || isSubmitting}
                onClick={handleVerify}
                className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-brand-600 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-700 disabled:opacity-50"
              >
                {isSubmitting ? <LoaderCircle className="animate-spin" size={17} /> : <Check size={17} />}
                Verify OTP
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function PhoneVerificationBanner({
  phone,
  verified,
  onOpenModal,
}: {
  phone: string;
  verified: boolean;
  onOpenModal: () => void;
}) {
  if (verified) {
    return (
      <div className="mb-6 flex items-center justify-between rounded-2xl border border-emerald-200 bg-emerald-50/70 px-4 py-3 text-sm text-emerald-900 shadow-sm">
        <div className="flex items-center gap-3">
          <span className="grid h-8 w-8 place-items-center rounded-xl bg-emerald-600 text-white">
            <ShieldCheck size={18} />
          </span>
          <div>
            <p className="font-semibold">Mobile Number Verified</p>
            <p className="text-xs text-emerald-700">
              {phone} is verified for real-time SMS absence alerts and exam notices.
            </p>
          </div>
        </div>
        <span className="rounded-lg bg-emerald-100 px-2.5 py-1 text-xs font-bold text-emerald-800">
          Active
        </span>
      </div>
    );
  }

  return (
    <div className="mb-6 flex flex-col justify-between gap-4 rounded-2xl border border-amber-200 bg-gradient-to-r from-amber-50 to-amber-100/60 p-4 shadow-sm sm:flex-row sm:items-center sm:p-5">
      <div className="flex items-start gap-3.5">
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-amber-500 text-white shadow-sm">
          <Phone size={20} />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <h3 className="font-bold text-slate-900">Verify your mobile number</h3>
            <span className="rounded-md bg-amber-200/80 px-2 py-0.5 text-[11px] font-bold text-amber-900">
              Action Required
            </span>
          </div>
          <p className="mt-1 text-xs text-slate-600 sm:text-sm">
            Your registered number <strong className="text-slate-800">{phone}</strong> is unverified. Verify now to receive instant SMS notifications for attendance and emergencies.
          </p>
        </div>
      </div>
      <button
        onClick={onOpenModal}
        className="flex shrink-0 items-center justify-center gap-2 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-700 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2"
      >
        <Smartphone size={16} />
        Verify Number
      </button>
    </div>
  );
}

function ParentWorkspace({ user }: { user: SessionUser }) {
  const [view, setView] = useState<"overview" | "timetable" | "exams" | "results" | "notices">("overview");
  const [children, setChildren] = useState<Row[]>([]);
  const [selected, setSelected] = useState("");
  const [summary, setSummary] = useState<any>(null);
  const [results, setResults] = useState<Row[]>([]);
  const [events, setEvents] = useState<Row[]>([]);
  const [notifications, setNotifications] = useState<Row[]>([]);
  const [exams, setExams] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  // Phone verification state
  const phone = user.phone || "+91 98765 43210";
  const [isVerified, setIsVerified] = useState(false);
  const [otpModalOpen, setOtpModalOpen] = useState(false);

  useEffect(() => {
    const saved = typeof window !== "undefined" ? localStorage.getItem(`campusone_parent_phone_verified_${user.id}`) : null;
    setIsVerified(saved === "true");
  }, [user.id]);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [c, r, e, n, ex] = await Promise.all([
        api<Row[]>("/people/students"),
        api<Row[]>("/results"),
        api<Row[]>("/events"),
        api<Row[]>("/notifications"),
        api<Row[]>("/examinations").catch(() => []),
      ]);
      setChildren(c);
      setResults(r);
      setEvents(e);
      setNotifications(n);
      setExams(ex);
      if (c[0]) setSelected(c[0]._id);
    } catch (err) {
      toastError(err, "Unable to load parent portal data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  useEffect(() => {
    if (selected) {
      api(`/attendance/summary/${selected}`)
        .then(setSummary)
        .catch(() => setSummary(null));
    }
  }, [selected]);

  const child = children.find((c) => c._id === selected);
  const childResults = results.filter((r) => r.studentId?._id === selected);
  const unreadAlerts = notifications.filter((n) => !n.readAt);

  // Calendar month filter
  const [eventMonth, setEventMonth] = useState("");

  const filteredEvents = events.filter((e) => {
    if (!eventMonth) return true;
    const startMonth = (e.startsAt || "").substring(0, 7);
    const endMonth = e.endsAt ? (e.endsAt || "").substring(0, 7) : startMonth;
    if (!startMonth) return false;
    return eventMonth >= startMonth && eventMonth <= endMonth;
  });

  const markNotificationRead = async (id: string) => {
    try {
      await api(`/notifications/${id}/read`, { method: "PATCH" });
      setNotifications((current) =>
        current.map((n) => (n._id === id ? { ...n, readAt: new Date().toISOString() } : n))
      );
      toastSuccess("Notification marked as read");
    } catch {
      // Ignored
    }
  };

  const handleVerifiedSuccess = () => {
    setIsVerified(true);
    localStorage.setItem(`campusone_parent_phone_verified_${user.id}`, "true");
    setOtpModalOpen(false);
    toastSuccess("Mobile number verified successfully!");
  };

  const navItems = [
    { key: "overview", label: "Classes & Attendance", icon: BookOpen },
    { key: "timetable", label: "Class Timetable", icon: CalendarClock },
    { key: "exams", label: "Exam Timetable", icon: ClipboardCheck },
    { key: "results", label: "Results & Grades", icon: GraduationCap },
    {
      key: "notices",
      label: "Events & Notices",
      icon: Bell,
      badge: unreadAlerts.length || undefined,
    },
  ];

  if (loading) {
    return (
      <div className="grid min-h-64 place-items-center">
        <LoaderCircle className="animate-spin text-brand-600" size={32} />
      </div>
    );
  }

  return (
    <div className="mt-8 space-y-6">
      {/* Phone verification banner */}
      <PhoneVerificationBanner
        phone={phone}
        verified={isVerified}
        onOpenModal={() => {
          setOtpModalOpen(true);
          toastSuccess(`Verification code sent to ${phone}! (Test code: ${process.env.NEXT_PUBLIC_DEMO_OTP || "123456"})`);
        }}
      />

      {/* Navigation tabs matching Teacher Workspace */}
      <nav className="grid grid-cols-2 rounded-2xl border border-slate-200 bg-white p-1 shadow-sm sm:grid-cols-5">
        {navItems.map(({ key, label, icon: Icon, badge }) => (
          <button
            key={key}
            onClick={() => setView(key as any)}
            className={`relative flex min-w-0 flex-col items-center justify-center gap-1 rounded-xl px-2 py-2.5 text-xs font-semibold sm:flex-row sm:gap-2 sm:px-3 sm:text-sm ${
              view === key
                ? "bg-brand-50 font-semibold text-brand-700"
                : "text-slate-500 hover:bg-slate-50 hover:text-slate-900"
            }`}
          >
            <Icon size={17} />
            <span className="truncate">{label}</span>
            {badge ? (
              <span className="rounded-full bg-rose-500 px-1.5 py-0.5 text-[10px] font-bold text-white">
                {badge}
              </span>
            ) : null}
          </button>
        ))}
      </nav>

      {/* Linked Children selector */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-soft">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="font-bold text-slate-900">My Children</h2>
            <p className="mt-1 text-sm text-slate-500">
              Select a child to view their academic profile, timetable, and reports.
            </p>
          </div>
          <Users className="text-brand-600" size={20} />
        </div>
        <div className="mt-4 flex flex-wrap gap-2.5">
          {children.length ? (
            children.map((c) => {
              const isSelected = selected === c._id;
              return (
                <button
                  key={c._id}
                  onClick={() => setSelected(c._id)}
                  className={`flex items-center gap-3 rounded-xl border p-3 text-left transition-all ${
                    isSelected
                      ? "border-brand-500 bg-brand-50/70 shadow-sm ring-1 ring-brand-500"
                      : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50"
                  }`}
                >
                  <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand-600 text-sm font-bold text-white">
                    {c.name
                      .split(" ")
                      .map((n: string) => n[0])
                      .slice(0, 2)
                      .join("")}
                  </div>
                  <div>
                    <b className="text-sm font-semibold text-slate-900">{c.name}</b>
                    <p className="text-xs text-slate-500">
                      {c.rollNumber} · {c.courseId?.name} · {c.departmentId?.name}
                      {c.sectionId?.name ? ` (${c.sectionId?.name})` : ""}
                    </p>
                  </div>
                </button>
              );
            })
          ) : (
            <p className="py-4 text-sm text-slate-500">No linked children found for this account.</p>
          )}
        </div>
      </div>

      {/* Tab: Overview & Attendance */}
      {view === "overview" && (
        <>
          {child && (
            <>
              {/* Summary Metrics */}
              <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
                <SummaryCard
                  icon={ClipboardCheck}
                  label="Attendance Rate"
                  value={`${summary?.percentage ?? 0}%`}
                  tone={(summary?.percentage ?? 0) < 75 ? "amber" : "emerald"}
                />
                <SummaryCard
                  icon={BookOpen}
                  label="Graded Subjects"
                  value={childResults.length}
                />
                <SummaryCard
                  icon={CalendarClock}
                  label="Upcoming Exams"
                  value={exams.length}
                />
                <SummaryCard
                  icon={Bell}
                  label="Unread Alerts"
                  value={unreadAlerts.length}
                  tone={unreadAlerts.length > 0 ? "amber" : "default"}
                />
              </div>

              {/* Quick Actions Shortcuts matching Teacher Dashboard */}
              <section className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-soft sm:grid-cols-4">
                <button
                  onClick={() => setView("timetable")}
                  className="flex items-center gap-3 rounded-xl bg-blue-50 p-3 text-left text-sm font-semibold text-blue-800 transition hover:bg-blue-100/70"
                >
                  <CalendarClock size={19} />
                  Class Timetable
                </button>
                <button
                  onClick={() => setView("exams")}
                  className="flex items-center gap-3 rounded-xl bg-violet-50 p-3 text-left text-sm font-semibold text-violet-800 transition hover:bg-violet-100/70"
                >
                  <ClipboardCheck size={19} />
                  Exam Timetable
                </button>
                <button
                  onClick={() => setView("results")}
                  className="flex items-center gap-3 rounded-xl bg-emerald-50 p-3 text-left text-sm font-semibold text-emerald-800 transition hover:bg-emerald-100/70"
                >
                  <GraduationCap size={19} />
                  Report Cards
                </button>
                <button
                  onClick={() => setView("notices")}
                  className="flex items-center gap-3 rounded-xl bg-brand-50 p-3 text-left text-sm font-semibold text-brand-800 transition hover:bg-brand-100/70"
                >
                  <Bell size={19} />
                  College Notices
                </button>
              </section>

              {/* Attendance Status Breakdown */}
              {summary && summary.breakdown && (
                <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-soft">
                  <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-center">
                    <div>
                      <h3 className="font-bold text-slate-900">Attendance Standing</h3>
                      <p className="text-xs text-slate-500">
                        Total {summary.total} sessions conducted in this academic term.
                      </p>
                    </div>
                    <span
                      className={`w-fit rounded-full px-3 py-1 text-xs font-semibold ${
                        summary.percentage >= 75
                          ? "bg-emerald-50 text-emerald-700"
                          : "bg-rose-50 text-rose-700"
                      }`}
                    >
                      {summary.percentage >= 75 ? "Satisfactory (>= 75%)" : "Attendance Warning (< 75%)"}
                    </span>
                  </div>

                  <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                    <div className="rounded-xl border border-emerald-100 bg-emerald-50/50 p-3 text-center">
                      <p className="text-xs font-semibold text-emerald-800">Present</p>
                      <p className="mt-1 text-xl font-bold text-emerald-700">
                        {summary.breakdown.present || 0}
                      </p>
                    </div>
                    <div className="rounded-xl border border-amber-100 bg-amber-50/50 p-3 text-center">
                      <p className="text-xs font-semibold text-amber-800">Late</p>
                      <p className="mt-1 text-xl font-bold text-amber-700">
                        {summary.breakdown.late || 0}
                      </p>
                    </div>
                    <div className="rounded-xl border border-rose-100 bg-rose-50/50 p-3 text-center">
                      <p className="text-xs font-semibold text-rose-800">Absent</p>
                      <p className="mt-1 text-xl font-bold text-rose-700">
                        {summary.breakdown.absent || 0}
                      </p>
                    </div>
                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-center">
                      <p className="text-xs font-semibold text-slate-600">Excused</p>
                      <p className="mt-1 text-xl font-bold text-slate-700">
                        {summary.breakdown.excused || 0}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Monthly Attendance Calendar */}
              {selected && <ParentAttendanceCalendar studentId={selected} />}
            </>
          )}
        </>
      )}

      {/* Tab: Class Timetable */}
      {view === "timetable" && selected && (
        <TimetableWorkspace mode="parent" studentId={selected} />
      )}

      {/* Tab: Exam Timetable */}
      {view === "exams" && (
        <div>
          <ExamTimetableList />
        </div>
      )}

      {/* Tab: Results & Grades */}
      {view === "results" && (
        <section className="space-y-5">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold text-slate-900">Academic Assessment &amp; Grades</h2>
              <p className="text-sm text-slate-500">
                Official published marks for {child?.name || "your child"}.
              </p>
            </div>
            <Award className="text-brand-600" size={24} />
          </div>

          {childResults.length ? (
            <div className="space-y-4">
              {Array.from(new Set(childResults.map((r) => r.examinationId?._id))).map((examId) => {
                const group = childResults.filter((r) => r.examinationId?._id === examId);
                const first = group[0];
                const totalScored = group.reduce((sum, r) => sum + (r.marks || 0), 0);
                const totalMax = group.reduce((sum, r) => sum + (r.maxMarks || 0), 0);
                const overallPct = totalMax ? Math.round((totalScored / totalMax) * 10000) / 100 : 0;

                return (
                  <article
                    key={examId}
                    className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-soft"
                  >
                    <div className="flex flex-col justify-between gap-3 border-b border-slate-100 bg-slate-50/70 p-4 sm:flex-row sm:items-center sm:p-5">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="font-bold text-slate-900">{first.examinationId?.name}</h3>
                          <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700 sm:hidden">
                            Official
                          </span>
                        </div>
                        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                          <span>
                            Total: <strong className="font-semibold text-slate-800">{totalScored} / {totalMax}</strong>
                          </span>
                          <span>•</span>
                          <span>
                            Percentage: <strong className="font-semibold text-slate-800">{overallPct}%</strong>
                          </span>
                        </div>
                      </div>
                      <span className="hidden w-fit rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700 sm:inline-block">
                        Published Official
                      </span>
                    </div>

                    {/* Desktop Table View */}
                    <div className="hidden overflow-x-auto md:block">
                      <table className="w-full text-left text-sm">
                        <thead className="border-b border-slate-100 bg-white text-xs uppercase tracking-wide text-slate-500">
                          <tr>
                            <th className="px-5 py-3">Subject</th>
                            <th>Code</th>
                            <th>Marks Scored</th>
                            <th>Maximum Marks</th>
                            <th>Percentage</th>
                            <th className="pr-5 text-right">Grade</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {group.map((r) => {
                            const pct = r.maxMarks ? Math.round((r.marks / r.maxMarks) * 100) : 0;
                            const gradeLetter = r.grade || (pct >= 85 ? "A+" : pct >= 70 ? "A" : pct >= 55 ? "B" : pct >= 40 ? "C" : "D");
                            return (
                              <tr key={r._id} className="hover:bg-slate-50/60">
                                <td className="px-5 py-3.5 font-semibold text-slate-900">
                                  {r.subjectId?.name}
                                </td>
                                <td className="text-xs font-medium text-slate-500">
                                  {r.subjectId?.code}
                                </td>
                                <td className="font-semibold text-slate-800">{r.marks}</td>
                                <td className="text-slate-500">{r.maxMarks}</td>
                                <td>
                                  <div className="flex items-center gap-2">
                                    <span className="font-medium text-slate-700">{pct}%</span>
                                    <div className="h-1.5 w-16 overflow-hidden rounded-full bg-slate-100">
                                      <div
                                        className={`h-full rounded-full ${
                                          pct >= 75 ? "bg-emerald-500" : pct >= 50 ? "bg-brand-500" : "bg-amber-500"
                                        }`}
                                        style={{ width: `${Math.min(pct, 100)}%` }}
                                      />
                                    </div>
                                  </div>
                                </td>
                                <td className="pr-5 text-right">
                                  <span className="inline-flex rounded-lg bg-brand-50 px-2.5 py-1 text-xs font-bold text-brand-700">
                                    {gradeLetter}
                                  </span>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>

                    {/* Mobile Responsive Card List */}
                    <div className="divide-y divide-slate-100 md:hidden">
                      {group.map((r) => {
                        const pct = r.maxMarks ? Math.round((r.marks / r.maxMarks) * 100) : 0;
                        const gradeLetter = r.grade || (pct >= 85 ? "A+" : pct >= 70 ? "A" : pct >= 55 ? "B" : pct >= 40 ? "C" : "D");
                        return (
                          <div key={r._id} className="p-4 transition hover:bg-slate-50/50">
                            <div className="flex items-start justify-between gap-2">
                              <div>
                                <h4 className="text-sm font-semibold text-slate-900">{r.subjectId?.name}</h4>
                                <span className="mt-0.5 inline-block rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600">
                                  {r.subjectId?.code}
                                </span>
                              </div>
                              <span className="inline-flex shrink-0 items-center rounded-lg bg-brand-50 px-2.5 py-1 text-xs font-bold text-brand-700">
                                Grade {gradeLetter}
                              </span>
                            </div>

                            <div className="mt-3 flex items-center justify-between text-xs">
                              <span className="text-slate-500">
                                Marks: <strong className="text-sm font-bold text-slate-800">{r.marks}</strong>{" "}
                                <span className="text-slate-400">/ {r.maxMarks}</span>
                              </span>
                              <span className="font-semibold text-slate-700">{pct}%</span>
                            </div>

                            <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                              <div
                                className={`h-full rounded-full transition-all duration-300 ${
                                  pct >= 75 ? "bg-emerald-500" : pct >= 50 ? "bg-brand-500" : "bg-amber-500"
                                }`}
                                style={{ width: `${Math.min(pct, 100)}%` }}
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </article>
                );
              })}
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-12 text-center shadow-soft">
              <GraduationCap className="mx-auto text-slate-300" size={38} />
              <p className="mt-3 font-semibold text-slate-800">No published results yet</p>
              <p className="mt-1 text-sm text-slate-500">
                Official marks will appear here once verified and published by the administration.
              </p>
            </div>
          )}
        </section>
      )}

      {/* Tab: Events & Notices */}
      {view === "notices" && (
        <div className="grid gap-6 lg:grid-cols-2">
          {/* College Announcements */}
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-soft">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div>
                <h3 className="font-bold text-slate-900">College Announcements</h3>
                <p className="text-xs text-slate-500">Official circulars, holidays, and events</p>
              </div>
              <div className="flex items-center gap-2">
                {eventMonth && (
                  <span className="flex items-center gap-1.5 rounded-lg border border-brand-200 bg-brand-50 px-2.5 py-1 text-xs font-semibold text-brand-700">
                    <span>
                      {new Date(`${eventMonth}-01`).toLocaleDateString("en-IN", {
                        month: "short",
                        year: "numeric",
                      })}
                    </span>
                    <button
                      type="button"
                      onClick={() => setEventMonth("")}
                      className="rounded-full p-0.5 text-brand-600 hover:bg-brand-100 hover:text-brand-800"
                      title="Clear calendar filter"
                      aria-label="Clear calendar filter"
                    >
                      <X size={12} />
                    </button>
                  </span>
                )}
                <label
                  className={`relative grid h-9 w-9 cursor-pointer place-items-center rounded-xl border transition shadow-2xs ${
                    eventMonth
                      ? "border-brand-500 bg-brand-50 text-brand-700"
                      : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50"
                  }`}
                  title="Filter announcements by month"
                >
                  <CalendarDays size={18} />
                  <input
                    type="month"
                    value={eventMonth}
                    onChange={(e) => setEventMonth(e.target.value)}
                    aria-label="Filter announcements by calendar month"
                    className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                  />
                </label>
              </div>
            </div>

            {/* Scroll-contained announcements list */}
            <div className="mt-4 max-h-[480px] space-y-3 overflow-y-auto pr-1">
              {filteredEvents.length ? (
                filteredEvents.map((e) => (
                  <article
                    key={e._id}
                    className="rounded-xl border border-slate-100 bg-slate-50/70 p-4 transition hover:bg-slate-50"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <b className="text-sm font-semibold text-slate-900">{e.title}</b>
                      <span className="rounded-full bg-slate-200/80 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-slate-700">
                        {e.type || "Event"}
                      </span>
                    </div>
                    {e.description && (
                      <p className="mt-2 text-xs text-slate-600 leading-relaxed">{e.description}</p>
                    )}
                    <p className="mt-3 flex items-center gap-1.5 text-[11px] font-medium text-slate-500">
                      <CalendarDays size={13} />
                      {new Date(e.startsAt).toLocaleDateString("en-IN", {
                        day: "2-digit",
                        month: "short",
                        year: "numeric",
                      })}
                      {e.endsAt && (
                        <span>
                          {" "}
                          –{" "}
                          {new Date(e.endsAt).toLocaleDateString("en-IN", {
                            day: "2-digit",
                            month: "short",
                            year: "numeric",
                          })}
                        </span>
                      )}
                    </p>
                  </article>
                ))
              ) : events.length ? (
                <div className="rounded-xl border border-dashed border-slate-200 py-10 text-center">
                  <CalendarDays className="mx-auto text-slate-300" size={32} />
                  <p className="mt-2 text-sm font-semibold text-slate-700">No announcements found</p>
                  <p className="mt-1 text-xs text-slate-500">
                    No announcements match the selected calendar month.
                  </p>
                  <button
                    type="button"
                    onClick={() => setEventMonth("")}
                    className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-brand-50 px-3 py-1.5 text-xs font-semibold text-brand-700 hover:bg-brand-100"
                  >
                    <RotateCcw size={12} />
                    Clear calendar filter
                  </button>
                </div>
              ) : (
                <div className="py-8 text-center text-sm text-slate-500">No events announced yet.</div>
              )}
            </div>
          </section>

          {/* Personal Alerts & Notifications */}
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-soft">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div>
                <h3 className="font-bold text-slate-900">Personal Alerts</h3>
                <p className="text-xs text-slate-500">Absence alerts and examination notices</p>
              </div>
              <Bell className="text-brand-600" size={20} />
            </div>

            <div className="mt-4 max-h-[580px] space-y-3 overflow-y-auto pr-1">
              {notifications.length ? (
                notifications.map((n) => {
                  const isUnread = !n.readAt;
                  return (
                    <article
                      key={n._id}
                      className={`rounded-xl border p-4 transition ${
                        isUnread
                          ? "border-amber-200 bg-amber-50/50"
                          : "border-slate-100 bg-slate-50/70"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2">
                          {isUnread && (
                            <span className="h-2 w-2 rounded-full bg-rose-500 ring-2 ring-white" />
                          )}
                          <b className="text-sm font-semibold text-slate-900">{n.title}</b>
                        </div>
                        {isUnread && (
                          <button
                            onClick={() => markNotificationRead(n._id)}
                            className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-[11px] font-semibold text-slate-700 shadow-2xs hover:bg-slate-50"
                          >
                            Mark read
                          </button>
                        )}
                      </div>
                      <p className="mt-1 text-xs text-slate-600 leading-relaxed">{n.message}</p>
                      {n.createdAt && (
                        <p className="mt-2 text-[10px] text-slate-400">
                          {new Date(n.createdAt).toLocaleDateString("en-IN", {
                            day: "2-digit",
                            month: "short",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </p>
                      )}
                    </article>
                  );
                })
              ) : (
                <div className="py-8 text-center text-sm text-slate-500">No personal alerts recorded.</div>
              )}
            </div>
          </section>
        </div>
      )}

      {/* OTP Verification Modal */}
      {otpModalOpen && (
        <OtpVerificationModal
          phone={phone}
          onClose={() => setOtpModalOpen(false)}
          onVerified={handleVerifiedSuccess}
        />
      )}
    </div>
  );
}
