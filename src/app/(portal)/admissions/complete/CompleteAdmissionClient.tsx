"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import Link from "next/link";
import { RefreshCw } from "lucide-react";
import AdmissionForm from "../AdmissionForm";
import type { AdmissionFormValues } from "@/lib/admission-form";
import { EMPTY_ADMISSION_FORM } from "@/lib/admission-form";
import { portalFetch } from "@/lib/portal-fetch";

export default function CompleteAdmissionClient() {
  const searchParams = useSearchParams();
  const student = searchParams.get("student")?.trim() ?? "";
  const grNo = searchParams.get("grNo")?.trim() ?? "";

  const [loading, setLoading] = useState(Boolean(student || grNo));
  const [error, setError] = useState<string | null>(null);
  const [initialForm, setInitialForm] = useState<AdmissionFormValues | null>(null);
  const [linkStudentName, setLinkStudentName] = useState(student);
  const [existingGrNo, setExistingGrNo] = useState<string | null>(grNo || null);
  const [hasAdmission, setHasAdmission] = useState(false);

  useEffect(() => {
    if (!student && !grNo) {
      setLoading(false);
      setInitialForm(EMPTY_ADMISSION_FORM);
      return;
    }

    const q = new URLSearchParams();
    if (student) q.set("student", student);
    if (grNo) q.set("grNo", grNo);

    setLoading(true);
    portalFetch(`/api/admissions/lookup?${q}`)
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Failed to load");
        setLinkStudentName(data.linkStudentName ?? student);
        setExistingGrNo(data.grNo ?? grNo ?? null);
        setHasAdmission(data.hasAdmission);
        setInitialForm(data.formDefaults ?? EMPTY_ADMISSION_FORM);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load"))
      .finally(() => setLoading(false));
  }, [student, grNo]);

  if (loading) {
    return (
      <div className="flex flex-col items-center py-20 text-slate-400 gap-3">
        <RefreshCw className="w-6 h-6 animate-spin" />
        <p className="text-sm">Loading student…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-20 space-y-3">
        <p className="text-red-600 text-sm">{error}</p>
        <Link href="/students" className="text-blue-600 text-sm hover:underline">
          Back to students
        </Link>
      </div>
    );
  }

  if (hasAdmission && existingGrNo) {
    return (
      <div className="max-w-lg mx-auto text-center py-16 space-y-4">
        <p className="text-slate-600">This student already has a full admission profile.</p>
        <div className="flex flex-wrap justify-center gap-3">
          <Link
            href={`/admissions/${encodeURIComponent(existingGrNo)}`}
            className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700"
          >
            View profile
          </Link>
          <Link
            href={`/admissions/${encodeURIComponent(existingGrNo)}/edit`}
            className="px-4 py-2 border border-slate-200 text-sm font-medium rounded-lg hover:bg-slate-50"
          >
            Edit details
          </Link>
        </div>
      </div>
    );
  }

  if (!initialForm) return null;

  return (
    <AdmissionForm
      mode="complete"
      linkStudentName={linkStudentName}
      initialForm={initialForm}
      backHref="/students"
      title="Complete student profile"
      subtitle={
        linkStudentName
          ? `Add full admission details for ${linkStudentName} (already on Fee details)`
          : "Add full admission details for an existing student"
      }
    />
  );
}
