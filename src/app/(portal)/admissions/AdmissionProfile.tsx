"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, IndianRupee, ClipboardList, RefreshCw, Pencil } from "lucide-react";
import type { AdmissionRecord } from "@/lib/sheets/admissions";
import type { FeeRecord } from "@/lib/sheets/fees";
import { formatINR, splitIntoQuarters } from "@/lib/fees/structure";
import { portalFetch } from "@/lib/portal-fetch";

function Detail({ label, value }: { label: string; value?: string | number }) {
  if (!value && value !== 0) return null;
  return (
    <div>
      <dt className="text-xs text-slate-500 uppercase tracking-wide">{label}</dt>
      <dd className="text-sm text-slate-800 mt-0.5">{value}</dd>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-4">
      <h2 className="font-semibold text-slate-800">{title}</h2>
      <dl className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">{children}</dl>
    </div>
  );
}

export default function AdmissionProfile({ grNo }: { grNo: string }) {
  const [admission, setAdmission] = useState<AdmissionRecord | null>(null);
  const [fee, setFee] = useState<FeeRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await portalFetch(`/api/admissions/${encodeURIComponent(grNo)}`);
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error ?? `Error ${res.status}`);
      }
      const data = await res.json();
      setAdmission(data.admission);
      setFee(data.fee ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [grNo]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) {
    return (
      <div className="flex flex-col items-center py-20 text-slate-400 gap-3">
        <RefreshCw className="w-6 h-6 animate-spin" />
      </div>
    );
  }

  if (error || !admission) {
    return (
      <div className="text-center py-20 space-y-3">
        <p className="text-red-600">{error ?? "Not found"}</p>
        <Link href="/admissions" className="text-blue-600 text-sm hover:underline">
          Back to list
        </Link>
      </div>
    );
  }

  const quarters = fee
    ? [fee.q1Paid, fee.q2Paid, fee.q3Paid, fee.q4Paid]
    : splitIntoQuarters(admission.annualFee);
  const quarterDue = admission.annualFee > 0 ? admission.annualFee / 4 : 0;

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <Link href="/admissions" className="p-2 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 mt-1">
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div>
            <p className="text-xs font-mono text-slate-500">{admission.grNo}</p>
            <h1 className="text-2xl font-bold text-slate-800">{admission.fullName}</h1>
            <p className="text-slate-600 mt-1">
              {admission.standard} · {admission.status}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href={`/admissions/${encodeURIComponent(admission.grNo)}/edit`}
            className="inline-flex items-center gap-2 px-3 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            <Pencil className="w-4 h-4" />
            Edit details
          </Link>
          {fee && (
            <>
              <Link
                href={`/fees?student=${encodeURIComponent(admission.fullName)}`}
                className="inline-flex items-center gap-2 px-3 py-2 text-sm border border-slate-200 rounded-lg hover:bg-slate-50"
              >
                <IndianRupee className="w-4 h-4" />
                Fees
              </Link>
              <Link
                href={`/daily-entry?student=${encodeURIComponent(admission.fullName)}`}
                className="inline-flex items-center gap-2 px-3 py-2 text-sm border border-slate-200 rounded-lg hover:bg-slate-50"
              >
                <ClipboardList className="w-4 h-4" />
                Payments
              </Link>
            </>
          )}
        </div>
      </div>

      <p className="text-sm text-slate-500">
        To promote, demote, mark left/failed, or remove this student, use the{" "}
        <Link href="/admin" className="text-blue-600 hover:underline font-medium">
          Admin
        </Link>{" "}
        page.
      </p>

      {/* Fee summary */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <p className="text-xs text-slate-500">Annual fee</p>
          <p className="text-xl font-bold text-slate-800 mt-1">
            {admission.annualFee > 0 ? formatINR(admission.annualFee) : "—"}
          </p>
          {admission.discount > 0 && (
            <p className="text-xs text-emerald-600 mt-1">Discount {formatINR(admission.discount)}</p>
          )}
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <p className="text-xs text-slate-500">Paid</p>
          <p className="text-xl font-bold text-green-700 mt-1">
            {fee ? formatINR(fee.totalPaid) : "—"}
          </p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <p className="text-xs text-slate-500">Balance</p>
          <p className="text-xl font-bold text-red-600 mt-1">
            {fee ? formatINR(fee.balance) : admission.annualFee > 0 ? formatINR(admission.annualFee) : "—"}
          </p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <p className="text-xs text-slate-500">Per quarter</p>
          <p className="text-xl font-bold text-slate-800 mt-1">
            {quarterDue > 0 ? formatINR(quarterDue) : "—"}
          </p>
        </div>
      </div>

      {fee && (
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <h2 className="font-semibold text-slate-800 mb-3">Quarterly payments</h2>
          <div className="grid grid-cols-4 gap-3">
            {quarters.map((paid, i) => (
              <div key={i} className="rounded-lg bg-slate-50 px-3 py-2 text-center">
                <p className="text-xs text-slate-500">Q{i + 1}</p>
                <p className="text-sm font-medium text-slate-800">{formatINR(paid)}</p>
                <p className="text-xs text-slate-400">of {formatINR(quarterDue)}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      <Section title="Student">
        <Detail label="Form no" value={admission.formNo} />
        <Detail label="Admission date" value={admission.admissionDate} />
        <Detail label="DOB" value={admission.dob} />
        <Detail label="Place of birth" value={admission.placeOfBirth} />
        <Detail label="Sex" value={admission.sex} />
        <Detail label="Contact" value={admission.studentContact} />
        <Detail label="Aadhar" value={admission.aadhar} />
        <Detail label="Religion" value={admission.religion} />
        <Detail label="Caste" value={admission.caste} />
        <Detail label="Blood group" value={admission.bloodGroup} />
        <Detail label="Address" value={admission.residentialAddress} />
        <Detail label="Last school" value={admission.lastSchool} />
        <Detail label="Resides with" value={admission.residesWith} />
      </Section>

      <Section title="Father">
        <Detail
          label="Name"
          value={[admission.fatherSurname, admission.fatherFirstName, admission.fatherMiddleName].filter(Boolean).join(" ")}
        />
        <Detail label="Education" value={admission.fatherEducation} />
        <Detail label="Occupation" value={admission.fatherOccupation} />
        <Detail label="Contact" value={admission.fatherContact} />
      </Section>

      <Section title="Mother">
        <Detail
          label="Name"
          value={[admission.motherSurname, admission.motherFirstName, admission.motherMiddleName].filter(Boolean).join(" ")}
        />
        <Detail label="Education" value={admission.motherEducation} />
        <Detail label="Occupation" value={admission.motherOccupation} />
        <Detail label="Contact" value={admission.motherContact} />
        <Detail label="Email" value={admission.email} />
      </Section>
    </div>
  );
}
