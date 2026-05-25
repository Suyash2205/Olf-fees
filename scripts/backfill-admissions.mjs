/**
 * Create Admissions rows for all fee-sheet students missing a profile.
 * Usage: node scripts/backfill-admissions.mjs
 */
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
for (const line of readFileSync(resolve(root, ".env.local"), "utf8").split("\n")) {
  const m = line.match(/^([^#=]+)=(.*)$/);
  if (m) process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, "");
}

process.env.NODE_OPTIONS = "--experimental-vm-modules";
const { backfillAdmissionsFromFees } = await import(
  "../src/lib/sheets/admission-backfill.ts"
);

const result = await backfillAdmissionsFromFees();
console.log(JSON.stringify(result, null, 2));
