import { revalidateTag } from "next/cache";

export function invalidatePortalCache() {
  const rt = revalidateTag as (tag: string, profile: string) => void;
  rt("fees", "default");
  rt("students", "default");
  rt("admissions", "default");
}
