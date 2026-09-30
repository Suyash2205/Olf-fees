import { anyMarkedOn, computeChronicAbsence, type ChronicAbsenceReport } from "@/lib/attendance/chronic-absence";
import { readAllAttendanceRows } from "@/lib/sheets/attendance";
import { getAllFees } from "@/lib/sheets/fees";
import { readCalendarEntries } from "@/lib/sheets/school-calendar";

/**
 * Chronic-absence report from three cached batch reads (attendance matrix tabs, fee roster,
 * calendar) — no per-class or per-student Sheets calls.
 */
export async function buildChronicAbsenceReport(
  todayIso: string
): Promise<ChronicAbsenceReport & { markedToday: boolean }> {
  const [rows, fees, entries] = await Promise.all([
    readAllAttendanceRows(),
    getAllFees(),
    readCalendarEntries(),
  ]);
  const markedToday = anyMarkedOn(rows, todayIso);
  const report = computeChronicAbsence({
    rows,
    // One roster entry per Sr No, even if the fee sheet has a duplicated row.
    roster: [...new Map(fees.map((f) => [f.srNo, f])).values()].map((f) => ({
      srNo: f.srNo,
      studentName: f.studentName,
      className: f.className,
    })),
    entries,
    todayIso,
  });
  return { ...report, markedToday };
}
