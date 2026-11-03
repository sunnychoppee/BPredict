"use client";

import { useCallback, useEffect, useState } from "react";
import type { MeResponse } from "@bpredict/shared";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth-store";

export function useMe() {
  const { accessToken, hydrated } = useAuth();
  const [me, setMe] = useState<MeResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    if (!accessToken) {
      setMe(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      setMe(await api<MeResponse>("/me"));
      setError(null);
    } catch (e) {
      if (!(e instanceof ApiError && e.status === 401)) setError((e as Error).message);
      setMe(null);
    } finally {
      setLoading(false);
    }
  }, [accessToken]);

  useEffect(() => {
    if (hydrated) void reload();
  }, [hydrated, reload]);

  return { me, error, loading: !hydrated || loading, reload };
}
