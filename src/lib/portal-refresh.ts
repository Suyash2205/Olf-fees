/** Dispatched after data changes so all portal lists reload. */
export const PORTAL_REFRESH_EVENT = "portal-data-refresh";

export function dispatchPortalRefresh() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(PORTAL_REFRESH_EVENT));
  }
}
