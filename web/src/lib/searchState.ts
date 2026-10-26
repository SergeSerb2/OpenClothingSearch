import type { SearchEvent, Snapshot, SourceStatus } from "../api/types";

/** Client-side view of one search: the snapshot plus bits that only arrive as events. */
export interface LiveSearch {
  snapshot: Snapshot;
  stageMessage: string;
  elapsedMs: number | null;
}

export function emptySnapshot(id: string, query: string, uploadKeys: string[] = []): Snapshot {
  return {
    id,
    query,
    created: Date.now() / 1000,
    status: "running",
    stage: "queries",
    error: null,
    queries: null,
    ref_provider: null,
    references: [],
    sources: [],
    listings: [],
    groups: [],
    upload_keys: uploadKeys,
  };
}

export function fromSnapshot(snapshot: Snapshot): LiveSearch {
  return { snapshot, stageMessage: "", elapsedMs: null };
}

function sameSource(a: SourceStatus, b: SourceStatus): boolean {
  return a.source === b.source && a.method === b.method && a.provider === b.provider;
}

/**
 * Applies one SSE event. Used for the real stream and for the mock replay, so both
 * exercise exactly the same state transitions.
 */
export function applyEvent(live: LiveSearch, ev: SearchEvent): LiveSearch {
  const snap = live.snapshot;
  switch (ev.type) {
    case "snapshot":
      return { ...live, snapshot: ev.data };
    case "stage":
      return {
        ...live,
        stageMessage: ev.data.message,
        snapshot: { ...snap, stage: ev.data.stage },
      };
    case "queries":
      return { ...live, snapshot: { ...snap, queries: ev.data } };
    case "references":
      return {
        ...live,
        snapshot: { ...snap, ref_provider: ev.data.provider, references: ev.data.references },
      };
    case "source": {
      const idx = snap.sources.findIndex((s) => sameSource(s, ev.data));
      const sources =
        idx === -1
          ? [...snap.sources, ev.data]
          : snap.sources.map((s, i) => (i === idx ? ev.data : s));
      return { ...live, snapshot: { ...snap, sources } };
    }
    case "results":
      return {
        ...live,
        snapshot: { ...snap, listings: ev.data.listings, groups: ev.data.groups },
      };
    case "done":
      return {
        ...live,
        elapsedMs: ev.data.elapsed_ms,
        stageMessage: "",
        snapshot: { ...snap, status: "done", stage: "done" },
      };
    case "error":
      return {
        ...live,
        stageMessage: "",
        snapshot: { ...snap, status: "error", error: ev.data.message },
      };
  }
}
