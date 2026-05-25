/** Browser fetch for portal APIs — bypass HTTP cache so sheet edits show up after refresh. */
export function portalFetch(
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<Response> {
  return fetch(input, { ...init, cache: "no-store", credentials: "include" });
}

/** Fees list API; `reorderSheet` rewrites the Google Sheet grouped by Standard. */
export function feesListUrl(reorderSheet = false): string {
  return reorderSheet ? "/api/fees?reorder=1" : "/api/fees";
}
