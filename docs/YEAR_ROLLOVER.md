# Academic year rollover (2026–27)

## Sheet in use

| Item | Value |
|------|--------|
| Spreadsheet | [Fees Update 2026-27](https://docs.google.com/spreadsheets/d/1nO5Bu6kfR2PByldEE5KvjuPal-gzmpdSMD-g8Z1IlEo/edit) |
| Sheet ID | `1nO5Bu6kfR2PByldEE5KvjuPal-gzmpdSMD-g8Z1IlEo` |
| Portal tab | `Fee details` (486 students as of check) |
| Old sheet (archive) | `1UPOAYn9uUilTwbf5pPChFjvbmJlCgKN1PDGLAcKqevs` |

The portal reads/writes **`Fee details`** only. Column layout matches the existing app (`Fees decided` = E, payments Jun–May, Q totals, etc.).

## Done

- [x] New sheet shared with service account (API access works)
- [x] `FEES_SHEET_ID` in `.env.local` pointed to the new spreadsheet
- [x] Dashboard label set to 2026–27

## Your next steps (manual / school)

1. **Restart the dev server** after `.env.local` change: `npm run dev`
2. **Confirm in the portal**: Dashboard, Fees, Daily Fees Entry should show the same students as the new sheet (~486 rows).
3. **Keep the old fees workbook** as read-only archive for 2025–26 history.

## Still to do (promotion + new fees)

The new sheet is currently a **copy of 2025–26 data** (same names, classes, and per-student fee amounts). It is **not** yet promoted or repriced for 2026–27.

| Task | What to do |
|------|------------|
| Promote classes | Bump each active student one standard (PG→Nursery, …, 9th→10th). |
| Pass out 10th | Students finishing 10th: set name to `Name (Pass out)` and do **not** promote to 11th. |
| Reset payments | Clear monthly columns (Jun–May), Q1–Q4 totals, Total Paid; set balance = new annual fee. |
| Set 2026–27 tuition | Column **E (Fees decided)** from the fee structure slips (e.g. 1st/2nd = ₹25,600, 3rd/4th = ₹23,500, …). |
| New admissions only | Admission, form, uniforms, books are on the printed slips; add manually if needed (portal only tracks column E total). |

### 2026–27 annual tuition (column E) by class

| Class | Annual fee (₹) |
|-------|----------------|
| P.G., Nursery, Jr. Kg., Sr. Kg. | 23,000 |
| 1st Std, 2nd Std | 25,600 |
| 3rd Std, 4th Std | 23,500 |
| 5th Std, 6th Std | 25,400 |
| 7th Std | 25,400 |
| 8th Std | 28,400 |
| 9th Std | 31,200 |
| 10th Std | 37,800 |

## Portal: promote / demote (Students page)

On **Students**, use the yellow **Class promotion** panel:

- **Promote all** — every student moves up one standard; **10th Std → Pass out** (name gets ` (Pass out)`, class `Pass out`)
- **Demote all** — reverse one step; **Pass out → 10th Std**; **P.G.** cannot go lower (skipped)
- **Per row** — ↑ promote / ↓ demote on each student
- **Fees** — column E is always set to 2026–27 tuition for the new class (10th → Pass out keeps existing fee)

Payment columns are **not** cleared by promote/demote — only name, class, and optionally fees.

## Students sheet

`STUDENTS_SHEET_ID` is still the separate workbook. New students added in the portal write to both sheets. After promotion, either update that sheet manually or run a sync from `Fee details`.
