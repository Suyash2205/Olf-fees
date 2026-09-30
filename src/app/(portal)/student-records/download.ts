/** Client-side CSV download (UTF-8 with BOM so Excel reads names correctly). */
export function downloadCsv(filename: string, csv: string): void {
  const blob = new Blob(["﻿", csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function csvFilename(base: string, ...parts: string[]): string {
  const date = new Date().toISOString().slice(0, 10);
  const suffix = parts
    .filter(Boolean)
    .map((p) => p.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""))
    .join("_");
  return `${base}_${date}${suffix ? `_${suffix}` : ""}.csv`;
}
