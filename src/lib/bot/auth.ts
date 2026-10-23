import { timingSafeEqual } from "node:crypto";

/** The bot authenticates with a shared secret header, compared in constant time. Unset secret = locked. */
export function isAuthorizedBot(header: string | null): boolean {
  const secret = process.env.BOT_SECRET?.trim();
  if (!secret || !header) return false;
  const a = Buffer.from(header);
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}
