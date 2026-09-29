/** "Fee follow-ups due" morning email — pure builders (subject, plain text, HTML). */
import type { DueFollowUp } from "@/lib/fees/follow-ups";
import { followUpNoteText } from "@/lib/fees/pending-report";
import { compareByGradeThenName } from "@/lib/sort-by-grade";

const SCHOOL_NAME = "Our Lady of Fatima School";

export interface FeeFollowUpEmailItem {
  srNo: string;
  studentName: string;
  className: string;
  /** Outstanding balance in rupees. */
  balance: number;
  parentName: string;
  /** Valid 10-digit numbers, primary first. */
  phones: string[];
  lastNote: string;
  lastNoteDate: string;
  nextFollowUp: string;
  overdue: boolean;
  daysOverdue: number;
}

export interface FeeFollowUpEmailData {
  dateIso: string;
  items: FeeFollowUpEmailItem[];
}

export interface FeeFollowUpEmail {
  subject: string;
  text: string;
  html: string;
  count: number;
  overdueCount: number;
}

/** Join due follow-ups with the fee balance and parent contact (both keyed by Sr No). */
export function toEmailItems(
  due: DueFollowUp[],
  balanceBySrNo: ReadonlyMap<string, number>,
  contactBySrNo: ReadonlyMap<string, { parentName: string; phones: string[] }>
): FeeFollowUpEmailItem[] {
  return due.map(({ followUp: f, overdue, daysOverdue }) => {
    const c = contactBySrNo.get(f.srNo);
    return {
      srNo: f.srNo,
      studentName: f.studentName,
      className: f.className,
      balance: balanceBySrNo.get(f.srNo) ?? 0,
      parentName: c?.parentName ?? "",
      phones: c?.phones ?? [],
      lastNote: followUpNoteText(f),
      lastNoteDate: f.date,
      nextFollowUp: f.nextFollowUp,
      overdue,
      daysOverdue,
    };
  });
}

function inr(n: number): string {
  return `₹${Math.round(n).toLocaleString("en-IN")}`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function longDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "UTC",
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(d);
}

/** Items grouped by class in grade order; students inside a class by name. */
export function groupFollowUpItems(
  items: FeeFollowUpEmailItem[]
): { className: string; items: FeeFollowUpEmailItem[] }[] {
  const sorted = [...items].sort((a, b) =>
    compareByGradeThenName(a.className, b.className, a.studentName, b.studentName)
  );
  const groups: { className: string; items: FeeFollowUpEmailItem[] }[] = [];
  for (const it of sorted) {
    let g = groups.find((x) => x.className === it.className);
    if (!g) {
      g = { className: it.className, items: [] };
      groups.push(g);
    }
    g.items.push(it);
  }
  return groups;
}

function dueLabel(it: FeeFollowUpEmailItem): string {
  if (!it.overdue) return "due today";
  return `overdue by ${it.daysOverdue} day${it.daysOverdue === 1 ? "" : "s"} (was ${it.nextFollowUp})`;
}

export function buildFeeFollowUpsSubject(data: FeeFollowUpEmailData): string {
  const n = data.items.length;
  const overdue = data.items.filter((i) => i.overdue).length;
  const extra = overdue > 0 ? `, ${overdue} overdue` : "";
  return `Fee follow-ups due: ${n} student${n === 1 ? "" : "s"}${extra} — ${data.dateIso}`;
}

export function buildFeeFollowUpsText(data: FeeFollowUpEmailData): string {
  const lines: string[] = [
    `${SCHOOL_NAME} — fee follow-ups due`,
    longDate(data.dateIso),
    "",
    `${data.items.length} student${data.items.length === 1 ? "" : "s"} to call today or overdue.`,
  ];
  for (const g of groupFollowUpItems(data.items)) {
    lines.push("", `${g.className} (${g.items.length})`, "-".repeat(Math.max(4, g.className.length + 4)));
    for (const it of g.items) {
      lines.push(`* ${it.studentName} (Sr No ${it.srNo}) — balance ${inr(it.balance)} — ${dueLabel(it)}`);
      const who = it.parentName ? `${it.parentName}: ` : "";
      lines.push(
        `  Parent: ${it.phones.length ? who + it.phones.map((p) => `+91 ${p}`).join(", ") : who + "No number on file"}`
      );
      lines.push(
        `  Last note${it.lastNoteDate ? ` (${it.lastNoteDate})` : ""}: ${it.lastNote || "No note recorded"}`
      );
    }
  }
  lines.push("", "Log the call in the portal: Pending Fees > click the student.");
  return lines.join("\n");
}

