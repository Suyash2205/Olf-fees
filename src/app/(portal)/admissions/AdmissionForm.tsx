"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Loader2, Save, ArrowLeft } from "lucide-react";
import {
  CLASS_OPTIONS,
  computeFeeBreakdown,
  formatINR,
  getBaseQuarterly,
  getBaseTuition,
  type DiscountType,
} from "@/lib/fees/structure";
import { buildFullName } from "@/lib/admission-utils";
import { dispatchPortalRefresh } from "@/lib/portal-refresh";
import { portalFetch } from "@/lib/portal-fetch";
import {
  EMPTY_ADMISSION_FORM,
  type AdmissionFormValues,
} from "@/lib/admission-form";

const RESIDES_WITH = ["Father & Mother", "Mother", "Father", "Guardian"];
const SEX_OPTIONS = ["Male", "Female"];

export type AdmissionFormMode = "new" | "complete" | "edit";

export type AdmissionFormProps = {
  mode?: AdmissionFormMode;
  grNo?: string;
  linkStudentName?: string;
  initialForm?: AdmissionFormValues;
  backHref?: string;
  title?: string;
  subtitle?: string;
};

function Field({
  label,
  required,
  children,
  className = "",
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <label className="block text-sm font-medium text-slate-700 mb-1">
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      {children}
    </div>
  );
}

const inputClass =
  "w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500";

