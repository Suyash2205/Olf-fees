# Admissions (Option A — Google Sheets)

## Where data is stored

| Data | Spreadsheet | Tab |
|------|-------------|-----|
| Full admission form | Fees workbook (`FEES_SHEET_ID`) | **Admissions** (created automatically) |
| Fees & payments | Same fees workbook | **Fee details** |
| Legacy name list | Students workbook (`STUDENTS_SHEET_ID`) | Correct Student name |

## Portal pages

- **`/admissions`** — list all students from Admissions tab
- **`/admissions/new`** — full admission form (replaces quick add)
- **`/admissions/[grNo]`** — student profile + fee summary

## On save

1. Row appended to **Admissions** with all form fields + auto **Gr No** (`GR-2026-0001`, …)
2. Row appended to **Fee details** (name, class, annual fee, discount)
3. Short row on **Correct Student name** (backward compatible)

Fees are linked to the profile by **full name** (must match between sheets).

## Gr No

Unique ID per student. Shown on list and profile; use for URLs (`/admissions/GR-2026-0001`).

## Photo

Paste a **Google Drive share link** in Photo URL (no upload in portal yet).
