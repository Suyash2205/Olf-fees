"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { format, parseISO } from "date-fns";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { CalendarRange, ChevronDown, RefreshCw, Search, User, Users } from "lucide-react";
import type {
  AttendanceDashboardData,
  AttendancePeriod,
  DashboardViewMode,
  StudentGranularity,
} from "@/lib/attendance/analytics";
import {
  computeStudentWeekly,
  summaryFromDateClasses,
  summaryFromDayStats,
  summaryFromStudentDays,
} from "@/lib/attendance/analytics";
import { portalFetch } from "@/lib/portal-fetch";

const PERIODS: { id: AttendancePeriod; label: string }[] = [
  { id: "7d", label: "7 days" },
  { id: "30d", label: "30 days" },
  { id: "90d", label: "90 days" },
  { id: "all", label: "All time" },
];

const VIEW_OPTIONS: { id: DashboardViewMode; label: string }[] = [
  { id: "class", label: "By class" },
  { id: "student", label: "By student" },
  { id: "date", label: "By date" },
];

const GRANULARITY_OPTIONS: { id: StudentGranularity; label: string }[] = [
  { id: "daily", label: "Day wise" },
  { id: "weekly", label: "Weekly cumulative" },
];

const PRESENT_COLOR = "#16a34a";
const ABSENT_COLOR = "#dc2626";
const RATE_COLOR = "#2563eb";

function fmtDate(iso: string) {
  try {
    return format(parseISO(iso), "d MMM yyyy");
  } catch {
    return iso;
  }
}

function fmtShortDate(iso: string) {
  try {
    return format(parseISO(iso), "d MMM");
  } catch {
    return iso;
  }
}

function AttendanceTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: { name: string; value: number; color: string }[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs shadow-lg">
      <p className="mb-1 font-medium text-slate-700">{label}</p>
      {payload.map((p) => (
        <p key={p.name} style={{ color: p.color }} className="text-slate-600">
          {p.name}: {typeof p.value === "number" && p.name.includes("Rate") ? `${p.value}%` : p.value}
        </p>
      ))}
    </div>
  );
}