export default function AdmissionForm({
  mode = "new",
  grNo,
  linkStudentName = "",
  initialForm,
  backHref = "/admissions",
  title,
  subtitle,
}: AdmissionFormProps = {}) {
  const router = useRouter();
  const [form, setForm] = useState<AdmissionFormValues>(initialForm ?? EMPTY_ADMISSION_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (initialForm) setForm(initialForm);
  }, [initialForm]);

  const set = (key: keyof AdmissionFormValues, value: string) =>
    setForm((f) => ({ ...f, [key]: value }));

  const heading =
    title ??
    (mode === "edit"
      ? "Edit student profile"
      : mode === "complete"
        ? "Complete student profile"
        : "New admission");
  const subheading =
    subtitle ??
    (mode === "complete"
      ? "Adds full details to Admissions tab and links Fee details"
      : "Saved to Fees spreadsheet · Admissions tab");

  const previewName = buildFullName({
    surname: form.surname,
    firstName: form.firstName,
    fatherName: form.fatherName,
  });

  const baseFee = form.standard ? getBaseTuition(form.standard) : null;
  const breakdown = useMemo(() => {
    if (!form.standard || baseFee == null) return null;
    return computeFeeBreakdown(
      form.standard,
      form.discountType,
      Number(form.discountValue) || 0
    );
  }, [form.standard, form.discountType, form.discountValue, baseFee]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.surname.trim() || !form.firstName.trim() || !form.standard) {
      setError("Surname, first name, and standard are required");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const payload =
        mode === "complete"
          ? { ...form, linkStudentName }
          : form;

      const url =
        mode === "edit" && grNo
          ? `/api/admissions/${encodeURIComponent(grNo)}`
          : mode === "complete"
            ? "/api/admissions/complete"
            : "/api/admissions";

      const method = mode === "edit" ? "PUT" : "POST";

      const res = await portalFetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to save");
      dispatchPortalRefresh();
      router.push(`/admissions/${encodeURIComponent(data.grNo)}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-8 max-w-4xl">
      <div className="flex items-center gap-3">
        <Link
          href={backHref}
          className="p-2 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50"
        >
          <ArrowLeft className="w-4 h-4" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-slate-800">{heading}</h1>
          <p className="text-sm text-slate-500">{subheading}</p>
        </div>
      </div>

      {/* Admin */}
      <section className="bg-white rounded-xl border border-slate-200 p-6 space-y-4">
        <h2 className="font-semibold text-slate-800">Form details</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Form No">
            <input className={inputClass} value={form.formNo} onChange={(e) => set("formNo", e.target.value)} />
          </Field>
          <Field label="Admission date">
            <input type="date" className={inputClass} value={form.admissionDate} onChange={(e) => set("admissionDate", e.target.value)} />
          </Field>
          <Field label="Medium">
            <input className={inputClass} value={form.medium} onChange={(e) => set("medium", e.target.value)} />
          </Field>
          <Field label="Photo URL (Google Drive link)">
            <input className={inputClass} value={form.photoUrl} onChange={(e) => set("photoUrl", e.target.value)} placeholder="https://..." />
          </Field>
        </div>
      </section>

      {/* Student */}
      <section className="bg-white rounded-xl border border-slate-200 p-6 space-y-4">
        <h2 className="font-semibold text-slate-800">Student information</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Surname" required>
            <input className={inputClass} value={form.surname} onChange={(e) => set("surname", e.target.value)} />
          </Field>
          <Field label="First name" required>
            <input className={inputClass} value={form.firstName} onChange={(e) => set("firstName", e.target.value)} />
          </Field>
          <Field label="Father name (in full name)">
            <input className={inputClass} value={form.fatherName} onChange={(e) => set("fatherName", e.target.value)} />
          </Field>
          <Field label="Mother name">
            <input className={inputClass} value={form.motherName} onChange={(e) => set("motherName", e.target.value)} />
          </Field>
          <div className="sm:col-span-2 text-sm text-slate-600 bg-slate-50 rounded-lg px-3 py-2">
            <span className="text-slate-500">Full name for fees sheet: </span>
            <span className="font-medium">{previewName || "—"}</span>
          </div>
          <Field label="Standard" required>
            <select className={inputClass} value={form.standard} onChange={(e) => set("standard", e.target.value)}>
              <option value="">Select...</option>
              {CLASS_OPTIONS.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </Field>
          <Field label="Date of birth">
            <input type="date" className={inputClass} value={form.dob} onChange={(e) => set("dob", e.target.value)} />
          </Field>
          <Field label="Place of birth">
            <input className={inputClass} value={form.placeOfBirth} onChange={(e) => set("placeOfBirth", e.target.value)} />
          </Field>
          <Field label="Sex">
            <select className={inputClass} value={form.sex} onChange={(e) => set("sex", e.target.value)}>
              <option value="">—</option>
              {SEX_OPTIONS.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </Field>
          <Field label="State">
            <input className={inputClass} value={form.state} onChange={(e) => set("state", e.target.value)} />
          </Field>
          <Field label="Student contact">
            <input className={inputClass} value={form.studentContact} onChange={(e) => set("studentContact", e.target.value)} />
          </Field>
          <Field label="Age (years)">
            <input className={inputClass} value={form.ageYears} onChange={(e) => set("ageYears", e.target.value)} />
          </Field>
          <Field label="Age (months)">
            <input className={inputClass} value={form.ageMonths} onChange={(e) => set("ageMonths", e.target.value)} />
          </Field>
          <Field label="Aadhar no.">
            <input className={inputClass} value={form.aadhar} onChange={(e) => set("aadhar", e.target.value)} />
          </Field>
          <Field label="Religion">
            <input className={inputClass} value={form.religion} onChange={(e) => set("religion", e.target.value)} />
          </Field>
          <Field label="Caste">
            <input className={inputClass} value={form.caste} onChange={(e) => set("caste", e.target.value)} />
          </Field>
          <Field label="Sub caste">
            <input className={inputClass} value={form.subCaste} onChange={(e) => set("subCaste", e.target.value)} />
          </Field>
          <Field label="Nationality">
            <input className={inputClass} value={form.nationality} onChange={(e) => set("nationality", e.target.value)} />
          </Field>
          <Field label="Blood group">
            <input className={inputClass} value={form.bloodGroup} onChange={(e) => set("bloodGroup", e.target.value)} />
          </Field>
          <Field label="Mother tongue">
            <input className={inputClass} value={form.motherTongue} onChange={(e) => set("motherTongue", e.target.value)} />
          </Field>
          <Field label="Residential address" className="sm:col-span-2">
            <textarea className={inputClass} rows={2} value={form.residentialAddress} onChange={(e) => set("residentialAddress", e.target.value)} />
          </Field>
          <Field label="Last school attended">
            <input className={inputClass} value={form.lastSchool} onChange={(e) => set("lastSchool", e.target.value)} />
          </Field>
          <Field label="Reason for leaving">
            <input className={inputClass} value={form.reasonLeaving} onChange={(e) => set("reasonLeaving", e.target.value)} />
          </Field>
          <Field label="Student resides with">
            <select className={inputClass} value={form.residesWith} onChange={(e) => set("residesWith", e.target.value)}>
              <option value="">—</option>
              {RESIDES_WITH.map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
          </Field>
        </div>
      </section>

      {/* Father */}
      <section className="bg-white rounded-xl border border-slate-200 p-6 space-y-4">
        <h2 className="font-semibold text-slate-800">Father</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Field label="Surname"><input className={inputClass} value={form.fatherSurname} onChange={(e) => set("fatherSurname", e.target.value)} /></Field>
          <Field label="First name"><input className={inputClass} value={form.fatherFirstName} onChange={(e) => set("fatherFirstName", e.target.value)} /></Field>
          <Field label="Middle name"><input className={inputClass} value={form.fatherMiddleName} onChange={(e) => set("fatherMiddleName", e.target.value)} /></Field>
          <Field label="Education"><input className={inputClass} value={form.fatherEducation} onChange={(e) => set("fatherEducation", e.target.value)} /></Field>
          <Field label="Occupation"><input className={inputClass} value={form.fatherOccupation} onChange={(e) => set("fatherOccupation", e.target.value)} /></Field>
          <Field label="Contact"><input className={inputClass} value={form.fatherContact} onChange={(e) => set("fatherContact", e.target.value)} /></Field>
        </div>
      </section>

      {/* Mother */}
      <section className="bg-white rounded-xl border border-slate-200 p-6 space-y-4">
        <h2 className="font-semibold text-slate-800">Mother</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Field label="Surname"><input className={inputClass} value={form.motherSurname} onChange={(e) => set("motherSurname", e.target.value)} /></Field>
          <Field label="First name"><input className={inputClass} value={form.motherFirstName} onChange={(e) => set("motherFirstName", e.target.value)} /></Field>
          <Field label="Middle name"><input className={inputClass} value={form.motherMiddleName} onChange={(e) => set("motherMiddleName", e.target.value)} /></Field>
          <Field label="Education"><input className={inputClass} value={form.motherEducation} onChange={(e) => set("motherEducation", e.target.value)} /></Field>
          <Field label="Occupation"><input className={inputClass} value={form.motherOccupation} onChange={(e) => set("motherOccupation", e.target.value)} /></Field>
          <Field label="Contact"><input className={inputClass} value={form.motherContact} onChange={(e) => set("motherContact", e.target.value)} /></Field>
        </div>
        <Field label="Email">
          <input type="email" className={inputClass} value={form.email} onChange={(e) => set("email", e.target.value)} />
        </Field>
      </section>

      {/* Fees */}
      <section className="bg-white rounded-xl border border-slate-200 p-6 space-y-4">
        <h2 className="font-semibold text-slate-800">Fees (2026–27)</h2>
        {baseFee != null && (
          <p className="text-sm text-slate-600">
            Standard fee: {formatINR(baseFee)} · Quarter: {formatINR(getBaseQuarterly(form.standard!)!)}
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          {(["none", "amount", "percent"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setForm((f) => ({ ...f, discountType: t, discountValue: t === "none" ? "" : f.discountValue }))}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg border ${
                form.discountType === t ? "bg-blue-600 text-white border-blue-600" : "border-slate-200"
              }`}
            >
              {t === "none" ? "No discount" : t === "amount" ? "₹ Off" : "% Off"}
            </button>
          ))}
        </div>
        {form.discountType !== "none" && (
          <input
            type="number"
            min={0}
            className={inputClass + " max-w-xs"}
            value={form.discountValue}
            onChange={(e) => set("discountValue", e.target.value)}
            placeholder={form.discountType === "percent" ? "10" : "2000"}
          />
        )}
        {breakdown && (
          <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4 text-sm">
            <p className="font-medium text-emerald-900">Annual: {formatINR(breakdown.finalFee)}</p>
            <div className="grid grid-cols-4 gap-2 mt-2 text-center text-xs">
              {breakdown.quarterlyFees.map((q, i) => (
                <div key={i}><div className="text-emerald-700">Q{i + 1}</div><div className="font-medium">{formatINR(q)}</div></div>
              ))}
            </div>
          </div>
        )}
      </section>

      {error && (
        <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-3">{error}</div>
      )}

      <div className="flex gap-3 pb-8">
        <button
          type="submit"
          disabled={saving || !breakdown}
          className="inline-flex items-center gap-2 px-6 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-60"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          {mode === "edit" ? "Save changes" : mode === "complete" ? "Save profile" : "Save admission"}
        </button>
        <Link href={backHref} className="px-6 py-2.5 border border-slate-200 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-50">
          Cancel
        </Link>
      </div>
    </form>
  );
}
