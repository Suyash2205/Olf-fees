# WhatsApp Attendance Bot — Build Plan & Handover

**Status:** approved in principle, nothing built yet.
**Date:** 2026-08-17
**Owner:** RD (Suyash) — all product decisions are RD's, not the agent's.
**Host repo:** `~/Olf-fees` (this repo)
**Reference implementation:** `~/Developer/Galvor-task/vetting-bot` (a live Baileys WhatsApp bot, in production since 2026-08-06)

---

## 0. READ THIS FIRST (for the agent picking this up in a new session)

This document is **self-contained** — it carries everything decided in the planning
conversation, so you do not need that chat. But you **must** read the following files
before writing any code. Do not skim, and do not assume you know what they do.

### In this repo (`~/Olf-fees`) — required reading, in this order

| # | File | Why you must read it |
|---|---|---|
| 1 | `src/lib/attendance/daily-summary.ts` | **The single most important file.** The existing 7:30 PM email summary. `buildDailyAttendanceSummary()` already produces per-class present/absent counts, the unmarked-class list, and the weekend gate. The WhatsApp bot reuses this almost verbatim. Do not rewrite it. |
| 2 | `src/app/api/cron/attendance-daily-summary/route.ts` | The existing cron endpoint. Shows the exact `CRON_SECRET` bearer-auth pattern (lines 17–22) and the weekend skip (lines 29–31) you will copy for the new WhatsApp endpoint. |
| 3 | `src/lib/attendance/types.ts` | `AttendanceRow`, `AttendanceStatus`. Note carefully: **there is no phone number and no GR number on an attendance row.** Only `srNo`, `studentName`, `className`, `status`. This is the whole reason section 4 exists. |
| 4 | `src/lib/sheets/attendance.ts` | How attendance is actually stored — a **matrix** tab per class (`Attendance · 5A`), name down the rows, dates across the columns. `readAllAttendanceRows()` (line 486) and `getClassesMarkedForDate()` (line 502) are what you'll call. Both are cached 20s via `cachedSheetRead`. |
| 5 | `src/lib/sheets/admissions.ts` | Where parent phone numbers live today: `Father Contact`, `Mother Contact`, `Student Contact` in `ADMISSION_HEADERS` (lines 19–65). Keyed by `Gr No`. |
| 6 | `src/lib/admission-form.ts` (lines 96–99) | `parseGrNoFromNotes()` — the fees→admissions bridge. GR numbers are stored **inside a free-text Notes cell** as `GR: GR-2026-123`. Read the regex; it explains why legacy rows break. |
| 7 | `src/lib/attendance/students.ts` | Where the class roster comes from — it's derived from the **fees sheet** (`getAllFees()`), not from a students table. `srNo` is the identity. |
| 8 | `src/lib/fees/structure.ts` | `CLASS_OPTIONS`, `canonicalClassLabel()`, `resolveClass()`. Every class name must go through `canonicalClassLabel` or joins will silently miss. |
| 9 | `src/lib/sheets/read-cache.ts` + `src/lib/sheets/retry.ts` | `cachedSheetRead()` and `withSheetRetry()`. **Use them.** This repo has already had two Sheets quota outages — see `git log` for `fix/fees-sheets-rate-limit` and `fix/attendance-sheets-rate-limit`. |
| 10 | `vercel.json` | The one existing cron entry. Vercel Hobby allows limited cron; the bot will pull rather than be pushed, so you probably won't add one here. |
| 11 | `CLAUDE.md` + `AGENTS.md` (repo root) | Project working rules. |

### In the reference bot (`~/Developer/Galvor-task/vetting-bot`) — required reading

