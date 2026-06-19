import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/config";
import { redirect } from "next/navigation";
import { canAccessAttendance, canAccessFees } from "@/lib/access-control";
import LoginButton from "./LoginButton";
import SchoolLogo from "@/components/SchoolLogo";

type Props = {
  searchParams: Promise<{ callbackUrl?: string; error?: string; hint?: string }>;
};

export default async function LoginPage({ searchParams }: Props) {
  const params = await searchParams;
  const callbackUrl = params.callbackUrl ?? "";
  const session = await getServerSession(authOptions);
  const email = session?.user?.email ?? "";

  if (session && email) {
    const wantsAttendance = callbackUrl.startsWith("/attendance");
    if (wantsAttendance && canAccessAttendance(email)) redirect(callbackUrl);
    if (!wantsAttendance && canAccessFees(email)) redirect(callbackUrl || "/dashboard");
    if (!wantsAttendance && !canAccessFees(email) && canAccessAttendance(email)) {
      redirect("/attendance");
    }
  }

  const errorMessage =
    params.error === "no_fees_access"
      ? "Your account does not have access to the fees & expense portal."
      : params.error === "no_attendance_access"
        ? "Your account does not have access to the attendance system."
        : params.error === "AccessDenied"
          ? "Sign-in was denied. Ask an admin to add your email in Google OAuth test users and the portal allowlist."
          : null;

  const hintMessage =
    params.hint === "attendance"
      ? "You can use the Attendance system below instead."
      : null;

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm w-full max-w-md p-8 flex flex-col items-center gap-6">
        <SchoolLogo size={72} priority />

        <div className="text-center">
          <h1 className="text-xl font-bold text-slate-800">Our Lady of Fatima School</h1>
          <p className="text-sm text-slate-500 mt-1">Sign in to continue</p>
        </div>

        {errorMessage && (
          <div className="w-full rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            {errorMessage}
            {hintMessage && <p className="mt-1 text-amber-800">{hintMessage}</p>}
          </div>
        )}

        <div className="w-full border-t border-slate-100" />

        <div className="w-full space-y-3">
          <LoginButton
            callbackUrl="/attendance"
            label="Attendance system"
            description="Teachers — record daily class attendance"
            icon="attendance"
          />
          <LoginButton
            callbackUrl="/dashboard"
            label="Fees & expense portal"
            description="Admin — fees, admissions, expenses"
            icon="admin"
          />
        </div>

        <p className="text-xs text-slate-400 text-center">Use your school Google account</p>
      </div>
    </div>
  );
}
