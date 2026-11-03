"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { AuthTokens } from "@bpredict/shared";

interface AuthState {
  accessToken: string | null;
  refreshToken: string | null;
  accessExpiresAt: number | null;
  hydrated: boolean;
  setTokens(t: AuthTokens): void;
  clear(): void;
  setHydrated(): void;
}

export const useAuth = create<AuthState>()(
  persist(
    (set) => ({
      accessToken: null,
      refreshToken: null,
      accessExpiresAt: null,
      hydrated: false,
      setTokens: (t) =>
        set({
          accessToken: t.accessToken,
          refreshToken: t.refreshToken,
          accessExpiresAt: Date.now() + t.accessExpiresIn * 1000,
        }),
      clear: () => set({ accessToken: null, refreshToken: null, accessExpiresAt: null }),
      setHydrated: () => set({ hydrated: true }),
    }),
    {
      name: "bp.auth",
      partialize: (s) => ({ accessToken: s.accessToken, refreshToken: s.refreshToken, accessExpiresAt: s.accessExpiresAt }),
      onRehydrateStorage: () => (state) => state?.setHydrated(),
    },
  ),
);
