import { readFileSync, writeFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { spawnSync } from "child_process";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
for (const line of readFileSync(resolve(root, ".env.local"), "utf8").split("\n")) {
  const m = line.match(/^([^#=]+)=(.*)$/);
  if (m) process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, "");
}

const xlsxPath =
  process.argv[2] ||
  "/Users/suyash/Downloads/27210700578_Students_Details 2025-26 (5).xlsx";

const py = spawnSync("python3", [resolve(root, "scripts/parse-udise-xlsx.py"), xlsxPath], {
  encoding: "utf8",
});
if (py.status !== 0) {
  console.error(py.stderr || py.stdout);
  process.exit(1);
}

const rawRows = JSON.parse(py.stdout);
const { udiseFromXlsxRow, replaceAllUdiseRows } = await import("../src/lib/sheets/udise.ts");

const records = rawRows
  .map((cells) => udiseFromXlsxRow(cells))
  .filter((r) => r != null);

console.log(`Importing ${records.length} UDISE rows from ${xlsxPath}…`);
const count = await replaceAllUdiseRows(records);
console.log(`Done: wrote ${count} rows to UDISE tab.`);
