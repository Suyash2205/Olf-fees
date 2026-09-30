/**
 * Integration checks against the TEST spreadsheet only (never the live one).
 * Run: npx vitest run --config vitest.integration.config.ts
 * Env is loaded from .env.local BEFORE any app module reads FEES_SHEET_ID.
 */
import { defineConfig } from "vitest/config";
import { readFileSync } from "node:fs";
import path from "node:path";

const TEST_SHEET_ID = "1VUEptFDTPdybJvpjiGribCHezMDMALvmRkgc_pg7DxY";

const env: Record<string, string> = {};
for (const line of readFileSync(path.resolve(__dirname, ".env.local"), "utf8").split("\n")) {
  const m = line.match(/^([^#=]+)=(.*)$/);
  if (m) env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, "");
}
if (env.FEES_SHEET_ID !== TEST_SHEET_ID) {
  throw new Error("Refusing to run: FEES_SHEET_ID is not the TEST spreadsheet.");
}

export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
  test: {
    include: ["scripts/verify-fees-stream.ts"],
    environment: "node",
    env,
    testTimeout: 2_400_000,
    hookTimeout: 2_400_000,
    fileParallelism: false,
  },
});
