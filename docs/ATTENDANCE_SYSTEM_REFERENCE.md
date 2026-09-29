# Attendance System — Code Reference Map

**Purpose:** everything a new session needs to know about how attendance actually works in
this repo, with exact file and line references. Written 2026-08-17 as the companion to
`docs/WHATSAPP_ATTENDANCE_BOT_PLAN.md`.

Read this **before** touching anything attendance-related. Line numbers are accurate as of
2026-08-17; if a file has moved, search for the exported symbol name rather than guessing.

---

## 1. The one-paragraph mental model

There is **no database of students.** Google Sheets is the source of truth. A single
spreadsheet (`FEES_SHEET_ID`) holds every tab. The **class roster is derived from the fees
sheet** — if a student has a fee row, they exist. Attendance is stored as **one matrix tab
per class**, names down the rows and dates across the columns. A student's identity
everywhere is `Sr No` (column A of the fees sheet). Parent phone numbers live on a
*different* tab (`Admissions`) keyed by `Gr No`, which is stored as free text inside the
fees sheet's Notes cell. There is an optional Neon Postgres mirror, but it is a read cache
only and defaults to off.

---

## 2. Where everything lives

### Spreadsheet tabs (all inside `FEES_SHEET_ID`)

| Tab | Shape | Read by |
|---|---|---|
| `Fee details` | 3 header rows, data from **row 4**. A=Sr No, B=Name, C=Class, E=Fees decided, G=Comments (holds `GR: GR-2026-123`), H=Discount, L/P/T/X=Q1–Q4 paid, Y=Total paid, Z=Pending | `src/lib/sheets/fees.ts:47-64` |
| `Attendance · <class>` | 2 header rows. Row 1 = `Name | Sr No | Dates`, row 2 = the date values. Data from row 3. One tab per class. | `src/lib/sheets/attendance.ts:28-46` |
| `Admissions` | 1 header row, data from row 2. 45 columns — see `ADMISSION_HEADERS` | `src/lib/sheets/admissions.ts:19-65` |
| audit log tabs | append-only | `src/lib/sheets/audit-log.ts`, `attendance-audit-log.ts` |

The Google client and sheet IDs: `src/lib/sheets/client.ts` — `getSheetsClient()`,
`FEES_SHEET_ID`, `STUDENTS_SHEET_ID`.

### Key constants

- `CLASS_OPTIONS` — the 14 canonical class names, `src/lib/fees/structure.ts:3-17`:
  `P.G.`, `Nursery`, `Jr. Kg.`, `Sr. Kg.`, `1st Std` … `10th Std`.
- `ATTENDANCE_SHEET_PREFIX = "Attendance · "` — `src/lib/sheets/attendance.ts:28`.
  **Note the middle dot (U+00B7), not a hyphen.**
- `DATA_START_ROW = 4`, `SHEET_NAME = "Fee details"` — `src/lib/sheets/fees.ts:46-47`.

---

## 3. The read path — how a day's attendance is produced

```
buildDailyAttendanceSummary(dateIso)          src/lib/attendance/daily-summary.ts:50
   │
   ├── getAttendanceClassSummaries()          src/lib/attendance/students.ts:46
   │      └── getAllFees()                    src/lib/sheets/fees.ts   (roster source!)
   │
   └── readAllAttendanceRows()                src/lib/sheets/attendance.ts:486
          ├── listAttendanceSheetTitles()      (tabs starting "Attendance · ")
          ├── batchReadClassMatrices()
          └── matrixToAttendanceRows()         src/lib/sheets/attendance.ts:186
                 → AttendanceRow[]  { date, studentName, srNo, status, className, … }
```

`buildDailyAttendanceSummary` then filters to `r.date === dateIso`, buckets by
`canonicalClassLabel(row.className)`, and returns
(`src/lib/attendance/daily-summary.ts:15-28`):