export default function AttendanceDashboardClient() {
  const [period, setPeriod] = useState<AttendancePeriod>("30d");
  const [viewMode, setViewMode] = useState<DashboardViewMode>("class");
  const [selectedClass, setSelectedClass] = useState("");
  const [selectedStudentKey, setSelectedStudentKey] = useState("");
  const [selectedDate, setSelectedDate] = useState("");
  const [studentGranularity, setStudentGranularity] = useState<StudentGranularity>("daily");
  const [studentSearch, setStudentSearch] = useState("");
  const [studentPickerOpen, setStudentPickerOpen] = useState(false);
  const [data, setData] = useState<AttendanceDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const studentPickerRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await portalFetch(`/api/attendance/dashboard?period=${period}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to load dashboard");
      setData(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [period]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!data) return;
    if (!selectedClass && data.classes.length > 0) {
      setSelectedClass(data.classes[0]);
    }
    if (!selectedStudentKey && data.students.length > 0) {
      setSelectedStudentKey(data.students[0].key);
    }
    if (!selectedDate && data.dates.length > 0) {
      setSelectedDate(data.dates[0]);
    }
  }, [data, selectedClass, selectedStudentKey, selectedDate]);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (studentPickerRef.current && !studentPickerRef.current.contains(e.target as Node)) {
        setStudentPickerOpen(false);
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  const selectedStudent = useMemo(
    () => data?.students.find((s) => s.key === selectedStudentKey) ?? null,
    [data, selectedStudentKey]
  );

  useEffect(() => {
    if (selectedStudent) {
      setStudentSearch(selectedStudent.studentName);
    }
  }, [selectedStudent]);

  const filteredStudents = useMemo(() => {
    if (!data) return [];
    const q = studentSearch.trim().toLowerCase();
    if (!q) return data.students;
    return data.students.filter(
      (s) =>
        s.studentName.toLowerCase().includes(q) ||
        s.className.toLowerCase().includes(q) ||
        s.srNo.includes(q)
    );
  }, [data, studentSearch]);

  const classTimeline = useMemo(
    () => (data && selectedClass ? data.classDaily[selectedClass] ?? [] : []),
    [data, selectedClass]
  );

  const studentDays = useMemo(
    () => (data && selectedStudentKey ? data.studentDaily[selectedStudentKey] ?? [] : []),
    [data, selectedStudentKey]
  );

  const studentWeekly = useMemo(() => computeStudentWeekly(studentDays), [studentDays]);

  const dateClasses = useMemo(
    () => (data && selectedDate ? data.dateByClass[selectedDate] ?? [] : []),
    [data, selectedDate]
  );

  const activeSummary = useMemo(() => {
    if (!data) return null;
    if (viewMode === "class") return summaryFromDayStats(classTimeline);
    if (viewMode === "student") return summaryFromStudentDays(studentDays);
    if (viewMode === "date") return summaryFromDateClasses(dateClasses);
    return data.summary;
  }, [data, viewMode, classTimeline, studentDays, dateClasses]);

  const classChartData = useMemo(
    () =>
      [...classTimeline]
        .sort((a, b) => a.date.localeCompare(b.date))
        .map((d) => ({
          date: fmtShortDate(d.date),
          fullDate: d.date,
          Present: d.present,
          Absent: d.absent,
          Rate: d.rate,
        })),
    [classTimeline]
  );

  const studentDailyChartData = useMemo(
    () =>
      [...studentDays]
        .sort((a, b) => a.date.localeCompare(b.date))
        .map((d) => ({
          date: fmtShortDate(d.date),
          fullDate: d.date,
          Present: d.status === "present" ? 1 : 0,
          Absent: d.status === "absent" ? 1 : 0,
          status: d.status === "present" ? "Present" : "Absent",
        })),
    [studentDays]
  );

  const studentWeeklyChartData = useMemo(
    () =>
      [...studentWeekly]
        .sort((a, b) => a.weekStart.localeCompare(b.weekStart))
        .map((w) => ({
          week: w.weekLabel,
          Present: w.present,
          Absent: w.absent,
          Rate: w.rate,
          "Cumulative rate": w.cumulativeRate,
        })),
    [studentWeekly]
  );

  const dateChartData = useMemo(
    () =>
      dateClasses.map((c) => ({
        class: c.className,
        Present: c.present,
        Absent: c.absent,
        Rate: c.rate,
      })),
    [dateClasses]
  );

  const pieData = useMemo(() => {
    if (!activeSummary) return [];
    return [
      { name: "Present", value: activeSummary.totalPresent, color: PRESENT_COLOR },
      { name: "Absent", value: activeSummary.totalAbsent, color: ABSENT_COLOR },
    ].filter((d) => d.value > 0);
  }, [activeSummary]);

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-800">Attendance dashboard</h1>
          <p className="mt-1 text-sm text-slate-500">Explore attendance by class, student, or date</p>
        </div>
        <button
          type="button"
          onClick={load}
          disabled={loading}
          className="rounded-lg border border-slate-200 bg-white p-2 text-slate-500 hover:bg-slate-50 disabled:opacity-50"
          aria-label="Refresh"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>

      <div className="flex flex-wrap gap-2">
        {PERIODS.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => setPeriod(p.id)}
            className={`rounded-full px-3 py-1.5 text-xs font-medium ${
              period === p.id
                ? "bg-blue-600 text-white"
                : "border border-slate-200 bg-white text-slate-600"
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      <select
        value={viewMode}
        onChange={(e) => setViewMode(e.target.value as DashboardViewMode)}
        className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-800"
      >
        {VIEW_OPTIONS.map((v) => (
          <option key={v.id} value={v.id}>
            {v.label}
          </option>
        ))}
      </select>

      {loading && !data && (
        <div className="flex items-center justify-center gap-2 py-16 text-slate-400">
          <RefreshCw className="h-5 w-5 animate-spin" />
          <span className="text-sm">Loading dashboard…</span>
        </div>
      )}

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {data && activeSummary && (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatCard label="Attendance rate" value={`${activeSummary.overallRate}%`} />
            <StatCard label="Present" value={String(activeSummary.totalPresent)} tone="green" />
            <StatCard label="Absent" value={String(activeSummary.totalAbsent)} tone="red" />
            <StatCard
              label={viewMode === "date" ? "Students" : "Days recorded"}
              value={String(
                viewMode === "date" ? activeSummary.studentsTracked : activeSummary.daysRecorded
              )}
            />
          </div>

          {viewMode === "class" && (
            <ClassView
              classes={data.classes}
              selectedClass={selectedClass}
              onClassChange={setSelectedClass}
              timeline={classTimeline}
              chartData={classChartData}
              pieData={pieData}
            />
          )}

          {viewMode === "student" && (
            <StudentView
              pickerRef={studentPickerRef}
              selectedStudent={selectedStudent}
              filteredStudents={filteredStudents}
              studentSearch={studentSearch}
              onSearchChange={setStudentSearch}
              pickerOpen={studentPickerOpen}
              onPickerOpen={setStudentPickerOpen}
              onSelect={(key, name) => {
                setSelectedStudentKey(key);
                setStudentSearch(name);
                setStudentPickerOpen(false);
              }}
              granularity={studentGranularity}
              onGranularityChange={setStudentGranularity}
              dailyChartData={studentDailyChartData}
              weeklyChartData={studentWeeklyChartData}
              studentDays={studentDays}
              studentWeekly={studentWeekly}
              pieData={pieData}
            />
          )}

          {viewMode === "date" && (
            <DateView
              dates={data.dates}
              selectedDate={selectedDate}
              onDateChange={setSelectedDate}
              dateClasses={dateClasses}
              chartData={dateChartData}
              pieData={pieData}
            />
          )}
        </>
      )}
    </div>
  );
}

function StatCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "green" | "red";
}) {
  const color =
    tone === "green"
      ? "border-green-100 bg-green-50 text-green-700"
      : tone === "red"
        ? "border-red-100 bg-red-50 text-red-700"
        : "border-slate-200 bg-white text-slate-800";
  return (
    <div className={`rounded-xl border px-3 py-3 ${color}`}>
      <p className="text-[10px] uppercase tracking-wide opacity-70">{label}</p>
      <p className="mt-0.5 text-lg font-bold">{value}</p>
    </div>
  );
}

