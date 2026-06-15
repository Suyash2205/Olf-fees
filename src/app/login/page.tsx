import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/config";
import { redirect } from "next/navigation";
import LoginButton from "./LoginButton";
import SchoolLogo from "@/components/SchoolLogo";

export default async function LoginPage() {
  const session = await getServerSession(authOptions);
  if (session) redirect("/dashboard");

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm w-full max-w-sm p-8 flex flex-col items-center gap-6">
        {/* Logo */}
        <SchoolLogo size={72} priority />

        <div className="text-center">
          <h1 className="text-xl font-bold text-slate-800">Our Lady of Fatima School</h1>
          <p className="text-sm text-slate-500 mt-1">OLF High School · Admin Portal</p>
        </div>

        <div className="w-full border-t border-slate-100" />

        <div className="text-center space-y-1">
          <p className="text-sm font-medium text-slate-700">Sign in to continue</p>
          <p className="text-xs text-slate-400">Use your school Google account</p>
        </div>

        <LoginButton />
      </div>
    </div>
  );
}