```ts
{ dateIso, dateLabel, generatedLabel, academicYear,
  overallRate, totalStudents, totalPresent, totalAbsent,
  byClass: [{ className, total, present, absent, rate }],
  unmarkedClasses: string[],     // expected classes with zero rows today
  noneMarked: boolean,
  previewText: string }
```

**This is exactly the payload the WhatsApp bot needs for the group summary.** Reuse it; do
not write a second aggregator. The only thing it lacks is the *names* of absent students,
which the DM path needs — get those from `readAllAttendanceRows()` filtered to
`status === "absent"`.

Useful narrower reads:
- `readAttendanceForDate(className, date)` — `src/lib/sheets/attendance.ts:349`
- `getClassesMarkedForDate(date)` — `src/lib/sheets/attendance.ts:502`
- `readClassAttendance(className)` — `src/lib/sheets/attendance.ts:343`

---

## 4. The existing 7:30 PM email — the closest working analogue

**Copy its structure.** The WhatsApp job is the same job with a different transport.

| Piece | File |
|---|---|
| Cron schedule `0 14 * * 1-5` (14:00 UTC = 19:30 IST, Mon–Fri) | `vercel.json` |
| Endpoint | `src/app/api/cron/attendance-daily-summary/route.ts` |
| Bearer-secret auth (`CRON_SECRET`) | same file, lines 17-22 |
| Weekend skip | same file, lines 29-31 → `isWeekdayInTimeZone()` |
| Recipients from env | `parseRecipientList(process.env.ATTENDANCE_SUMMARY_EMAILS)` — `src/lib/email/send-gmail.ts:3` |
| Sending | `sendGmailMessage()` — `src/lib/email/send-gmail.ts:10` (Gmail SMTP + app password, free) |
| Templates | `src/lib/email/attendance-daily-template.ts` |

Two helpers in `src/lib/attendance/daily-summary.ts` you will reuse verbatim:
- `todayIsoInTimeZone(tz = "Asia/Kolkata")` — line 30. **Never use `new Date().toISOString()`
  for "today"** — the server runs in UTC and after 18:30 UTC it is already tomorrow in IST.
- `isWeekdayInTimeZone(tz = "Asia/Kolkata")` — line 34.

⚠️ `todayISO()` in `src/lib/attendance/types.ts:39` is the **UTC** version. It exists for
other call sites. Do not use it for anything parent-facing.

---

## 5. The write path (read-only knowledge — the bot must never write)

`POST /api/attendance/record` → `saveAttendanceForDate()`
(`src/lib/sheets/attendance.ts:397`) → rewrites the class matrix → `verifySheetWrite()` →
`invalidateSheetCache()` → appends to the attendance audit log.

The bot is **strictly read-only.** If you ever find yourself calling a write helper from the
bot path, stop — that is out of scope and needs RD's sign-off.

---

## 6. Identity and joins — the part that bites

### The chain from an attendance row to a parent phone number

```
AttendanceRow          srNo, studentName, className, status
   │                   src/lib/attendance/types.ts:20-30   ← NO phone, NO GR number
   ▼  match on srNo
FeeRecord              srNo, studentName, className, notes
   │                   src/lib/sheets/fees.ts:28-42
   ▼  parseGrNoFromNotes(fee.notes)  →  "GR-2026-123"
   │  src/lib/admission-form.ts:96   regex: /(?:GR:\s*)?(GR-\d{4}-\d+)/i
   ▼  match on Gr No
AdmissionRecord        fatherContact, motherContact, studentContact
                       src/lib/sheets/admissions.ts:95-125
```

**Audit result (2026-08-17, `scripts/audit-parent-contacts.mjs`): this chain resolves for
556 of 556 active students — 100%.** The GR notes are clean. The failure is that the phone
*cells themselves* are empty for 433 of them. See
`docs/WHATSAPP_ATTENDANCE_BOT_PLAN.md` section 4 for the full numbers.

