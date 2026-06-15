import { revalidateTag } from "next/cache";
import { invalidateSheetCache } from "@/lib/sheets/read-cache";

export function invalidatePortalCache() {
  invalidateSheetCache();
  const rt = revalidateTag as (tag: string, profile: string) => void;
  rt("fees", "default");
  rt("students", "default");
  rt("admissions", "default");
}
