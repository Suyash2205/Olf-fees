import { NextResponse } from "next/server";
import { getAllUdise } from "@/lib/sheets/udise";

export async function GET() {
  try {
    const rows = await getAllUdise();
    return NextResponse.json(rows);
  } catch (err) {
    console.error("udise GET error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}
