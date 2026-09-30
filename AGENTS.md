<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# OLF staff portal — orientation

Google Sheets is the source of truth; there is no student database. One spreadsheet
(`FEES_SHEET_ID`) holds every tab. A student's identity is `Sr No` from the fees sheet, and
the class roster is derived from fee rows — no fee row means the student does not exist to
the system.

## Read before working on a subsystem

| Working on | Read first |
|---|---|
| **Attendance** (anything) | `docs/ATTENDANCE_SYSTEM_REFERENCE.md` — sheet layouts, the read path, the identity joins, the quota hazard, and a list of gotchas that have already cost debugging time |
| **The WhatsApp attendance bot** | `docs/WHATSAPP_ATTENDANCE_BOT_PLAN.md` — locked decisions, open questions for RD, the phase-0 audit result, phased build plan. Its section 0 is a required-reading list. |
| Admissions / GR numbers | `docs/ADMISSIONS.md` |
| Academic-year change | `docs/YEAR_ROLLOVER.md` |

## Rules that apply everywhere here

- **Wrap every Google Sheets call in `cachedSheetRead()` + `withSheetRetry()`.** This repo
  has had two production quota outages (`9a4f287`, `f4997dc`). One service account serves
  every user, so bursts are shared.
- **Never join students by name** — duplicate and re-admitted names exist (`0b89df8`). Join
  on `Sr No`, or on the GR number via `parseGrNoFromNotes()`.
- **Use `todayIsoInTimeZone()`** (`src/lib/attendance/daily-summary.ts:30`) for "today". The
  server is UTC, the school is IST; after 18:30 UTC a naive date is already tomorrow.
- **Filter inactive students** (`feeRecordIsInactive()`) before anything user- or
  parent-facing.
- **Product decisions belong to RD.** Surface implicit choices (a threshold, a default, a
  message wording) as open questions rather than baking them in.
- **No silent fallbacks.** When something fails, stop and make it visible.
