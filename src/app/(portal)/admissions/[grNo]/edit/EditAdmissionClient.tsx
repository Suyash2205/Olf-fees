"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { RefreshCw } from "lucide-react";
import AdmissionForm from "../../AdmissionForm";
import { EMPTY_ADMISSION_FORM, type AdmissionFormValues } from "@/lib/admission-form";
import { portalFetch } from "@/lib/portal-fetch";

export default function EditAdmissionClient({ grNo }: { grNo: string }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [initialForm, setInitialForm] = useState<AdmissionFormValues | null>(null);

  useEffect(() => {
    portalFetch(`/api/admissions/lookup?grNo=${encodeURIComponent(grNo)}`)
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Failed to load");
        if (!data.admission) throw new Error("Admission not found");
        setInitialForm(data.formDefaults ?? EMPTY_ADMISSION_FORM);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load"))
      .finally(() => setLoading(false));
  }, [grNo]);

  if (loading) {
    return (
      <div className="flex flex-col items-center py-20 text-slate-400 gap-3">
        <RefreshCw className="w-6 h-6 animate-spin" />
      </div>
    );
  }

  if (error || !initialForm) {
    return (
      <div className="text-center py-20 space-y-3">
        <p className="text-red-600 text-sm">{error ?? "Not found"}</p>
        <Link href="/admissions" className="text-blue-600 text-sm hover:underline">
          Back
        </Link>
      </div>
    );
  }

  return (
    <AdmissionForm
      mode="edit"
      grNo={grNo}
      initialForm={initialForm}
      backHref={`/admissions/${encodeURIComponent(grNo)}`}
      title="Edit student profile"
      subtitle="Update admission details · Fee details will stay in sync"
    />
  );
}