| File | What to take from it |
|---|---|
| `README.md` | Read all of it. Explains Baileys, the dedicated-SIM rule, the QR flow, the `auth/` folder as a credential, the systemd deploy, and the "never run two bots on one session" trap. |
| `bot.js` lines 245–300 | The proven Baileys setup: `useMultiFileAuthState` (245), `makeWASocket` (246), `creds.update` → `saveCreds` (248), `connection.update` reconnect handling and the `DisconnectReason.loggedOut` branch (250–276). **Copy this shape.** |
| `bot.js` lines 320–365 | The `send()` wrapper (325) and the `!id` / `!ping` commands (358, 362). `!id` is how you discover a group's JID — you will need it for every class group. |
| `bot.js` line 31 + dedup logic | `processed.json` — the crash-safe "already handled" ledger. Our `ledger.json` is the same idea keyed by `(date, class)`. |
| `~/Developer/Galvor-task/CLAUDE.md` | Rule #2, **"no silent fallbacks"**, applies to this build. Every failure must become a visible staff message. |

**Do NOT copy from vetting-bot:** the Gemini pipeline, `vet/`, ffmpeg/media handling, the
FIFO worker queue, `media.js`. None of it applies. This bot has **no AI in it at all.**

---

## 1. What we are building, in one paragraph

Teachers already mark attendance in the portal; it lands in per-class matrix tabs on the
fees spreadsheet. A small always-on Node process holds a WhatsApp session on a dedicated
SIM. Once a day at a fixed time it reads that day's attendance, posts a **counts-only
summary to each grade's WhatsApp group**, and sends a **private message to the parents of
absent students only**. Nothing else. No AI, no paid API, no paid server.

---

## 2. Decisions — LOCKED (do not re-open, do not "improve")

These were decided by RD in the planning conversation on 2026-08-17.

| ID | Decision | Rationale |
|---|---|---|
| **D1** | **Hybrid: grade-group summary + absent-only private DMs.** | Group posts are ~10 msgs/day (safe). Absent-only DMs are ~20–30/day (safe). Messaging all 300 parents daily is the exact pattern WhatsApp bans unofficial clients for, and the official paid API would cost ~₹760/mo. |
| **D2** | **Present students' parents get no private message.** | "Your child was present" is not actionable. The group post already confirms the class was marked. |
| **D3** | **Phone numbers get linked to students in the data layer** — a dedicated mapping, not a fragile name match. | RD's explicit instruction. See section 4 for the exact shape. |
| **D4** | **Group message is counts-only — no student names.** | Naming an absent child in front of every parent in the class is a privacy problem. Names appear only in the DM to that child's own parents. |
| **D5** | **No LLM anywhere in this bot.** | An attendance message is a template with numbers slotted in. Gemini is removed entirely — this is the single biggest cost saving. |
| **D6** | **Baileys (unofficial WhatsApp Web), not Meta Cloud API.** | Free, and it's the only option that can post to **groups** at all — Cloud API cannot post to WhatsApp groups, full stop. |
| **D7** | **Dedicated prepaid SIM. Never a personal number.** | Ban risk on Baileys is real; see vetting-bot README. |

## 2b. Decisions still OPEN — ask RD, do not decide these yourself

