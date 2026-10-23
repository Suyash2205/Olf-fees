/**
 * What the WhatsApp bot (separate private repo `olf-bot`) pulls from the portal: the active
 * roster with parent phones, and attendance from a start date. Read-only; joined on Sr No.
 */
import { canonicalClassLabel, resolveClass } from "@/lib/fees/structure";
import type { AttendanceRow } from "@/lib/attendance/types";
import type { FeeRecord } from "@/lib/sheets/fees";
import type { ResolvedParentContact } from "@/lib/sheets/parent-contacts";
import { feeRecordIsInactive } from "@/lib/sheets/fees-inactive";

export interface BotSnapshot {
  today: string;
  from: string;
  students: { srNo: string; name: string; className: string; active: boolean; phones: string[] }[];
  attendance: { srNo: string; date: string; status: "present" | "absent" }[];
}

export function buildBotSnapshot(input: {
  today: string;
  from: string;
  fees: Pick<FeeRecord, "srNo" | "studentName" | "className" | "notes">[];
  inactiveKeys: Set<string>;
  contacts: Map<string, ResolvedParentContact>;
  attendance: Pick<AttendanceRow, "srNo" | "date" | "status">[];
}): BotSnapshot {
  const students: BotSnapshot["students"] = [];
  const known = new Set<string>();
  for (const f of input.fees) {
    const srNo = String(f.srNo).trim();
    const label = canonicalClassLabel(f.className);
    if (!srNo || !f.studentName.trim() || !resolveClass(label)) continue;
    if (known.has(srNo)) throw new Error(`Duplicate Sr No ${srNo} in the fee sheet`);
    known.add(srNo);
    students.push({
      srNo,
      name: f.studentName.trim(),
      className: label,
      active: !feeRecordIsInactive({ studentName: f.studentName, notes: f.notes ?? "" }, input.inactiveKeys),
      phones: input.contacts.get(srNo)?.phones ?? [],
    });
  }
  const attendance = input.attendance
    .filter((a) => a.date >= input.from && a.date <= input.today && known.has(String(a.srNo).trim()))
    .map((a) => ({ srNo: String(a.srNo).trim(), date: a.date, status: a.status }));
  return { today: input.today, from: input.from, students, attendance };
}
