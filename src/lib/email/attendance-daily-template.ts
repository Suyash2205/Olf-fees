import type { DailyAttendanceSummary, DailyClassAttendanceRow } from "@/lib/attendance/daily-summary";

const SCHOOL_NAME = "Our Lady of Fatima School";

function classRowHtml(row: DailyClassAttendanceRow): string {
  return `
                <tr>
                  <td class="cell-class" align="left" style="font-family:Arial, Helvetica, sans-serif; color:#111827; font-size:14px; font-weight:bold; padding:11px 6px; border-bottom:1px solid #eef1f6;">${escapeHtml(row.className)}</td>
                  <td class="num" align="center" style="font-family:Arial, Helvetica, sans-serif; color:#374151; font-size:14px; padding:11px 6px; border-bottom:1px solid #eef1f6;">${row.total}</td>
                  <td class="num" align="center" style="font-family:Arial, Helvetica, sans-serif; color:#15803d; font-size:14px; font-weight:bold; padding:11px 6px; border-bottom:1px solid #eef1f6;">${row.present}</td>
                  <td class="num" align="center" style="font-family:Arial, Helvetica, sans-serif; color:#b91c1c; font-size:14px; font-weight:bold; padding:11px 6px; border-bottom:1px solid #eef1f6;">${row.absent}</td>
                  <td class="num" align="right" style="font-family:Arial, Helvetica, sans-serif; color:#111827; font-size:14px; font-weight:bold; padding:11px 6px; border-bottom:1px solid #eef1f6;">${row.rate}%</td>
                </tr>`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function buildAttendanceDailyEmailHtml(summary: DailyAttendanceSummary): string {
  const classRows = summary.byClass.map(classRowHtml).join("");
  const unmarkedBlock =
    summary.unmarkedClasses.length > 0
      ? `
          <tr>
            <td style="padding:0 32px 8px 32px;" class="px">
              <div style="font-family:Arial, Helvetica, sans-serif; background-color:#fff7ed; border:1px solid #fed7aa; border-radius:10px; padding:14px 16px; color:#9a3412; font-size:13px; line-height:1.5;">
                <strong>Classes not marked today:</strong> ${escapeHtml(summary.unmarkedClasses.join(", "))}
              </div>
            </td>
          </tr>`
      : "";

  const noneMarkedBlock = summary.noneMarked
    ? `
          <tr>
            <td style="padding:0 32px 8px 32px;" class="px">
              <div style="font-family:Arial, Helvetica, sans-serif; background-color:#fef2f2; border:1px solid #fecaca; border-radius:10px; padding:14px 16px; color:#991b1b; font-size:14px; font-weight:bold; text-align:center;">
                No classes marked today
              </div>
            </td>
          </tr>`
    : "";

  const tableBody =
    summary.byClass.length > 0
      ? classRows
      : `
                <tr>
                  <td colspan="5" align="center" style="font-family:Arial, Helvetica, sans-serif; color:#6b7280; font-size:14px; padding:18px 6px; border-bottom:1px solid #eef1f6;">
                    No class attendance recorded yet for this date.
                  </td>
                </tr>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Daily Attendance Summary</title>
  <style>
    body, table, td, a { -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
    table, td { mso-table-lspace: 0pt; mso-table-rspace: 0pt; }
    body { margin: 0; padding: 0; width: 100% !important; background-color: #eef1f6; }
    @media screen and (max-width: 600px) {
      .container { width: 100% !important; }
      .px { padding-left: 18px !important; padding-right: 18px !important; }
      .stat-cell { display: block !important; width: 100% !important; box-sizing: border-box; }
    }
  </style>
</head>
<body style="margin:0; padding:0; background-color:#eef1f6;">
  <div style="display:none; max-height:0; overflow:hidden; font-size:1px; line-height:1px; color:#eef1f6; opacity:0;">
    ${escapeHtml(summary.previewText)}
  </div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#eef1f6;">
    <tr>
      <td align="center" style="padding:24px 12px;">
        <table role="presentation" class="container" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px; max-width:600px; background-color:#ffffff; border-radius:12px; overflow:hidden; box-shadow:0 1px 3px rgba(16,24,40,0.08);">
          <tr>
            <td style="background-color:#1f3a8a; padding:26px 32px;" class="px">
              <div style="font-family:Arial, Helvetica, sans-serif; color:#ffffff; font-size:18px; font-weight:bold;">${SCHOOL_NAME}</div>
              <div style="font-family:Arial, Helvetica, sans-serif; color:#c7d2fe; font-size:13px; padding-top:4px;">Daily Attendance Summary</div>
            </td>
          </tr>
          <tr>
            <td style="background-color:#eef2ff; padding:12px 32px; font-family:Arial, Helvetica, sans-serif; color:#3730a3; font-size:13px; font-weight:bold;" class="px">
              ${escapeHtml(summary.dateLabel)}
            </td>
          </tr>
          ${noneMarkedBlock}
          <tr>
            <td style="padding:28px 32px 8px 32px;" class="px">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid #e5e8f0; border-radius:10px;">
                <tr>
                  <td style="padding:20px 22px;">
                    <div style="font-family:Arial, Helvetica, sans-serif; color:#6b7280; font-size:12px; text-transform:uppercase; letter-spacing:1px;">Overall Attendance</div>
                    <div style="font-family:Arial, Helvetica, sans-serif; color:#111827; font-size:40px; font-weight:bold; line-height:1.1; padding-top:2px;">${summary.overallRate}%</div>
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:18px;">
                      <tr>
                        <td class="stat-cell" width="33.33%" valign="top">
                          <div style="font-family:Arial, Helvetica, sans-serif; color:#6b7280; font-size:12px;">Total Students</div>
                          <div style="font-family:Arial, Helvetica, sans-serif; color:#111827; font-size:22px; font-weight:bold; padding-top:2px;">${summary.totalStudents}</div>
                        </td>
                        <td class="stat-cell" width="33.33%" valign="top">
                          <div style="font-family:Arial, Helvetica, sans-serif; color:#6b7280; font-size:12px;">Present</div>
                          <div style="font-family:Arial, Helvetica, sans-serif; color:#15803d; font-size:22px; font-weight:bold; padding-top:2px;">${summary.totalPresent}</div>
                        </td>
                        <td class="stat-cell" width="33.33%" valign="top">
                          <div style="font-family:Arial, Helvetica, sans-serif; color:#6b7280; font-size:12px;">Absent</div>
                          <div style="font-family:Arial, Helvetica, sans-serif; color:#b91c1c; font-size:22px; font-weight:bold; padding-top:2px;">${summary.totalAbsent}</div>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          ${unmarkedBlock}
          <tr>
            <td style="padding:20px 32px 8px 32px;" class="px">
              <div style="font-family:Arial, Helvetica, sans-serif; color:#111827; font-size:15px; font-weight:bold; padding-bottom:10px;">Class-wise Breakdown</div>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">
                <tr>
                  <th align="left" style="font-family:Arial, Helvetica, sans-serif; color:#6b7280; font-size:11px; text-transform:uppercase; letter-spacing:0.5px; font-weight:bold; padding:8px 6px; border-bottom:2px solid #e5e8f0;">Class</th>
                  <th align="center" style="font-family:Arial, Helvetica, sans-serif; color:#6b7280; font-size:11px; text-transform:uppercase; letter-spacing:0.5px; font-weight:bold; padding:8px 6px; border-bottom:2px solid #e5e8f0;">Total</th>
                  <th align="center" style="font-family:Arial, Helvetica, sans-serif; color:#6b7280; font-size:11px; text-transform:uppercase; letter-spacing:0.5px; font-weight:bold; padding:8px 6px; border-bottom:2px solid #e5e8f0;">Present</th>
                  <th align="center" style="font-family:Arial, Helvetica, sans-serif; color:#6b7280; font-size:11px; text-transform:uppercase; letter-spacing:0.5px; font-weight:bold; padding:8px 6px; border-bottom:2px solid #e5e8f0;">Absent</th>
                  <th align="right" style="font-family:Arial, Helvetica, sans-serif; color:#6b7280; font-size:11px; text-transform:uppercase; letter-spacing:0.5px; font-weight:bold; padding:8px 6px; border-bottom:2px solid #e5e8f0;">%</th>
                </tr>
                ${tableBody}
                <tr>
                  <td align="left" style="font-family:Arial, Helvetica, sans-serif; color:#111827; font-size:14px; font-weight:bold; padding:13px 6px; border-top:2px solid #e5e8f0; background-color:#f7f9fc;">Total</td>
                  <td align="center" style="font-family:Arial, Helvetica, sans-serif; color:#111827; font-size:14px; font-weight:bold; padding:13px 6px; border-top:2px solid #e5e8f0; background-color:#f7f9fc;">${summary.totalStudents}</td>
                  <td align="center" style="font-family:Arial, Helvetica, sans-serif; color:#15803d; font-size:14px; font-weight:bold; padding:13px 6px; border-top:2px solid #e5e8f0; background-color:#f7f9fc;">${summary.totalPresent}</td>
                  <td align="center" style="font-family:Arial, Helvetica, sans-serif; color:#b91c1c; font-size:14px; font-weight:bold; padding:13px 6px; border-top:2px solid #e5e8f0; background-color:#f7f9fc;">${summary.totalAbsent}</td>
                  <td align="right" style="font-family:Arial, Helvetica, sans-serif; color:#1f3a8a; font-size:14px; font-weight:bold; padding:13px 6px; border-top:2px solid #e5e8f0; background-color:#f7f9fc;">${summary.overallRate}%</td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:22px 32px 30px 32px;" class="px">
              <hr style="border:none; border-top:1px solid #eef1f6; margin:0 0 16px 0;">
              <p style="font-family:Arial, Helvetica, sans-serif; color:#9ca3af; font-size:12px; line-height:1.6; margin:0;">
                This is an automated daily report generated by ${SCHOOL_NAME}.
                Please do not reply to this email. For corrections, contact the school office.
              </p>
              <p style="font-family:Arial, Helvetica, sans-serif; color:#c0c4cc; font-size:11px; margin:10px 0 0 0;">
                Generated on ${escapeHtml(summary.generatedLabel)} · Academic Year ${escapeHtml(summary.academicYear)}
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export function buildAttendanceDailyEmailSubject(summary: DailyAttendanceSummary): string {
  if (summary.noneMarked) {
    return `Daily Attendance — ${summary.dateLabel} — no classes marked`;
  }
  return `Daily Attendance — ${summary.dateLabel} — ${summary.overallRate}% present`;
}

export function buildAttendanceDailyEmailText(summary: DailyAttendanceSummary): string {
  const lines = [
    `${SCHOOL_NAME} — Daily Attendance Summary`,
    summary.dateLabel,
    "",
    `Overall: ${summary.overallRate}%`,
    `Total students (marked): ${summary.totalStudents}`,
    `Present: ${summary.totalPresent}`,
    `Absent: ${summary.totalAbsent}`,
    "",
  ];

  if (summary.noneMarked) {
    lines.push("No classes marked today.", "");
  }

  if (summary.byClass.length > 0) {
    lines.push("Class-wise breakdown:");
    for (const row of summary.byClass) {
      lines.push(
        `- ${row.className}: ${row.present} present, ${row.absent} absent (${row.rate}%)`
      );
    }
    lines.push("");
  }

  if (summary.unmarkedClasses.length > 0) {
    lines.push(`Classes not marked today: ${summary.unmarkedClasses.join(", ")}`);
  }

  return lines.join("\n");
}