export function buildFeeFollowUpsHtml(data: FeeFollowUpEmailData): string {
  const font = "font-family:Arial, Helvetica, sans-serif;";
  const groups = groupFollowUpItems(data.items)
    .map((g) => {
      const rows = g.items
        .map((it) => {
          const phones = it.phones.length
            ? it.phones.map((p) => `<a href="tel:+91${p}" style="color:#1d4ed8;">+91 ${p}</a>`).join(", ")
            : `<span style="color:#b91c1c;">No number on file</span>`;
          const badge = it.overdue
            ? `<span style="color:#b91c1c;font-weight:bold;">${escapeHtml(dueLabel(it))}</span>`
            : `<span style="color:#b45309;font-weight:bold;">due today</span>`;
          return `<tr>
  <td style="${font}font-size:13px;padding:8px 6px;border-bottom:1px solid #eef1f6;vertical-align:top;"><strong>${escapeHtml(it.studentName)}</strong><br><span style="color:#6b7280;">Sr No ${escapeHtml(it.srNo)}</span>${it.parentName ? `<br><span style="color:#6b7280;">${escapeHtml(it.parentName)}</span>` : ""}</td>
  <td style="${font}font-size:13px;padding:8px 6px;border-bottom:1px solid #eef1f6;vertical-align:top;">${phones}</td>
  <td align="right" style="${font}font-size:13px;padding:8px 6px;border-bottom:1px solid #eef1f6;vertical-align:top;"><strong>${inr(it.balance)}</strong><br>${badge}</td>
  <td style="${font}font-size:12px;color:#374151;padding:8px 6px;border-bottom:1px solid #eef1f6;vertical-align:top;">${it.lastNote ? escapeHtml(it.lastNote) : `<em>No note recorded</em>`}${it.lastNoteDate ? `<br><span style="color:#9ca3af;">${escapeHtml(it.lastNoteDate)}</span>` : ""}</td>
</tr>`;
        })
        .join("");
      return `<h3 style="${font}font-size:15px;color:#111827;margin:20px 0 6px;">${escapeHtml(g.className)} <span style="color:#6b7280;font-weight:normal;">(${g.items.length})</span></h3>
<table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
<tr><th align="left" style="${font}font-size:11px;color:#6b7280;padding:4px 6px;">Student</th><th align="left" style="${font}font-size:11px;color:#6b7280;padding:4px 6px;">Parent phone</th><th align="right" style="${font}font-size:11px;color:#6b7280;padding:4px 6px;">Balance</th><th align="left" style="${font}font-size:11px;color:#6b7280;padding:4px 6px;">Last note</th></tr>
${rows}
</table>`;
    })
    .join("\n");

  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Fee follow-ups due</title></head>
<body style="margin:0;padding:16px;background-color:#eef1f6;">
<div style="max-width:720px;margin:0 auto;background:#ffffff;border-radius:12px;padding:24px;">
<h2 style="${font}font-size:18px;color:#111827;margin:0;">Fee follow-ups due</h2>
<p style="${font}font-size:13px;color:#6b7280;margin:4px 0 0;">${escapeHtml(SCHOOL_NAME)} · ${escapeHtml(longDate(data.dateIso))}</p>
<p style="${font}font-size:14px;color:#374151;">${data.items.length} student${data.items.length === 1 ? "" : "s"} to call today or overdue.</p>
${groups}
<p style="${font}font-size:12px;color:#9ca3af;margin-top:24px;">Log the call in the portal: Pending Fees, then click the student.</p>
</div></body></html>`;
}

export function buildFeeFollowUpsEmail(data: FeeFollowUpEmailData): FeeFollowUpEmail {
  return {
    subject: buildFeeFollowUpsSubject(data),
    text: buildFeeFollowUpsText(data),
    html: buildFeeFollowUpsHtml(data),
    count: data.items.length,
    overdueCount: data.items.filter((i) => i.overdue).length,
  };
}
