import { NextRequest, NextResponse } from "next/server";
import { searchByReceipt } from "@/lib/fees/receipt";
import { isPortalActor, requirePortalActor } from "@/lib/portal-auth";
import { getAllDailyEntries } from "@/lib/sheets/dailyLog";
import { getAllOtherFeeEntries } from "@/lib/sheets/otherFeesLog";
import { cachedSheetRead } from "@/lib/sheets/read-cache";

export interface ReceiptHit {
  kind: "school" | "other";
  id: string;
  date: string;
  studentName: string;
  className: string;
  srNo: string;
  feeType: string;
  amount: number;
  paymentMode: string;
  receiptNo: string;
}

/** GET ?q=<receipt no> → matching entries from both fee logs. Admin only. */
export async function GET(req: NextRequest) {
  const actor = await requirePortalActor(req);
  if (!isPortalActor(actor)) return actor;
  const q = req.nextUrl.searchParams.get("q")?.trim() ?? "";
  if (!q) return NextResponse.json({ error: "Enter a receipt number." }, { status: 400 });
  try {
    const [school, other] = await cachedSheetRead(
      "receipts:logs",
      () => Promise.all([getAllDailyEntries(), getAllOtherFeeEntries()]),
      15_000
    );
    const hits: ReceiptHit[] = [
      ...searchByReceipt(school, q).map((e) => ({
        kind: "school" as const,
        id: e.id,
        date: e.date,
        studentName: e.studentName,
        className: e.className,
        srNo: e.srNo,
        feeType: "School Fees",
        amount: e.amount,
        paymentMode: e.paymentMode ?? "",
        receiptNo: e.receiptNo ?? "",
      })),
      ...searchByReceipt(other, q).map((e) => ({
        kind: "other" as const,
        id: e.id,
        date: e.date,
        studentName: e.studentName,
        className: e.className,
        srNo: e.srNo,
        feeType: e.feeType,
        amount: e.amount,
        paymentMode: e.paymentMode,
        receiptNo: e.receiptNo ?? "",
      })),
    ].sort((a, b) => b.date.localeCompare(a.date));
    return NextResponse.json({ hits });
  } catch (err) {
    console.error("GET /api/receipts/search:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Receipt search failed" },
      { status: 500 }
    );
  }
}