### Rules that are not optional

1. **Always `canonicalClassLabel()` before comparing class names.**
   `src/lib/fees/structure.ts:113`. Raw sheet values vary; unnormalised comparison silently
   misses rows.
2. **Never join students by name.** `0b89df8 Fix re-admitted duplicate-name students being
   hidden from fees` exists for a reason. The audit measured it: a name fallback would
   recover **0** students and introduces ambiguity risk for free.
3. **Always `normalizeSheetDate()` on any date read from a sheet.**
   `src/lib/sheets/verify-write.ts:13` — handles both `YYYY-MM-DD` and `DD/MM/YYYY`.
4. **Inactive students must be filtered.** `feeRecordIsInactive()` /
   `getInactiveStudentKeys()` — `src/lib/sheets/fees-inactive.ts:29,34`. A student is
   inactive if their admission Status is `Left`/`Failed`/`Removed`
   (`src/lib/student-status.ts:2`) **or** their fee notes match `/STATUS:\s*(Left|Failed|Removed)/i`.
   96 of 652 fee rows are inactive today. Messaging a departed student's parents would be a
   visible failure.
5. `Pass out` appears as a class label in the data (9 students) but is **not** in
   `CLASS_OPTIONS` — `isPassOutClass()` at `src/lib/sort-by-grade.ts:7`. Exclude it.
6. Sort classes with `classSortIndex()` / `sortByGradeThenName()` —
   `src/lib/sort-by-grade.ts:14,37`. Alphabetical sorting puts `10th Std` before `1st Std`.

---

## 7. Google Sheets quota — a live production hazard

This repo has already had **two** quota outages. Both fixes are in git history:

```
9a4f287 Cut attendance Sheets reads to survive concurrent teachers
f4997dc Cache shared fee + admissions reads to stop quota outage
```

All portal users share **one service account**, so Google counts every request against the
same per-user read quota. Two mandatory tools:

- `cachedSheetRead(key, loader, ttlMs)` — `src/lib/sheets/read-cache.ts:6`. In-memory,
  default 45s TTL. Attendance reads use 20s; fees use 15s.
- `withSheetRetry(fn, {retries=4, baseDelayMs=400})` — `src/lib/sheets/retry.ts:23`.
  Exponential backoff with jitter on 429/500/503, ~6s worst case.

**Wrap every new Sheets call in both.** The WhatsApp bot's own load is trivial (one read per
day) but it must not become the request that tips a busy morning over the limit.

---

## 8. Auth patterns — pick the right one

| Caller | Pattern | File |
|---|---|---|
| Cron / machine | `Bearer ${process.env.CRON_SECRET}` on the `authorization` header | `src/app/api/cron/attendance-daily-summary/route.ts:17-22` |
| Teacher (attendance UI) | `requireAttendanceApiAuth(req)` | `src/lib/attendance/api-auth.ts:5` |
| Admin (fees/expenses) | `canAccessFees()` | `src/lib/access-control.ts:24` |
| Allow-lists | `FEES_ALLOWED_EMAILS`, `ATTENDANCE_ALLOWED_EMAILS` (comma-separated) | `src/lib/access-control.ts:16-17` |

**The WhatsApp bot endpoint uses the CRON_SECRET pattern** — it's a machine caller with no
Google session. Note the trap in `access-control.ts:20`: when *neither* allow-list is
configured, `isConfigured()` returns false and access is granted to everyone. That is
deliberate for local dev; never rely on it in production.

---

## 9. Environment variables

From `.env.local.example`:

