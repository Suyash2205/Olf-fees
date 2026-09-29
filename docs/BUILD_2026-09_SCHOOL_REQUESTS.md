# Build spec — school requests, 2026-09-30

Approved by RD on 2026-09-30 ("go with your suggestions for all of them"). This is the
contract for the build. Product decisions below are **locked**; anything not covered here
is an open question for RD, not a call to make silently.

The portal is live and used daily. **No data may be lost and no existing behaviour may
break.** Read `AGENTS.md` and `docs/ATTENDANCE_SYSTEM_REFERENCE.md` before starting.

---

## 0. Data-safety rules (non-negotiable)

1. **Develop and test only against the TEST spreadsheet.** `.env.local` points
   `FEES_SHEET_ID` and `STUDENTS_SHEET_ID` at the TEST copy
   (`1VUEptFDTPdybJvpjiGribCHezMDMALvmRkgc_pg7DxY`). Never put the live ID
   (`1nO5Bu6k…`) anywhere, and never run a write against it.
2. **The live workbook contains many hand-built tabs** (pivot tables, `Pending fees Table`,
   `Less than 1 quarter paid`, `Salary Calculation`, …) whose formulas reference
   `Fee details` and the log tabs. Therefore:
   - **Never insert, delete, or reorder rows or columns in any existing tab.**
   - `Fee details` has hand-made formula columns **AA–AF** (`% Fees Pending`,
     `Pending Check`, `Check`, `Q1`, `Q2`, `Q3`). The portal owns A–Z only. Never write beyond Z.
   - `Other Fees Log` has school columns **I–K** (`Online`, `Cash`, `Total`). Don't touch them.
   - A new column on an existing tab goes **only at the far right, after every existing
     header**, written only by header name.
3. **New data goes in new portal-owned tabs**, using `src/lib/sheets/keyed-tab.ts`
   (header-by-name, RAW writes, retry, cache, write lock). Don't hand-roll a new
   Sheets pattern.
4. Wrap every Sheets call in `withSheetRetry`, and every read in `cachedSheetRead`. Invalidate on write.
5. Join students by **Sr No** only (or GR via `parseGrNoFromNotes`). Never by name.
6. Filter inactive students (`getAllFees()` already does) before anything user-facing.
7. Use `todayIsoInTimeZone()` for "today" (server is UTC, school is IST).
8. **No silent fallbacks.** A failure must show a visible error in the UI, or a non-200 status
   and message from the API.
9. **The GitHub repo is PUBLIC.** Never commit student or parent names, phone numbers, emails,
   secrets, or files generated from real data.

## 1. Access (RD decision)

- **Attendance features:** teachers and admins.
- **Everything else** (fees, pending, follow-ups, receipts, Aadhaar/UDISE/height-weight,
  holiday calendar admin): **admins only** (`FEES_ALLOWED_EMAILS`).
- `src/proxy.ts` now guards every `/api/*` route:
  - `/api/attendance/*` and `/api/portal/access` need attendance access.
  - `/api/auth/*` and `/api/cron/*` authenticate themselves.
  - Everything else needs fees (admin) access.
  - New admin APIs therefore need no extra proxy work, but must still call
    `requirePortalActor` in the handler (defence in depth, and it gives you the actor for audit).
- Place pages under `src/app/(portal)/…` and add their path prefix to `FEES_PATH_PREFIXES`
  and the `matcher` in `src/proxy.ts`.

## 2. Emails (RD decision)

- **Recipients:** the same list as the 7:30 PM email, `ATTENDANCE_SUMMARY_EMAILS`. More can be added later.
- **Nothing replaces the 7:30 PM email.** New emails go at other times:
  - **Chronic-absence email:** ~4:30 PM IST, cron `0 11 * * 1-6`.
  - **Fee follow-ups due:** ~9:00 AM IST, cron `30 3 * * 1-6`.
- **Vercel Hobby rules:** cron jobs run at most once a day, and the timing is approximate
  (within the hour). Each new cron is a GET route under `/api/cron/…` with the
  `Bearer CRON_SECRET` check. Copy `isAuthorizedCron` from the existing cron route.