function ClassView({
  classes,
  selectedClass,
  onClassChange,
  timeline,
  chartData,
  pieData,
}: {
  classes: string[];
  selectedClass: string;
  onClassChange: (c: string) => void;
  timeline: { date: string; present: number; absent: number; total: number; rate: number }[];
  chartData: { date: string; Present: number; Absent: number; Rate: number }[];
  pieData: { name: string; value: number; color: string }[];
}) {
  return (
    <div className="space-y-4">
      <label className="block">
        <span className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-slate-500">
          <Users className="h-3.5 w-3.5" />
          Select class
        </span>
        <select
          value={selectedClass}
          onChange={(e) => onClassChange(e.target.value)}
          className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm"
        >
          {classes.length === 0 && <option value="">No classes with data</option>}
          {classes.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </label>

      {timeline.length === 0 ? (
        <EmptyState message="No attendance recorded for this class in the selected period." />
      ) : (
        <>
          <DataTable
            headers={["Date", "Present", "Absent", "Total", "Rate"]}
            rows={timeline.map((d) => [
              fmtDate(d.date),
              String(d.present),
              String(d.absent),
              String(d.total),
              `${d.rate}%`,
            ])}
          />

          <div className="grid gap-4 lg:grid-cols-3">
            <ChartCard title="Attendance rate over time" className="lg:col-span-2">
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} unit="%" />
                  <Tooltip content={<AttendanceTooltip />} />
                  <Line
                    type="monotone"
                    dataKey="Rate"
                    name="Rate"
                    stroke={RATE_COLOR}
                    strokeWidth={2}
                    dot={{ r: 3 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard title="Present vs absent">
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie
                    data={pieData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={75}
                    paddingAngle={2}
                  >
                    {pieData.map((entry) => (
                      <Cell key={entry.name} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </ChartCard>
          </div>

          <ChartCard title="Daily present & absent">
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                <Tooltip content={<AttendanceTooltip />} />
                <Legend />
                <Bar dataKey="Present" fill={PRESENT_COLOR} radius={[4, 4, 0, 0]} />
                <Bar dataKey="Absent" fill={ABSENT_COLOR} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
        </>
      )}
    </div>
  );
}

function StudentView({
  pickerRef,
  selectedStudent,
  filteredStudents,
  studentSearch,
  onSearchChange,
  pickerOpen,
  onPickerOpen,
  onSelect,
  granularity,
  onGranularityChange,
  dailyChartData,
  weeklyChartData,
  studentDays,
  studentWeekly,
  pieData,
}: {
  pickerRef: RefObject<HTMLDivElement | null>;
  selectedStudent: { key: string; studentName: string; className: string; srNo: string } | null;
  filteredStudents: { key: string; studentName: string; className: string; srNo: string }[];
  studentSearch: string;
  onSearchChange: (v: string) => void;
  pickerOpen: boolean;
  onPickerOpen: (v: boolean) => void;
  onSelect: (key: string, name: string) => void;
  granularity: StudentGranularity;
  onGranularityChange: (g: StudentGranularity) => void;
  dailyChartData: { date: string; Present: number; Absent: number }[];
  weeklyChartData: {
    week: string;
    Present: number;
    Absent: number;
    Rate: number;
    "Cumulative rate": number;
  }[];
  studentDays: { date: string; status: string }[];
  studentWeekly: {
    weekLabel: string;
    present: number;
    absent: number;
    total: number;
    rate: number;
    cumulativeRate: number;
  }[];
  pieData: { name: string; value: number; color: string }[];
}) {
  return (
    <div className="space-y-4">
      <div ref={pickerRef} className="relative">
        <label className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-slate-500">
          <User className="h-3.5 w-3.5" />
          Select student
        </label>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            value={studentSearch}
            onChange={(e) => {
              onSearchChange(e.target.value);
              onPickerOpen(true);
            }}
            onFocus={() => onPickerOpen(true)}
            placeholder="Search by name, class, or sr no…"
            className="w-full rounded-xl border border-slate-200 bg-white py-3 pl-10 pr-10 text-sm"
          />
          <ChevronDown className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        </div>
        {pickerOpen && (
          <ul className="absolute z-20 mt-1 max-h-56 w-full overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-lg">
            {filteredStudents.length === 0 ? (
              <li className="px-4 py-3 text-sm text-slate-500">No students found</li>
            ) : (
              filteredStudents.map((s) => (
                <li key={s.key}>
                  <button
                    type="button"
                    onClick={() => onSelect(s.key, s.studentName)}
                    className={`w-full px-4 py-2.5 text-left text-sm hover:bg-blue-50 ${
                      selectedStudent?.key === s.key ? "bg-blue-50 font-medium text-blue-800" : "text-slate-700"
                    }`}
                  >
                    <span className="block font-medium">{s.studentName}</span>
                    <span className="text-xs text-slate-500">
                      {s.className} · Sr {s.srNo}
                    </span>
                  </button>
                </li>
              ))
            )}
          </ul>
        )}
        {selectedStudent && (
          <p className="mt-1.5 text-xs text-slate-500">
            {selectedStudent.className} · Sr {selectedStudent.srNo}
          </p>
        )}
      </div>

      <div className="flex gap-1 rounded-xl bg-slate-100 p-1">
        {GRANULARITY_OPTIONS.map((g) => (
          <button
            key={g.id}
            type="button"
            onClick={() => onGranularityChange(g.id)}
            className={`flex-1 rounded-lg py-2 text-xs font-semibold ${
              granularity === g.id ? "bg-white text-slate-800 shadow-sm" : "text-slate-500"
            }`}
          >
            {g.label}
          </button>
        ))}
      </div>

      {studentDays.length === 0 ? (
        <EmptyState message="No attendance recorded for this student in the selected period." />
      ) : (
        <>
          {granularity === "daily" ? (
            <DataTable
              headers={["Date", "Status"]}
              rows={studentDays.map((d) => [
                fmtDate(d.date),
                d.status === "present" ? "Present" : "Absent",
              ])}
              statusColumn={1}
            />
          ) : (
            <DataTable
              headers={["Week", "Present", "Absent", "Rate", "Cumulative"]}
              rows={studentWeekly.map((w) => [
                w.weekLabel,
                String(w.present),
                String(w.absent),
                `${w.rate}%`,
                `${w.cumulativeRate}%`,
              ])}
            />
          )}

          <div className="grid gap-4 lg:grid-cols-3">
            <ChartCard
              title={granularity === "daily" ? "Day-wise attendance" : "Weekly attendance"}
              className="lg:col-span-2"
            >
              <ResponsiveContainer width="100%" height={220}>
                {granularity === "daily" ? (
                  <BarChart data={dailyChartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                    <YAxis domain={[0, 1]} ticks={[0, 1]} tick={{ fontSize: 11 }} />
                    <Tooltip content={<AttendanceTooltip />} />
                    <Bar dataKey="Present" stackId="a" fill={PRESENT_COLOR} />
                    <Bar dataKey="Absent" stackId="a" fill={ABSENT_COLOR} />
                  </BarChart>
                ) : (
                  <LineChart data={weeklyChartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="week" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
                    <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} unit="%" />
                    <Tooltip content={<AttendanceTooltip />} />
                    <Legend />
                    <Line
                      type="monotone"
                      dataKey="Rate"
                      name="Weekly rate"
                      stroke={RATE_COLOR}
                      strokeWidth={2}
                      dot={{ r: 3 }}
                    />
                    <Line
                      type="monotone"
                      dataKey="Cumulative rate"
                      name="Cumulative rate"
                      stroke="#7c3aed"
                      strokeWidth={2}
                      strokeDasharray="4 4"
                      dot={{ r: 3 }}
                    />
                  </LineChart>
                )}
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard title="Present vs absent">
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie
                    data={pieData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={75}
                    paddingAngle={2}
                  >
                    {pieData.map((entry) => (
                      <Cell key={entry.name} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </ChartCard>
          </div>

          {granularity === "weekly" && (
            <ChartCard title="Weekly present & absent">
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={weeklyChartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="week" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
                  <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                  <Tooltip content={<AttendanceTooltip />} />
                  <Legend />
                  <Bar dataKey="Present" fill={PRESENT_COLOR} radius={[4, 4, 0, 0]} />
                  <Bar dataKey="Absent" fill={ABSENT_COLOR} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>
          )}
        </>
      )}
    </div>
  );
}

function DateView({
  dates,
  selectedDate,
  onDateChange,
  dateClasses,
  chartData,
  pieData,
}: {
  dates: string[];
  selectedDate: string;
  onDateChange: (d: string) => void;
  dateClasses: { className: string; present: number; absent: number; total: number; rate: number }[];
  chartData: { class: string; Present: number; Absent: number; Rate: number }[];
  pieData: { name: string; value: number; color: string }[];
}) {
  return (
    <div className="space-y-4">
      <label className="block">
        <span className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-slate-500">
          <CalendarRange className="h-3.5 w-3.5" />
          Select date
        </span>
        <select
          value={selectedDate}
          onChange={(e) => onDateChange(e.target.value)}
          className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm"
        >
          {dates.length === 0 && <option value="">No dates with data</option>}
          {dates.map((d) => (
            <option key={d} value={d}>
              {fmtDate(d)}
            </option>
          ))}
        </select>
      </label>

      {dateClasses.length === 0 ? (
        <EmptyState message="No attendance recorded on this date." />
      ) : (
        <>
          <DataTable
            headers={["Class", "Present", "Absent", "Total", "Rate"]}
            rows={dateClasses.map((c) => [
              c.className,
              String(c.present),
              String(c.absent),
              String(c.total),
              `${c.rate}%`,
            ])}
          />

          <div className="grid gap-4 lg:grid-cols-3">
            <ChartCard title="Attendance by class" className="lg:col-span-2">
              <ResponsiveContainer width="100%" height={260}>
                <BarChart
                  data={chartData}
                  layout="vertical"
                  margin={{ top: 8, right: 16, left: 8, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis type="number" tick={{ fontSize: 11 }} allowDecimals={false} />
                  <YAxis type="category" dataKey="class" tick={{ fontSize: 11 }} width={72} />
                  <Tooltip content={<AttendanceTooltip />} />
                  <Legend />
                  <Bar dataKey="Present" fill={PRESENT_COLOR} radius={[0, 4, 4, 0]} />
                  <Bar dataKey="Absent" fill={ABSENT_COLOR} radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard title="School-wide split">
              <ResponsiveContainer width="100%" height={260}>
                <PieChart>
                  <Pie
                    data={pieData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={55}
                    outerRadius={80}
                    paddingAngle={2}
                  >
                    {pieData.map((entry) => (
                      <Cell key={entry.name} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </ChartCard>
          </div>

          <ChartCard title="Attendance rate by class">
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="class" tick={{ fontSize: 10 }} interval={0} angle={-25} textAnchor="end" height={60} />
                <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} unit="%" />
                <Tooltip content={<AttendanceTooltip />} />
                <Bar dataKey="Rate" name="Rate" fill={RATE_COLOR} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
        </>
      )}
    </div>
  );
}

function ChartCard({
  title,
  children,
  className = "",
}: {
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`rounded-xl border border-slate-200 bg-white p-4 ${className}`}>
      <h3 className="mb-3 text-sm font-semibold text-slate-700">{title}</h3>
      {children}
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
      {message}
    </div>
  );
}

function DataTable({
  headers,
  rows,
  statusColumn,
}: {
  headers: string[];
  rows: string[][];
  statusColumn?: number;
}) {
  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-500">
        No data in this period
      </div>
    );
  }
  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50 text-left text-xs text-slate-500">
              {headers.map((h) => (
                <th key={h} className="whitespace-nowrap px-4 py-2.5 font-medium">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i} className="border-b border-slate-50 last:border-0">
                {row.map((cell, j) => (
                  <td
                    key={j}
                    className={`whitespace-nowrap px-4 py-2.5 ${
                      statusColumn === j
                        ? cell === "Present"
                          ? "font-medium text-green-700"
                          : "font-medium text-red-700"
                        : "text-slate-700"
                    }`}
                  >
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
