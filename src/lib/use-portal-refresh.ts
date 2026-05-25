"use client";

import { useEffect } from "react";
import { PORTAL_REFRESH_EVENT } from "@/lib/portal-refresh";

/** Re-run `reload` on mount and when admissions/fees data changes elsewhere. */
export function usePortalRefresh(reload: () => void) {
  useEffect(() => {
    const onRefresh = () => reload();
    window.addEventListener(PORTAL_REFRESH_EVENT, onRefresh);
    return () => window.removeEventListener(PORTAL_REFRESH_EVENT, onRefresh);
  }, [reload]);
}