- **Mon–Sat schedule:** every cron now runs Monday to Saturday, and the handler decides
  whether today is a school day using the holiday calendar (§5). The existing 7:30 PM cron
  changes from `1-5` to `1-6` for the same reason.
- **Skipping:**
  - The absence email is skipped on a non-school day, or when there's nothing to report.
    The response says why.
  - The follow-up email is skipped when nothing is due.
- **Testing:** all testing sends to RD's own inbox, which is what `.env.local` is set
  to. Add `?dryRun=1` support to every new cron route. A dry run returns the rendered
  subject and text as JSON and sends nothing.

---

## 3. Stream A — Fees (admin only)

### A1. Receipt number
- Add a **"Receipt No"** field to Daily Fees Entry (`src/app/(portal)/daily-entry/DailyEntryForm.tsx`).
  - It's optional, but show it prominently.
  - It applies to school fees and to other fees.
- **Storage:**
  - `Daily Fees Log`: a new header `Receipt No` in column **I**, after `Comment` (H). Today
    H is the last header.
  - `Other Fees Log`: a new header `Receipt No` at the far right, after `Total` (column L).
    Check that `compactOtherFeesLog` and every A:H range still work. The receipt column must
    move with its row whenever a row is rewritten or compacted. If you can't guarantee that,
    stop and report it.
  - Existing rows get a blank receipt. Nothing is back-filled.
- **Display:** show the receipt number in the student's payment history, in the payment
  table on the daily entry page, and in edit.
- **Search:** add "search by receipt number". It finds the entry and shows date, student,
  amount, mode and receipt number.

### A2. Split payment (cash + online in one go)
- Today each entry is either cash or online (`src/lib/payment-mode.ts`). Add a third choice,
  **"Cash + Online"**: two amount inputs and a live total.
- **Storage:** two log rows (one `cash`, one `online`) with the same date, student, fee month
  and receipt number. Their comment is suffixed `(split: ₹X cash + ₹Y online)`.
  - Dashboards and cash/online totals keep working unchanged.
  - Payments allocate Q1→Q4 exactly as two separate payments would.
- **Atomic save:** if the second row fails, delete or undo the first and show an error.
  Never leave half a split payment saved.
- **Other fees:** the split applies to the Other Fees form too, if it shares the component.

### A3. Pending fees report
- Rework `/pending` (`src/app/(portal)/pending/PendingClient.tsx`) into a one-click report.
- **Quarter maths:** `quarterDue = splitIntoQuarters(totalFee)` (`src/lib/fees/structure.ts:155`).
  Column E `totalFee` is already after discount. Payments fill Q1→Q4 in order, so:
  - **Behind on Q1:** `totalPaid < Q1due`.
  - **Behind on Q2:** `totalPaid < Q1due + Q2due` (includes those behind on Q1).
  - Partly paid counts as pending (RD decision 1a). The shortfall is shown.
- **Filter buttons:** "Q1 pending" and "Q1 or Q2 pending" (the default, i.e. behind on Q2),
  plus "All with any balance".
- **Columns:** Class, Sr No, Student Name, quarters behind (e.g. "Q1+Q2" / "Q2"), amount due
  till the selected quarter, total balance, and last payment date if easy (from the daily log).
- **Grouping:** grouped or sorted by class (`sortByGradeThenName`), with a class filter
  (all or one class) and per-class subtotals.
- **Export:**
  - **"Download CSV"**, done client-side. Name the file with the date and filter.
  - A **print-friendly view** (CSS `@media print`) so the office can print it.
- **Pure logic:** put the pending computation in a pure module with unit tests
  (`src/lib/fees/pending-report.ts`).

### A4. Follow-up screen per student
- Clicking a student name on the pending report opens a panel or page for that student.
- **Contents:**
  - Fee summary: fee, paid, balance, quarters behind.
  - **Parent contact:** parent name, primary phone and alternate phone, each editable. Save
    them to the `Parent Contacts` tab via `upsertParentContact()`
    (`src/lib/sheets/parent-contacts.ts`, already built and tested).
    - Show where the number came from: portal or admissions.
    - Phones are `tel:` links.
    - Invalid numbers are rejected with a clear message.
  - **Call log (dated):** add an entry with date (default today IST), what the parent said
    (free text), reason for delay (free text), and next follow-up date (optional).
    - Show the history newest first.
    - Store it in a new tab **`Fee Follow-ups`** with headers:
      `Sr No | Student Name | Class | Date | Parent Said | Reason | Next Follow-up | Added By | Added At`.
      Append only, via `appendKeyedRow`.
  - The student's payment history, including receipt numbers.