```
GOOGLE_SERVICE_ACCOUNT_JSON   full service-account JSON on one line
STUDENTS_SHEET_ID
FEES_SHEET_ID                 the spreadsheet holding every tab above
ACADEMIC_YEAR                 "2026-27"
FEES_ALLOWED_EMAILS
ATTENDANCE_ALLOWED_EMAILS
FEES_PASSTHROUGH_PASSWORD
GMAIL_USER / GMAIL_APP_PASSWORD
ATTENDANCE_SUMMARY_EMAILS
CRON_SECRET                   bearer secret for the daily cron
DATABASE_URL                  Neon mirror (optional)
USE_DB_MIRROR                 default false
MIRROR_MAX_AGE_SECONDS        300
```

New variables the bot work will add (document them here and in `.env.local.example` when
you add them): `WHATSAPP_BOT_SECRET` (or reuse `CRON_SECRET`) for the new endpoint.

**Never commit real values, and never print a secret to stdout or a log.**

---

## 10. Scripts — the existing conventions

All in `scripts/`, plain `.mjs`, run with bare `node`. They load `.env.local` by hand
(there is no dotenv dependency) — see `scripts/audit-vs-sheets.mjs:10-14` for the 4-line
loader everyone copies.

| Script | What it does |
|---|---|
| `audit-parent-contacts.mjs` | **New, 2026-08-17.** Parent-phone coverage audit for the WhatsApp bot. Read-only. Prints no phone numbers. `--out <path>` writes the per-student gap list. |
| `audit-vs-sheets.mjs` | Cross-checks audit-log entries against real sheet rows |
| `backfill-admissions.mjs` | Populates the Admissions tab from fee rows |
| `repair-fee-sync.mjs`, `repair-other-fees-log.mjs` | One-off data repairs |
| `analyze-legacy-*.mjs` | Legacy-sheet forensics |

Because these scripts are plain JS and the app is TypeScript, small helpers get **mirrored**
into a script rather than imported (there is no build step for `scripts/`). When you mirror
one, cite the source file and line in a comment — `audit-parent-contacts.mjs` does this for
`parseGrNoFromNotes`, `normalizeStudentName`, and the inactive-status rule. If you change
the original, grep `scripts/` for the mirror.

---

## 11. Gotchas that have already cost someone a debugging session

- **`Attendance · 5A` uses U+00B7**, not a hyphen or an ASCII dot. Build titles with
  `attendanceSheetTitle()` (`src/lib/sheets/attendance.ts:59`), never by hand.
- **The matrix has TWO header rows**, and the *second* one holds the dates.
  `HEADER_ROWS = 2`, `DATE_START_COL = 2` (`attendance.ts:31-34`).
- **An old row-per-record log format still exists** and is parsed alongside the matrix —
  `isOldLogFormat()` / `parseOldLogRows()` (`attendance.ts:76`, `110`). Don't assume matrix.
- **The fees sheet has 3 header rows**, the admissions tab has 1, and attendance has 2. All
  three are different. Check before slicing.
- **`getAllFees()` is the roster.** No fee row means the student does not appear in
  attendance at all.
- **GR numbers live in free text**, not their own column: `notes = "GR: GR-2026-123"`, and
  `upsertGrInNotes()` (`src/lib/admission-form.ts:102`) preserves other note text like
  `STATUS: Left`. Never overwrite the Notes cell wholesale.
- **Timezone**: the server is UTC, the school is IST. Use `todayIsoInTimeZone()`.
- **`ensuredSheets`** (`attendance.ts:46`) is a module-level `Set` memo. It survives across
  requests in a warm serverless instance — fine for existence checks, wrong for anything
  that can change.

---

## 12. Where to go next

- **`docs/WHATSAPP_ATTENDANCE_BOT_PLAN.md`** — the build plan, the locked decisions, the
  open questions for RD, the phase-0 audit result, and the two-track phase list.
- `docs/ADMISSIONS.md` — the admission form and GR-number lifecycle.
- `docs/YEAR_ROLLOVER.md` — what happens at academic-year change (relevant: class labels
  shift, so any cached class→group-JID map must be revisited each June).
- `~/Developer/Galvor-task/vetting-bot/` — the working Baileys bot to port from.
