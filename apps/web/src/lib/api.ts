"use client";

import type { AuthTokens } from "@bpredict/shared";
import { useAuth } from "./auth-store";

export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: unknown,
  ) {
    super(typeof body === "object" && body && "message" in body ? String((body as { message: unknown }).message) : `HTTP ${status}`);
  }
}

let refreshing: Promise<boolean> | null = null;

async function refreshTokens(): Promise<boolean> {
  const { refreshToken, setTokens, clear } = useAuth.getState();
  if (!refreshToken) return false;
  if (!refreshing) {
    refreshing = (async () => {
      try {
        const res = await fetch(`${API_URL}/auth/refresh`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ refreshToken }),
        });
        if (!res.ok) {
          clear();
          return false;
        }
        setTokens((await res.json()) as AuthTokens);
        return true;
      } catch {
        return false;
      } finally {
        refreshing = null;
      }
    })();
  }
  return refreshing;
}

export async function api<T>(path: string, init: RequestInit = {}, retry = true): Promise<T> {
  const { accessToken, accessExpiresAt } = useAuth.getState();
  if (accessToken && accessExpiresAt && accessExpiresAt - Date.now() < 30_000) await refreshTokens();

  const token = useAuth.getState().accessToken;
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(init.headers ?? {}),
    },
  });

  if (res.status === 401 && retry && token && (await refreshTokens())) return api<T>(path, init, false);
  if (res.status === 204) return undefined as T;

  const body = res.headers.get("content-type")?.includes("json") ? await res.json() : await res.text();
  if (!res.ok) throw new ApiError(res.status, body);
  return body as T;
}

export async function logout() {
  const { refreshToken, clear } = useAuth.getState();
  if (refreshToken) {
    try {
      await api("/auth/logout", { method: "POST", body: JSON.stringify({ refreshToken }) }, false);
    } catch {
      /* ignore */
    }
  }
  clear();
}