- **On the pending report,** show each student's latest follow-up note and next follow-up
  date as columns.
- **"Follow-ups due" list:** at the top of `/pending`, show students whose latest next
  follow-up date is today or earlier (overdue highlighted). "Latest" means the most recent
  call-log entry for that Sr No.
- **Morning email:** new cron `GET /api/cron/fee-followups` (§2 timing). It lists follow-ups
  due today or overdue, grouped by class, with student, balance, parent phone, and the last
  note. It sends only when at least one is due.
- **Audit:** use `recordAudit` for contact edits and follow-up adds.

---

## 4. Stream B — Student records (admin only) and attendance

### B1. Student records tab
- New tab **`Student Records`**, keyed by Sr No. Headers:
  `Sr No | Student Name | Class | Height (cm) | Weight (kg) | Measured On | UDISE Status | UDISE Reason | UDISE Note | Updated At | Updated By`
- **Why not the `UDISE` tab:** `replaceAllUdiseRows` (the xlsx import) rewrites that tab
  wholesale, so edits there would be wiped by the next import. `UDISE` stays read-only reference data.

### B2. Height and weight
- **Admin page `/student-records`:** a class-by-class table with editable Height (cm), Weight
  (kg) and Measured On.
  - Saves go per row (or a batch save per class using one `values.batchUpdate`, which keeps
    the quota low).
  - Validate plausible ranges (height 50–220 cm, weight 5–150 kg). Anything outside is rejected with a message.
- **Pre-fill:** show the UDISE tab's height and weight as a hint when present. Match by the
  GR number in the UDISE row against the GR from the fee notes, never by name.

### B3. UDISE (education portal) status
- RD confirmed that "education portal" and "UDISE" are the same thing.
- **Applies to 1st Std and above only.** Pre-primary (`P.G.`, `Nursery`, `Jr. Kg.`,
  `Sr. Kg.`) is shown as "Not applicable: pre-primary".
- **Fields per student:**
  - UDISE Status: `Updated` / `Not updated`.
  - UDISE Reason, from a fixed list: `Aadhaar missing`, `Aadhaar name mismatch`,
    `Documents pending`, `Transfer/TC pending`, `Other`.
  - UDISE Note (free text).
- **Automatic hint (not a decision):** if the UDISE tab has a PEN for the student's GR number,
  show "PEN found in UDISE import" next to the status.
- **Report:** a one-click list of pending students (1st Std+, status not `Updated`), sorted by
  class, filterable by reason, with CSV export.

### B4. Aadhaar pending list
- **One-click report:** active students whose Admissions `Aadhar` is blank, reached through the
  GR chain.
  - Also listed: students with no admission row. Say so explicitly.
  - If the UDISE row for their GR has an Aadhaar number, show "Aadhaar present in UDISE
    import" so staff know it only needs copying.
- **Columns:** Class, Sr No, Name, GR No, status note.
- **Sorting and export:** sorted by class, with CSV export.
- **Location:** the Aadhaar list and the UDISE list are tabs on the same `/student-records`
  area (or `/reports`, your choice, but keep it one sidebar entry, **"Student Records"**).

### B5. Holiday calendar
- New tab **`School Calendar`**. Headers:
  `Date | Type | Classes | Title | Added By | Added At`
  - `Type` is `Holiday` or `Working day`.
  - `Classes` is `All`, or a comma list of canonical class labels.
- **Default rule:** Mon–Fri are school days, Sat and Sun are not (RD: Saturdays off by
  default). A calendar entry overrides the default for its classes. When entries conflict,
  a class-specific entry beats an `All` entry.
