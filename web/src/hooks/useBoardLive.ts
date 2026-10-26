import { useEffect, useState } from "react";
import type { Api } from "../api/client";
import { useApi } from "../api/context";
import type { Listing, Snapshot } from "../api/types";
import { getBoard, updateBoard, type Board, type BoardItem } from "../lib/boards";
import { cleanOptions } from "../lib/options";
import { buildView, optionFilters } from "../lib/view";
import { errorMessage } from "./useSearch";

export interface ItemLive {
  status: "running" | "done" | "error" | "unknown";
  stage: Snapshot["stage"] | null;
  count: number;
  top: Listing[];
  error: string | null;
  /** Listing count after applying the search's initial filters. */
  good: number;
}

export function topMatches(snap: Snapshot, n = 3): Listing[] {
  return buildView(snap, optionFilters(snap.options), "match", "grouped").items.slice(0, n)
    .map((i) => i.kind === "group" ? i.best : i.listing);
}

function summarize(snap: Snapshot): ItemLive {
  return {
    status: snap.status,
    stage: snap.stage,
    count: snap.listings.length,
    top: topMatches(snap),
    error: snap.error,
    good: buildView(snap, optionFilters(snap.options), "match", "grouped").shown,
  };
}

/** Refreshes snapshots on entry, then polls until every terminal summary is available. */
export function useBoardLive(ids: string[]): Map<string, ItemLive> {
  const api = useApi();
  const [live, setLive] = useState<Map<string, ItemLive>>(() => new Map());
  const key = ids.join(",");

  useEffect(() => {
    if (!ids.length) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    const searchIds = [...new Set(ids)];
    const terminal = new Set<string>();
    const lastFetch = new Map<string, number>();

    const fetchSnap = async (id: string) => {
      lastFetch.set(id, Date.now());
      try {
        const snap = await api.getSearch(id);
        if (stopped) return;
        if (snap.status !== "running") terminal.add(id);
        setLive((m) => new Map(m).set(id, summarize(snap)));
      } catch (e) {
        if (stopped) return;
        setLive((m) => new Map(m).set(id, { status: "unknown", stage: null, count: 0, top: [], error: errorMessage(e), good: 0 }));
      }
    };

    const tick = async () => {
      try {
        const history = await api.history();
        if (stopped) return;
        const byId = new Map(history.map((h) => [h.id, h]));
        // Await every fetch before the next tick so older snapshots cannot arrive last.
        await Promise.all(searchIds.filter((id) => !terminal.has(id)).map(async (id) => {
          const h = byId.get(id);
          if (h?.status === "running") {
            setLive((m) => {
              const prev = m.get(id);
              return new Map(m).set(id, { status: "running", stage: prev?.stage ?? null, count: h.count, top: prev?.top ?? [], error: null, good: prev?.good ?? 0 });
            });
          }
          if (h?.status !== "running" || Date.now() - (lastFetch.get(id) ?? 0) > 6000) await fetchSnap(id);
        }));
      } catch {
        // Retry after a temporary history or snapshot failure.
      }
      if (!stopped && terminal.size < searchIds.length) timer = setTimeout(tick, 2500);
    };

    void tick();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
    // `ids` is captured through `key`.
  }, [api, key]);

  return live;
}

const launching = new Set<string>();

/** Claims all launches before awaiting any request, including launches from the look page. */
export async function startItems(api: Api, board: Board, keys: string[]): Promise<void> {
  const current = getBoard(board.id);
  if (!current) return;
  const todo = current.items.filter((i) => keys.includes(i.key) && !i.search_id && !launching.has(`${board.id}:${i.key}`));
  for (const item of todo) launching.add(`${board.id}:${item.key}`);
  updateBoard(board.id, (b) => ({ ...b, items: b.items.map((i) => todo.some((t) => t.key === i.key) ? { ...i, launching: true, start_error: undefined } : i) }));
  for (const item of todo) {
    try {
      const { id } = await api.search({
        query: item.query,
        ...(item.upload_keys.length ? { upload_keys: item.upload_keys } : {}),
        ...(cleanOptions(item.options) ? { options: cleanOptions(item.options) } : {}),
      });
      updateBoard(board.id, (b) => ({
        ...b,
        items: b.items.map((i): BoardItem => i.key === item.key ? { ...i, search_id: id, launching: false, start_error: undefined } : i),
      }));
    } catch (e) {
      updateBoard(board.id, (b) => ({
        ...b,
        items: b.items.map((i): BoardItem => i.key === item.key ? { ...i, launching: false, start_error: errorMessage(e) } : i),
      }));
    } finally {
      launching.delete(`${board.id}:${item.key}`);
    }
  }
}