| ID | Question | Suggested default (needs RD's yes) |
|---|---|---|
| **O1** | ~~What time does it send?~~ **DECIDED 2026-08-17 (RD): 2:00 PM IST, weekdays.** One-line config. ⚠️ **Still to confirm with the school: their real marking deadline must be before 2:00 PM** — otherwise classes not yet marked at 2 PM are falsely reported as unmarked and their parents get no DM. | ✅ 2:00 PM chosen. |
| **O2** | ~~Do per-class parent WhatsApp groups already exist?~~ **DECIDED 2026-08-17 (RD): Yes, they exist.** → Track A is buildable. Collect each group's JID via `!id` during setup. | ✅ groups exist. |
| **O3** | Which parent numbers get the DM — father, mother, or both? | Both, when both exist and differ. Fall back to whichever exists. Log students with none. |
| **O4** | Where does the school-holiday list live? | A `Holidays` tab on the fees sheet (one ISO date per row). Needed so the bot doesn't message parents on a holiday when nothing was marked. |
| **O5** | Should the office enter phone numbers via a small admin screen, or directly in the sheet? | An admin screen under `src/app/(portal)/admin/` is safer (validation, no accidental column shifts) but is extra build. Sheet-direct is free and immediate. |
| **O6** | What happens if a teacher edits attendance *after* the send? | v1: nothing — known limitation, tell the teachers. Do not build a diff-and-resend without RD's sign-off. |

---

## 3. Cost model (this is why the plan looks the way it does)

| Piece | Cost | Note |
|---|---|---|
| AI / Gemini | **₹0** | Deleted. Not needed. |
| Always-on server | **₹0** | **Oracle Cloud Always Free** ARM VM, Mumbai region — permanently free, not a trial. Replaces the paid GCP e2-small (~₹1,100/mo) that vetting-bot runs on. |
| WhatsApp sending | **₹0** | Baileys. |
| Google Sheets API | **₹0** | Free at our volume; the bot adds ~1 read/day. |
| Vercel | **₹0** | Hobby, unchanged. |
| **Dedicated SIM** | **~₹150–200/mo** | The only real recurring cost. |
| **Total** | **~₹200/mo, software ₹0** | |

**Rejected hosts and why:** Render / Railway free tiers sleep idle processes, which
destroys the WhatsApp session and forces a QR re-scan. Vercel cannot host this at all —
Baileys needs a long-lived process and a writable session directory. Do not try.

**The one thing that would break ₹0:** if the school later demands a private daily message
for *every* child, that's Meta Cloud API at ~₹0.115/message ≈ ₹760/mo for 300 students,
plus 1–2 weeks of Meta business verification and template approval. Escalate to RD; do not
absorb that decision.

---

## 4. The data problem — solve this FIRST

**An attendance row has no phone number.** Today the only path from "who was absent" to
"which number to message" is a three-hop join, and two hops are fragile:

```
Attendance · 5A  (matrix tab)     →  srNo, studentName, className, status
        │
        ▼  join on srNo
Fees tab (getAllFees)             →  fee row; GR number buried in the free-text Notes cell
        │                            as "GR: GR-2026-123"  → parseGrNoFromNotes()
        ▼  join on GR number
Admissions tab                    →  Father Contact / Mother Contact
```

**Known breakages, already visible in this repo's git history:**

- `c90ed1b Fix GR number parsing for legacy fee-note formats` — legacy rows have missing or
  malformed GR notes. Those students have **no route to a phone number.**
- `0b89df8 Fix re-admitted duplicate-name students being hidden from fees` — duplicate
  student names exist, so **name-based matching is not a safe fallback.** Never use it.

### The fix (D3): a `Parent Contacts` tab as the authority

Add one tab on the fees spreadsheet:

| Sr No | Student Name (display only) | Class | Phone 1 | Phone 2 | Notes |
|---|---|---|---|---|---|
| 142 | Aarav Sharma | 5A | 9876543210 | 9123456780 | father / mother |

- **`Sr No` is the key** — it is the same identity the attendance matrix and the fees sheet
  already use (`src/lib/attendance/types.ts`, `src/lib/sheets/fees.ts:29`). This makes the
  join **one hop instead of three**, and removes both fragile links above.
- The admissions join stays as a **seeding source**, not a runtime dependency: a one-off
  script pre-fills the tab from `Father Contact` / `Mother Contact` where the GR chain
  resolves, and the office fills the rest by hand.
- Runtime lookup reads only this tab. If a student is missing here, they get **no DM** and
  they appear in the staff delivery report. Never guess a number.

### Phase 0 audit — DONE, 2026-08-17. Result below.

Script: `scripts/audit-parent-contacts.mjs` (read-only, prints no phone numbers).
Re-run anytime: `node scripts/audit-parent-contacts.mjs --out /tmp/gaps.csv`

```
ACTIVE STUDENTS:                        556
GR number in fee notes:                 556  (100%)
Matched an admission row:               556  (100%)
Students with >=1 usable parent mobile: 123  (22.1%)   ← the blocker
  both father + mother:                 107
  exactly one parent:                    16
  no number recorded at all:            433
  malformed (not a valid 10-digit):       2
```

**Two findings, and they point in opposite directions.**

1. **The join chain is perfect — the feared problem does not exist.** 556 of 556 active
   students carry a well-formed `GR:` note that matches an Admissions row. Zero missing,
   zero unmatched, zero ambiguous duplicate names. The backfill work already in this repo
   (`scripts/backfill-admissions.mjs`, commit `c90ed1b`) evidently did its job. **A name
   fallback would recover exactly 0 students** — so don't build one.
2. **The data itself is mostly empty.** Only 139 of 670 admission rows have any contact
   filled in at all. This is a data-entry gap at the school, not a code problem. No amount
   of engineering fixes it.

Coverage is concentrated in the recently-admitted classes — Nursery 82.6%, P.G. 100%,
Jr. Kg. 47.1%, 1st Std 45.3% — and collapses in the older classes (3rd 7.7%, 7th 7.9%,
8th 9.4%, 10th 10%), which came in through the legacy import. Anyone admitted through the
current admission form has a number; anyone imported from the old sheets does not.

**Consequence for the build — this reorders the phases:**

- The **grade-group summary needs no phone numbers at all.** It can ship immediately and
  covers 100% of students from day one. **Build this first.**
- The **absent-only DM half is blocked on data collection**, not on code. At 22% coverage,
  launching it would mean ~4 in 5 parents silently never hear anything while believing
  they're covered — worse than not having the feature.
- The `Parent Contacts` tab (D3) is still the right structure, but its real job is now
  **collection**, not repair. Seed it with the 123 known students and hand the office a
  worklist of the other 433.

**Open question for RD (O7):** how does the school collect 433 parent numbers? Realistic
options — send a form home via the existing class groups; collect at the next fee payment;
or have teachers fill their own class list. This is a school-operations task with a real
calendar cost, and it gates the DM feature entirely.

The per-student gap list (names + class + fee-sheet row + reason, **no phone numbers**) is
written by the `--out` flag. It contains student names, so keep it out of git.

---

## 5. Architecture

```
┌───────────────────────────────────────────────────────────┐
│ Olf-fees on Vercel  (this repo — unchanged behaviour)     │
│                                                           │
│  Google Sheets (fees spreadsheet)                         │
│    ├─ Attendance · <class>   matrix tabs                  │
│    ├─ Admissions             parent contacts (seed only)  │
│    └─ Parent Contacts        NEW — Sr No → phone (D3)     │
│                                                           │
│  NEW  GET /api/whatsapp/daily-attendance?date=YYYY-MM-DD  │
│       Bearer CRON_SECRET (same pattern as existing cron)  │
│       returns: { date, classes[{name,present,absent,total,│
│                  rate}], absentees[{name,class,phones[]}],│
│                  unmarkedClasses[], noneMarked }          │
│       READ-ONLY. Never writes.                            │
└──────────────────────────┬────────────────────────────────┘
                           │  one HTTPS call per day
┌──────────────────────────▼────────────────────────────────┐
│ olf-attendance-bot   (Oracle free VM, systemd, always on) │
│                                                           │
│  node-cron   <time from O1> IST, weekdays                 │
│      ├─ weekend? holiday? → stop                          │
│      ├─ ledger says already sent for this date? → stop     │
│      ├─ fetch summary (retry 3× backoff; on fail → alert)  │
│      ├─ build messages   ← pure functions, unit-tested     │
│      ├─ post counts to each grade group                    │
│      ├─ DM parents of absentees only, throttled + jittered │
│      ├─ write ledger entry per (date, class)               │
│      └─ post delivery report to STAFF group                │
│                                                           │
│  auth/         WhatsApp session — CREDENTIAL, gitignored   │
│  ledger.json   idempotency, survives restart               │
│  groups.json   class → group JID map (built via !id)       │
└───────────────────────────────────────────────────────────┘
```

**Why the bot pulls instead of Vercel pushing:** the bot owns the schedule, retries, and
the ledger in one place; Vercel Hobby cron is limited; and a push would need the bot to
expose an inbound endpoint. Pull is simpler and strictly safer.

---

## 6. Message templates (exact wording — D4 governs)

**Grade group — counts only, no names:**

```
🏫 Our Lady of Fatima — Attendance
Monday, 18 August 2026 · Class 5A

Present: 28 of 31 (90.3%)
Absent: 3

If your child is marked wrong, please contact the class teacher.
```

**Private DM — absentees only, one per parent number:**

```
Our Lady of Fatima — 18 August 2026

Aarav Sharma (Class 5A) was marked *absent* today.

If this is incorrect, please contact the class teacher.
```

**Staff group delivery report — always sent, even on a clean run:**

```
Attendance bot · 18 Aug 2026
Groups: 9 sent, 0 failed
DMs: 24 sent, 2 failed, 3 students had no number on file
Not marked: Class 3B, Class 7A — nothing sent to those groups
```

Nuance to get right: singular vs plural ("Absent: 1" / "1 student"), the 100%-present case
(say "All present" rather than "Absent: 0"), and never emit a percentage for an unmarked
class.

---

## 7. Behaviours that must be right

Each row is a test case, not a nice-to-have.

| Situation | Required behaviour |
|---|---|
| A class was never marked today | **Send nothing to that class group. Send no DMs for it.** Silence is correct — a "0 absent" message would be a lie. Report it to the staff group. |
| Nothing marked at all | Zero parent messages. One staff alert. |
| Saturday / Sunday | Skip. Reuse `isWeekdayInTimeZone()` from `src/lib/attendance/daily-summary.ts:34`. |
| School holiday | Skip (needs O4). |
| Bot restarts minutes after sending | `ledger.json` prevents a double-send. **Parents must never receive the same message twice.** |
| Sheets read fails | `withSheetRetry` 3× with backoff, then **alert staff and send nothing.** No partial sends. No silent skip. (`Galvor-task/CLAUDE.md` rule #2.) |
| A phone number is invalid / not on WhatsApp | Log, count it in the staff report, continue with everyone else. Never abort the run. |
| A student has no number on file | No DM, counted in the staff report. Never guess by name. |
| Attendance edited after the send | v1 does nothing (O6). Document it for teachers. |
| Two bots running on one session | Corrupts the session. The vetting-bot README warns about this explicitly — never run locally against the VM's `auth/`. |

---

## 8. Build phases

**Reordered after the phase-0 result (section 4): the group track ships first and alone.
The DM track is blocked on the school collecting phone numbers, not on code.**

### Track A — grade-group summaries (unblocked, 100% student coverage, build now)

| Phase | Work | Files | Est. |
|---|---|---|---|
| **0** | ~~Phone-coverage audit~~ **DONE 2026-08-17** — 22.1%. See section 4. | `scripts/audit-parent-contacts.mjs` | ✅ |
| **A1** | The API endpoint — counts per class, no phone numbers involved | `src/app/api/whatsapp/daily-attendance/route.ts` — copy the auth pattern from `src/app/api/cron/attendance-daily-summary/route.ts:17` | 3h |
| **A2** | Message builders as **pure functions** + unit tests + a `--dry-run` CLI that prints exactly what would be sent | new repo `olf-attendance-bot/messages.js`, `messages.test.js` | 4h |
| **A3** | Baileys bot: socket, cron, ledger, throttle, `!id`/`!ping`/`!test`, staff report | `olf-attendance-bot/bot.js` — port from `vetting-bot/bot.js:245–365` | 5h |
| **A4** | Deploy: Oracle free VM, systemd unit, one-time QR scan | systemd recipe in `vetting-bot/README.md` | 3h |
| **A5** | **One week shadow-running in production** — real data, output to logs + staff group only, **nothing sent to parents** | — | 5 days |
| **A6** | Go live: one class first, then all classes, on RD's sign-off | — | 1h |

Track A is gated only by **O2** (do the grade groups exist on WhatsApp?).

### Track B — absent-only parent DMs (blocked on data collection)

| Phase | Work | Files | Est. | Blocked by |
|---|---|---|---|---|
| **B1** | `Parent Contacts` tab + reader + seed the 123 known students from Admissions + emit the 433-student worklist for the office | `src/lib/sheets/parent-contacts.ts`, `scripts/seed-parent-contacts.mjs` | 4h | — (can start now) |
| **B2** | *School collects the missing numbers* | — | weeks, school-side | **O7** |
| **B3** | Extend the endpoint with per-absentee phone resolution | `src/app/api/whatsapp/daily-attendance/route.ts` | 2h | B2 |
| **B4** | DM sending: throttle + jitter, per-number failure handling, staff report counts | `olf-attendance-bot/bot.js` | 4h | B3 |
| **B5** | Shadow week, then phased go-live | — | 5 days | RD sign-off |

**Do not ship B4 below ~90% coverage without RD's explicit decision.** At 22%, four in five
parents would silently receive nothing while the school believes the system covers them —
that is worse than having no feature.

**Phase 6 is not padding.** A wrong attendance message to 300 parents cannot be retracted.
A shadow week is the cheapest possible insurance and must not be cut without RD's explicit
sign-off (repo rule: scope cuts need sign-off and must be recorded).

---

## 9. Testing

This repo's rule: **TDD on deterministic code, and it does not get cut.** All of the below
is deterministic — there is no LLM to eval.

- **Message builders** — golden tests. Fixed summary in, exact string out. Cover: normal
  case, all-present, exactly one absentee (singular), unmarked class (must produce nothing).
- **Sr No → phone lookup** — fixtures for: clean match, missing row, malformed number,
  duplicate student names, student with no number at all.
- **Weekend / holiday / already-sent gates** — each is a branch that must be provably closed.
- **Ledger idempotency** — simulate a crash mid-send, re-run, assert zero duplicate sends.
- **The Baileys socket is the mock boundary.** No live WhatsApp in tests — same principle as
  `vetting-bot/vet/test_vet_video.py`, where the network is the mock boundary.
- Add a `DRY_RUN=1` env flag that logs instead of sends. Phase 6 runs on it.

---

## 10. Risks

| Risk | Severity | Mitigation |
|---|---|---|
| WhatsApp bans the bot number | **High** | Dedicated SIM (D7). Groups over DMs. Absent-only keeps DMs at ~25/day. Throttle + random jitter between sends. Never cold-DM a number that hasn't been seeded/consented. Accept that Baileys is unofficial — if the school ever needs a contractual guarantee, that's Cloud API and it costs money. |
| Session logs out → QR re-scan needed | Medium | Keep the bot SIM in a phone the office holds. Alert on `DisconnectReason.loggedOut` (see `vetting-bot/bot.js:265`). Document the 5-minute re-scan. |
| Parent phone coverage is poor | Medium | Phase 0 answers this before anything is promised to the school. |
| Wrong message reaches parents | **High** | Phase 6 shadow week, per-class rollout, ledger. |
| Sheets quota outage | Medium | Use `cachedSheetRead` + `withSheetRetry`. This repo has been bitten twice already — check `git log` for the two rate-limit fix branches. |
| Oracle reclaims an idle free VM | Low | Their reclaim targets consistently-idle instances; a live socket + daily cron is not idle. Keep the deploy scripted so a rebuild is 20 minutes. |
| Teachers mark late, after the send | Medium | Set the send time after the school's real marking deadline (O1). Surface late-marked classes in the staff report. |

---

## 11. Working rules for whoever builds this

From `~/Olf-fees/CLAUDE.md` and `~/Developer/Galvor-task/CLAUDE.md`:

1. **Claude finds data and suggests. RD decides.** Anything in section 2b is RD's call. If
   you discover a new implicit decision mid-build (a threshold, a default, a message
   wording), surface it as an open question — do not bake it in quietly.
2. **No silent fallbacks.** Every failure becomes a visible staff message.
3. **Scope cuts need explicit sign-off** and get recorded here.
4. **Verify external facts before asserting them** — Oracle free-tier terms, Meta Cloud API
   India pricing, and WhatsApp rate limits should all be re-checked against primary sources
   at build time. The figures in this doc are from 2026-08-17 and are planning-grade.
5. Speak to RD in project-management language, not deep technical jargon — cover both the
   user-facing behaviour and the implementation.

---

## 12. First actions in a new session

1. Read every file in section 0.
2. Ask RD the open questions in 2b — at minimum **O1 (send time)** and **O2 (do the grade
   groups exist?)**, since O2 decides whether the group half is buildable at all.
3. Run phase 0 (the audit). Report the coverage % to RD before writing feature code.
4. Then start phase 1.