- **Pure module** `src/lib/attendance/school-calendar.ts`:
  - `isSchoolDay(dateIso, className, entries)`
  - `schoolDaysBetween(...)`
  - `lastNSchoolDays(className, endIso, n, entries)`
  - All exhaustively unit-tested: weekend, holiday, working Saturday, class-specific overrides.
- **Admin page `/school-calendar`:** month view or simple list. Add a holiday or working day
  (date or date range, classes, title) and delete an entry.
  - Deleting is a real row deletion **in this portal-owned tab only**, using
    `deleteDimension` on that tab's sheetId.
  - Or mark the entry `Type=Cancelled` instead. Your choice, but explain it.
- **Teachers are blocked from marking on a non-school day:**
  - `POST /api/attendance/record` rejects with a clear message ("<date> is a holiday for
    <class>: <title>").
  - The record page shows the same banner and disables saving.
  - Past data already marked on holidays is left untouched in the sheet, but ignored in all
    percentages and absence counts.
- **The existing 7:30 PM email** (`src/app/api/cron/attendance-daily-summary/route.ts`):
  - Replace the weekday gate with the calendar. If today is not a school day for **any**
    class, skip with reason `not a school day`.
  - Classes whose day is a holiday are not listed as "unmarked".
  - Change `vercel.json` to `0 14 * * 1-6`.
  - Keep everything else about that email identical.

### B6. Chronic-absence email
- **Pure module** `src/lib/attendance/chronic-absence.ts`, unit-tested.
- **Window:** for each active student, the last **10 school days** of their class, up to and
  including today, on which **their class was marked**.
  - Days the class wasn't marked are skipped (unknown, not absent).
  - Holidays and non-school days are excluded.
- **Flag a student if:**
  - their **3 most recent** marked school days are all absent ("3 days in a row"), or
  - they were absent on **≥ 4 of the (up to) 10** marked school days (≥ 40%).
- **Section at the top:** "Absent every day in the window". These are students absent on all
  marked days, where the window has at least 5 marked days.
- **Email content:**
  - Grouped by class, in class order.
  - Per student: name, Sr No, the reason ("3 days in a row", "5 of last 10 school days"),
    last present date, parent name, and parent phone(s) as `tel:` links.
  - Phones come from `getResolvedParentContacts()`. If there's no number, show
    "No number on file".
  - A header summary: count per class.
- **Cron route** `GET /api/cron/attendance-absence-alert`:
  - Schedule `0 11 * * 1-6`, with `?dryRun=1`.
  - Skipped on a non-school day. If nobody is flagged, no email is sent and the JSON response says so.
- **In-app view:** also show the same list on the attendance dashboard. It's teacher-visible,
  but **without phone numbers**: teachers don't get parent phones (admin only).

---

## 5. Testing bar (both streams)

- **Unit tests (vitest, `npm test`)** for every pure module: pending maths, split payment
  building, receipt search, calendar, chronic absence, and email text builders. Include edge
  cases: zero fee, full discount, overpaid, class with no marks, and a student with duplicate name.
- **`npm run typecheck` and `npm run lint`** must be clean for the files you touched.
- **Integration against the TEST sheet:** write a script in
  `scripts/verify-<stream>.mjs`, or use `npx tsx`, that:
  - exercises the real sheet read/write helpers on the TEST spreadsheet (appends a follow-up,
    upserts a contact, adds a calendar entry, reads them back);
  - asserts that the header rows and row counts of `Fee details`, `Daily Fees Log`,
    `Other Fees Log` and `Admissions` are unchanged, except for the intended new header
    cells (Receipt No);
  - cleans up rows it created in portal-owned tabs.
- **Don't run `next build` or `next dev` yourself.** The lead runs builds and the browser
  test serially, because the machine has only 8 GB of RAM. Use `npm run typecheck`,
  `npm test`, and `npx tsx` scripts.
- **Before any heavy command,** run `~/.claude/scripts/ramcheck.sh`. If the result is
  `throttle` or `stop`, pause.

## 6. Open (do NOT build)

- APAAR ID tracking: RD will decide later.
- Changing the admin password: RD will decide.
- WhatsApp bot: separate project (`docs/WHATSAPP_ATTENDANCE_BOT_PLAN.md`).
