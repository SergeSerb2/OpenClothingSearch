import { useCallback, useEffect, useRef, useState } from "react";
import { useApi } from "../api/context";
import type { HistoryItem } from "../api/types";
import { errorMessage } from "./useSearch";

export function useHistory() {
  const api = useApi();
  const [items, setItems] = useState<HistoryItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const generation = useRef(0);

  const refresh = useCallback(async () => {
    const g = ++generation.current;
    setLoading(true);
    try {
      const next = await api.history();
      if (g !== generation.current) return;
      setItems(next);
      setError(null);
    } catch (e) {
      if (g === generation.current) setError(errorMessage(e));
    } finally {
      if (g === generation.current) setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const running = items?.some((i) => i.status === "running") ?? false;
  useEffect(() => {
    if (!running) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    const tick = async () => {
      await refresh();
      if (!stopped) timer = setTimeout(tick, 2500);
    };
    timer = setTimeout(tick, 2500);
    return () => { stopped = true; clearTimeout(timer); };
  }, [running, refresh]);

  return { items, error, loading, refresh };
}

export type HistoryApi = ReturnType<typeof useHistory>;
