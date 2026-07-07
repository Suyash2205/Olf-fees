/**
 * Retry Google Sheets API calls that fail with a transient rate-limit (429) or
 * server (5xx) error, using exponential backoff with jitter.
 *
 * All portal requests share a single service account, so Google counts every
 * user against the same "read requests per minute per user" quota. Bursts of
 * concurrent readers (e.g. several teachers opening attendance at once) can spill
 * over the limit; retrying briefly rides out the burst instead of surfacing the
 * error to the user.
 */

export function isRetryableSheetsError(err: unknown): boolean {
  const e = err as
    | { code?: number; status?: number; message?: string; response?: { status?: number } }
    | null
    | undefined;
  const status = e?.code ?? e?.status ?? e?.response?.status;
  if (status === 429 || status === 500 || status === 503) return true;
  const msg = String(e?.message ?? "");
  return /quota exceeded|rate limit|rateLimitExceeded|userRateLimitExceeded/i.test(msg);
}

export async function withSheetRetry<T>(
  fn: () => Promise<T>,
  { retries = 4, baseDelayMs = 400 }: { retries?: number; baseDelayMs?: number } = {}
): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (attempt >= retries || !isRetryableSheetsError(err)) throw err;
      // 400, 800, 1600, 3200 ms (+ up to 250ms jitter) — worst case ~6s before giving up.
      const delay = baseDelayMs * 2 ** attempt + Math.floor(Math.random() * 250);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
}
