"use client";

import { useCallback, useEffect, useState } from "react";
import { Lock, Loader2 } from "lucide-react";
import { portalFetch } from "@/lib/portal-fetch";

export default function AdminGate({ children }: { children: React.ReactNode }) {
  const [checking, setChecking] = useState(true);
  const [authenticated, setAuthenticated] = useState(false);
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const checkSession = useCallback(async () => {
    setChecking(true);
    try {
      const res = await portalFetch("/api/admin/session");
      const data = await res.json();
      setAuthenticated(Boolean(data.authenticated));
    } catch {
      setAuthenticated(false);
    } finally {
      setChecking(false);
    }
  }, []);

  useEffect(() => {
    checkSession();
  }, [checkSession]);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await portalFetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Login failed");
      setAuthenticated(true);
      setPassword("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setBusy(false);
    }
  }

  async function handleLogout() {
    await portalFetch("/api/admin/logout", { method: "POST" });
    setAuthenticated(false);
  }

  if (checking) {
    return (
      <div className="flex flex-col items-center py-16 text-slate-400 gap-3">
        <Loader2 className="w-6 h-6 animate-spin" />
        <p className="text-sm">Checking admin access…</p>
      </div>
    );
  }

  if (!authenticated) {
    return (
      <div className="max-w-sm mx-auto bg-white rounded-xl border border-slate-200 p-6 space-y-4">
        <div className="flex items-center gap-2 text-slate-800">
          <Lock className="w-5 h-5 text-amber-600" />
          <h2 className="font-semibold">Admin sign in</h2>
        </div>
        <p className="text-sm text-slate-500">
          Promote all and demote all require the admin password.
        </p>
        <form onSubmit={handleLogin} className="space-y-3">
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Admin password"
            className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            autoComplete="current-password"
          />
          {error && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
              {error}
            </p>
          )}
          <button
            type="submit"
            disabled={busy || !password}
            className="w-full py-2.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-60"
          >
            {busy ? "Signing in…" : "Unlock admin"}
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button
          type="button"
          onClick={handleLogout}
          className="text-xs text-slate-500 hover:text-slate-700 underline"
        >
          Lock admin
        </button>
      </div>
      {children}
    </div>
  );
}
