import { format, parseISO } from "date-fns";
import type { ChronicAbsenceReport, FlaggedStudent } from "@/lib/attendance/chronic-absence";

const SCHOOL_NAME = "Our Lady of Fatima School";

export interface AbsenceContact {
  parentName: string;
  /** Valid 10-digit numbers, primary first. */
  phones: string[];
}

export type AbsenceContactLookup = (srNo: string) => AbsenceContact | undefined;

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function longDate(iso: string): string {
  try {
    return format(parseISO(iso), "EEEE, d MMMM yyyy");
  } catch {
    return iso;
  }
}

function shortDate(iso: string): string {
  try {
    return format(parseISO(iso), "d MMM yyyy");
  } catch {
    return iso;
  }
}

function lastPresentLabel(f: FlaggedStudent): string {
  return f.lastPresentDate ? shortDate(f.lastPresentDate) : "no present day on record";
}

export function buildAbsenceEmailSubject(report: ChronicAbsenceReport): string {
  const n = report.flagged.length;
  return `Attendance alert: ${n} student${n === 1 ? "" : "s"} with repeated absence — ${shortDate(report.dateIso)}`;
}

function phonesText(c: AbsenceContact | undefined): string {
  return c && c.phones.length > 0 ? c.phones.join(", ") : "No number on file";
}

function studentLineText(f: FlaggedStudent, c: AbsenceContact | undefined): string {
  const parent = c?.parentName ? c.parentName : "parent name not on file";
  return [
    `  - ${f.studentName} (Sr No ${f.srNo}) — ${f.reasons.join("; ")}`,
    `    Last present: ${lastPresentLabel(f)} | Parent: ${parent} | Phone: ${phonesText(c)}`,
  ].join("\n");
}

export function buildAbsenceEmailText(
  report: ChronicAbsenceReport,
  contactFor: AbsenceContactLookup
): string {
  const lines: string[] = [];
  lines.push(`${SCHOOL_NAME} — repeated absence alert`);
  lines.push(longDate(report.dateIso));
  lines.push("");
  lines.push(`${report.flagged.length} student${report.flagged.length === 1 ? "" : "s"} flagged.`);
  lines.push("Per class: " + report.countsByClass.map((c) => `${c.className} ${c.count}`).join(", "));
  lines.push("");
  lines.push(
    "Flagged when absent on the 3 most recent marked school days, or on 4+ of the last 10 marked school days."
  );
  lines.push("");
  if (report.absentEveryDay.length > 0) {
    lines.push("ABSENT EVERY DAY IN THE WINDOW");
    let cls = "";
    for (const f of report.absentEveryDay) {
      if (f.className !== cls) {
        cls = f.className;
        lines.push(`${cls}:`);
      }
      lines.push(studentLineText(f, contactFor(f.srNo)));
    }
    lines.push("");
  }
  for (const g of report.byClass) {
    lines.push(`${g.className} (${g.students.length})`);
    for (const f of g.students) lines.push(studentLineText(f, contactFor(f.srNo)));
    lines.push("");
  }
  return lines.join("\n").trimEnd() + "\n";
}

const TD = "font-family:Arial, Helvetica, sans-serif; font-size:13px; color:#374151; padding:8px 6px; border-bottom:1px solid #eef1f6; vertical-align:top;";

function phonesHtml(c: AbsenceContact | undefined): string {
  if (!c || c.phones.length === 0) return `<span style="color:#9a3412;">No number on file</span>`;
  return c.phones
    .map((p) => `<a href="tel:${escapeHtml(p)}" style="color:#1d4ed8; text-decoration:none;">${escapeHtml(p)}</a>`)
    .join("<br>");
}

function studentRowHtml(f: FlaggedStudent, c: AbsenceContact | undefined): string {
  return `
      <tr>
        <td style="${TD} font-weight:bold; color:#111827;">${escapeHtml(f.studentName)}<br><span style="font-weight:normal; color:#6b7280; font-size:12px;">Sr No ${escapeHtml(f.srNo)}</span></td>
        <td style="${TD} color:#b91c1c; font-weight:bold;">${escapeHtml(f.reasons.join("; "))}</td>
        <td style="${TD}">${escapeHtml(lastPresentLabel(f))}</td>
        <td style="${TD}">${c?.parentName ? escapeHtml(c.parentName) : `<span style="color:#9ca3af;">not on file</span>`}</td>
        <td style="${TD}">${phonesHtml(c)}</td>
      </tr>`;
}

function tableHtml(students: FlaggedStudent[], contactFor: AbsenceContactLookup): string {
  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse; margin-bottom:8px;">
      <tr>
        ${["Student", "Reason", "Last present", "Parent", "Phone"]
          .map(
            (h) =>
              `<th align="left" style="font-family:Arial, Helvetica, sans-serif; font-size:11px; color:#6b7280; text-transform:uppercase; padding:6px; border-bottom:2px solid #e5e7eb;">${h}</th>`
          )
          .join("")}
      </tr>${students.map((f) => studentRowHtml(f, contactFor(f.srNo))).join("")}
    </table>`;
}

function headingHtml(text: string, color = "#111827"): string {
  return `<h3 style="font-family:Arial, Helvetica, sans-serif; font-size:15px; color:${color}; margin:18px 0 6px 0;">${escapeHtml(text)}</h3>`;
}

export function buildAbsenceEmailHtml(
  report: ChronicAbsenceReport,
  contactFor: AbsenceContactLookup
): string {
  const counts = report.countsByClass
    .map((c) => `${escapeHtml(c.className)}: <strong>${c.count}</strong>`)
    .join(" &nbsp;·&nbsp; ");
  const everyDay =
    report.absentEveryDay.length > 0
      ? headingHtml("Absent every day in the window", "#991b1b") + tableHtml(report.absentEveryDay, contactFor)
      : "";
  const groups = report.byClass
    .map((g) => headingHtml(`${g.className} (${g.students.length})`) + tableHtml(g.students, contactFor))
    .join("");
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Repeated absence alert</title>
</head>
<body style="margin:0; padding:0; background-color:#eef1f6;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#eef1f6;">
    <tr><td align="center" style="padding:24px 12px;">
      <table role="presentation" width="640" cellpadding="0" cellspacing="0" border="0" style="width:100%; max-width:640px; background-color:#ffffff; border-radius:12px;">
        <tr><td style="padding:24px 28px;">
          <div style="font-family:Arial, Helvetica, sans-serif; font-size:12px; color:#6b7280;">${escapeHtml(SCHOOL_NAME)}</div>
          <h2 style="font-family:Arial, Helvetica, sans-serif; font-size:20px; color:#111827; margin:4px 0;">Repeated absence alert</h2>
          <div style="font-family:Arial, Helvetica, sans-serif; font-size:13px; color:#6b7280;">${escapeHtml(longDate(report.dateIso))}</div>
          <p style="font-family:Arial, Helvetica, sans-serif; font-size:14px; color:#111827; margin:14px 0 4px 0;"><strong>${report.flagged.length}</strong> student${report.flagged.length === 1 ? "" : "s"} flagged.</p>
          <p style="font-family:Arial, Helvetica, sans-serif; font-size:13px; color:#374151; margin:0 0 4px 0;">${counts}</p>
          <p style="font-family:Arial, Helvetica, sans-serif; font-size:12px; color:#6b7280; margin:0;">Flagged when absent on the 3 most recent marked school days, or on 4 or more of the last 10 marked school days.</p>
          ${everyDay}${groups}
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}
