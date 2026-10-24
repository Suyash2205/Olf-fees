"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { RefreshCw } from "lucide-react";
import {
  DETAIL_FIELDS,
  DETAIL_GROUPS,
  validateDetail,
  type DetailField,
  type DetailGroup,
  type DetailView,
} from "@/lib/student-records/details";
import { sortClassNames } from "@/lib/sort-by-grade";
import { todayISO } from "@/lib/attendance/types";
import { portalFetch } from "@/lib/portal-fetch";

const ALL = "All classes";
const SAVE_CHUNK = 100;

type Drafts = Record<string, Record<string, string>>;

function inputFor(
  f: DetailField,
  value: string,
  onChange: (v: string) => void,
  label: string,
  invalid: boolean
) {
  const base = `rounded-lg border bg-white px-2 py-1.5 text-sm ${invalid ? "border-red-400" : "border-slate-200"}`;
  if (f.kind === "select") {
    return (
      <select className={base} value={value} onChange={(e) => onChange(e.target.value)} aria-label={label}>
        <option value="">—</option>
        {f.options?.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
        {value && !f.options?.includes(value) && <option value={value}>{value}</option>}
      </select>
    );
  }
  if (f.kind === "date") {
    return <input type="date" className={base} value={value} max={todayISO()} onChange={(e) => onChange(e.target.value)} aria-label={label} />;
  }
  const width = f.kind === "phone" ? "w-36" : f.kind === "aadhaar" ? "w-40" : f.key === "residentialAddress" ? "w-72" : "w-40";
  return (
    <input
      className={`${base} ${width}`}
      value={value}
      inputMode={f.kind === "phone" || f.kind === "aadhaar" ? "numeric" : undefined}
      maxLength={f.max ?? 100}
      onChange={(e) => onChange(e.target.value)}
      aria-label={label}
    />
  );
}

export default function MissingDetailsTab() {
  const [students, setStudents] = useState<DetailView[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [group, setGroup] = useState<DetailGroup>("contact");
  const [className, setClassName] = useState(ALL);
  const [onlyMissing, setOnlyMissing] = useState(true);
  const [search, setSearch] = useState("");
  const [drafts, setDrafts] = useState<Drafts>({});
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await portalFetch("/api/student-records/details");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to load details");
      setStudents(data.students ?? []);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load details");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const fields = useMemo(() => DETAIL_FIELDS.filter((f) => f.group === group), [group]);
  const classes = useMemo(() => sortClassNames(new Set(students.map((s) => s.className))), [students]);
  const today = todayISO();

  const value = (s: DetailView, key: string) => drafts[s.srNo]?.[key] ?? s.values[key] ?? "";
  const missingHere = (s: DetailView) => fields.some((f) => s.missing.includes(f.key));

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return students.filter(
      (s) =>
        (className === ALL || s.className === className) &&
        (!onlyMissing || fields.some((f) => s.missing.includes(f.key)) || drafts[s.srNo]) &&
        (!q || s.studentName.toLowerCase().includes(q) || s.srNo === q || s.grNo.toLowerCase() === q)
    );
    // drafts deliberately not a dependency: a row being filled in must not vanish mid-edit
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [students, className, onlyMissing, fields, search]);

  const scope = students.filter((s) => className === ALL || s.className === className);
  const missingCount = (key: string) => scope.filter((s) => s.missing.includes(key)).length;

  /** Every change across all classes: non-blank and different from what is on file. */
  const changes = useMemo(() => {
    const out: { srNo: string; fields: Record<string, string> }[] = [];
    for (const s of students) {
      const d = drafts[s.srNo];
      if (!d) continue;
      const f: Record<string, string> = {};
      for (const [k, v] of Object.entries(d)) if (v.trim() && v.trim() !== (s.values[k] ?? "")) f[k] = v;
      if (Object.keys(f).length) out.push({ srNo: s.srNo, fields: f });
    }
    return out;
  }, [students, drafts]);

  const problems = useMemo(() => {
    const out: string[] = [];
    for (const c of changes) {
      for (const [k, v] of Object.entries(c.fields)) {
        const f = DETAIL_FIELDS.find((x) => x.key === k)!;
        const r = validateDetail(f, v, today);
        if (!r.ok) out.push(`${students.find((s) => s.srNo === c.srNo)?.studentName ?? c.srNo}: ${r.error}`);
      }
    }
    return out;
  }, [changes, students, today]);

  function edit(s: DetailView, key: string, v: string) {
    setNotice(null);
    setDrafts((prev) => ({ ...prev, [s.srNo]: { ...prev[s.srNo], [key]: v } }));
  }

  async function save() {
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      let students = 0;
      for (let i = 0; i < changes.length; i += SAVE_CHUNK) {
        const res = await portalFetch("/api/student-records/details", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ updates: changes.slice(i, i + SAVE_CHUNK) }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Save failed");
        students += data.students ?? 0;
      }
      setNotice(`Saved details for ${students} student${students === 1 ? "" : "s"}.`);
      setDrafts({});
      await load();
    } catch (e) {
      setError(`${e instanceof Error ? e.message : "Save failed"} — your unsaved entries are still in the boxes.`);
    } finally {
      setSaving(false);
    }
  }

  if (loading && students.length === 0) {
    return (
      <div className="flex items-center justify-center gap-2 py-16 text-slate-400">
        <RefreshCw className="h-5 w-5 animate-spin" />
        <span className="text-sm">Loading details…</span>
      </div>
    );
  }

  const changeCount = changes.reduce((n, c) => n + Object.keys(c.fields).length, 0);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {DETAIL_GROUPS.map((g) => (
          <button
            key={g.id}
            type="button"
            onClick={() => setGroup(g.id)}
            className={`rounded-lg border px-3 py-1.5 text-sm ${
              group === g.id ? "border-slate-800 bg-slate-800 text-white" : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
            }`}
          >
            {g.label}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <select
          value={className}
          onChange={(e) => setClassName(e.target.value)}
          className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium"
          aria-label="Class"
        >
          <option value={ALL}>{ALL}</option>
          {classes.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search name, Sr No or GR"
          className="w-56 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
          aria-label="Search"
        />
        <label className="flex items-center gap-2 text-sm text-slate-600">
          <input type="checkbox" checked={onlyMissing} onChange={(e) => setOnlyMissing(e.target.checked)} />
          Only students missing something here
        </label>
        <button
          type="button"
          onClick={save}
          disabled={saving || changeCount === 0 || problems.length > 0}
          className="ml-auto rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {saving ? "Saving…" : changeCount > 0 ? `Save ${changeCount} change${changeCount === 1 ? "" : "s"}` : "Save"}
        </button>
      </div>

      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
        {fields.map((f) => (
          <span key={f.key}>
            {f.label}: <b className={missingCount(f.key) ? "text-amber-700" : "text-green-700"}>{missingCount(f.key)} missing</b>
          </span>
        ))}
        <span>
          ({scope.length} students{className === ALL ? "" : ` in ${className}`})
        </span>
      </div>

      {error && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
      {notice && <div className="rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800">{notice}</div>}
      {problems.length > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          Fix before saving: {problems.slice(0, 3).join(" · ")}
          {problems.length > 3 ? ` (and ${problems.length - 3} more)` : ""}
        </div>
      )}

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
              <th className="px-3 py-3">Class</th>
              <th className="px-3 py-3">Sr No</th>
              <th className="px-3 py-3">Name</th>
              {fields.map((f) => (
                <th key={f.key} className="px-3 py-3 whitespace-nowrap">
                  {f.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {rows.length === 0 && (
              <tr>
                <td colSpan={fields.length + 3} className="px-4 py-10 text-center text-slate-400">
                  {onlyMissing ? "Nothing missing here." : "No students."}
                </td>
              </tr>
            )}
            {rows.map((s) => (
              <tr key={s.srNo} className={drafts[s.srNo] ? "bg-amber-50/40" : ""}>
                <td className="px-3 py-2 whitespace-nowrap text-slate-600">{s.className}</td>
                <td className="px-3 py-2 text-slate-400">{s.srNo}</td>
                <td className="px-3 py-2 font-medium text-slate-800">
                  {s.studentName}
                  {!missingHere(s) && <span className="ml-2 text-xs font-normal text-green-700">complete</span>}
                </td>
                {fields.map((f) => {
                  const v = value(s, f.key);
                  const changed = v.trim() !== "" && v.trim() !== (s.values[f.key] ?? "");
                  const invalid = changed && !validateDetail(f, v, today).ok;
                  const cleared = v.trim() === "" && !!s.values[f.key];
                  return (
                    <td key={f.key} className={`px-3 py-2 align-top ${s.missing.includes(f.key) && !changed ? "bg-amber-50" : ""}`}>
                      {inputFor(f, v, (nv) => edit(s, f.key, nv), `${f.label} for ${s.studentName}`, invalid)}
                      {f.kind === "phone" && s.invalidPhones.length > 0 && !changed && (
                        <p className="mt-1 text-xs text-amber-700">On file, not a valid mobile: {s.invalidPhones.join(", ")}</p>
                      )}
                      {f.key === "aadhar" && s.udiseAadhaar && !v && (
                        <button type="button" onClick={() => edit(s, "aadhar", s.udiseAadhaar)} className="mt-1 block text-xs text-blue-700 underline">
                          Use Aadhaar from UDISE import
                        </button>
                      )}
                      {cleared && <p className="mt-1 text-xs text-slate-400">Blank is not saved; the old value stays.</p>}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-slate-400">
        Changes save to the student&apos;s admission record (the phone goes to Parent Contacts, which the WhatsApp bot and fee
        follow-ups use). Existing details can be corrected here; to remove one, use the Admissions page.
      </p>
    </div>
  );
}
