import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError } from "../api/client";
import { useApi } from "../api/context";
import type { SearchOptions, StreamState } from "../api/types";
import { applyEvent, emptySnapshot, fromSnapshot, type LiveSearch } from "../lib/searchState";

export interface SearchSession {
  phase: "idle" | "starting" | "loading" | "ready" | "failed";
  live: LiveSearch | null;
  /** Starting or loading the search failed. */
  error: string | null;
  stream: StreamState;
  /** The stream dropped and could not be resumed. */
  streamError: string | null;
  rerank: { pending: boolean; error: string | null };
  /** Photo keys this search used, for "Search again". */
  uploadKeys: string[];
}

const IDLE: SearchSession = {
  phase: "idle",
  live: null,
  error: null,
  stream: "closed",
  streamError: null,
  rerank: { pending: false, error: null },
  uploadKeys: [],
};

export function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

const referenceQueues = new Map<string, Promise<unknown>>();

export function useSearch() {
  const api = useApi();
  const [session, setSession] = useState<SearchSession>(IDLE);
  const gen = useRef(0);
  const closeStream = useRef<(() => void) | null>(null);
  const rerankSeq = useRef(0);

  const stop = useCallback(() => {
    gen.current++;
    closeStream.current?.();
    closeStream.current = null;
  }, []);

  useEffect(() => stop, [stop]);

  const subscribe = useCallback(
    (id: string, g: number) => {
      closeStream.current?.();
      let finished = false;
      let finalRead = false;
      const refreshFinal = () => {
        if (finalRead) return;
        finalRead = true;
        const seq = rerankSeq.current;
        void api.getSearch(id).then((snap) => {
          if (gen.current !== g || seq !== rerankSeq.current) return;
          setSession((s) => ({ ...s, live: s.live ? { ...s.live, snapshot: snap } : fromSnapshot(snap) }));
        }).catch((e) => {
          if (gen.current === g) setSession((s) => ({ ...s, streamError: errorMessage(e) }));
        });
      };
      closeStream.current = api.events(id, {
        onEvent(ev) {
          if (gen.current !== g) return;
          if (ev.type === "done" || ev.type === "error") finished = true;
          if (ev.type === "snapshot" && ev.data.status !== "running") finished = true;
          setSession((s) => (s.live ? { ...s, streamError: null, live: applyEvent(s.live, ev) } : s));
          if (finished) refreshFinal();
        },
        onState(state) {
          if (gen.current !== g) return;
          setSession((s) => ({ ...s, stream: state }));
          if (state !== "closed" || finished) return;
          // The stream ended without a final event. Re-read the snapshot and resume.
          setSession((s) => ({ ...s, stream: "reconnecting" }));
          setTimeout(async () => {
            if (gen.current !== g) return;
            try {
              const snap = await api.getSearch(id);
              if (gen.current !== g) return;
              setSession((s) => ({ ...s, live: s.live ? { ...s.live, snapshot: snap } : fromSnapshot(snap) }));
              if (snap.status === "running") subscribe(id, g);
              else setSession((s) => ({ ...s, stream: "closed" }));
            } catch (e) {
              if (gen.current !== g) return;
              setSession((s) => ({ ...s, stream: "closed", streamError: errorMessage(e) }));
            }
          }, 1500);
        },
      });
    },
    [api],
  );

  const start = useCallback(
    async (query: string, uploadKeys: string[], options?: SearchOptions): Promise<string | null> => {
      stop();
      const g = gen.current;
      setSession({ ...IDLE, phase: "starting", uploadKeys });
      try {
        const { id } = await api.search({
          query,
          ...(uploadKeys.length ? { upload_keys: uploadKeys } : {}),
          ...(options ? { options } : {}),
        });
        if (gen.current !== g) return null;
        const snap = { ...emptySnapshot(id, query, uploadKeys), options: options ?? {} };
        setSession((s) => ({ ...s, phase: "ready", live: fromSnapshot(snap) }));
        subscribe(id, g);
        return id;
      } catch (e) {
        if (gen.current === g) setSession((s) => ({ ...s, phase: "failed", error: errorMessage(e) }));
        return null;
      }
    },
    [api, stop, subscribe],
  );

  const load = useCallback(
    async (id: string) => {
      stop();
      const g = gen.current;
      setSession({ ...IDLE, phase: "loading" });
      try {
        const snap = await api.getSearch(id);
        if (gen.current !== g) return;
        setSession((s) => ({
          ...s,
          phase: "ready",
          live: fromSnapshot(snap),
          uploadKeys: snap.upload_keys ?? snap.references.filter((r) => r.url === "upload").map((r) => r.key),
        }));
        if (snap.status === "running") subscribe(id, g);
      } catch (e) {
        if (gen.current !== g) return;
        const notFound = e instanceof ApiError && e.status === 404;
        setSession((s) => ({ ...s, phase: "failed", error: notFound ? "This search no longer exists." : errorMessage(e) }));
      }
    },
    [api, stop, subscribe],
  );

  const setReferences = useCallback(
    async (selected: string[]) => {
      const id = session.live?.snapshot.id;
      if (!id || !selected.length || session.live?.snapshot.status === "running") return;
      const g = gen.current;
      const seq = ++rerankSeq.current;
      const chosen = new Set(selected);
      setSession((s) =>
        s.live
          ? {
              ...s,
              rerank: { pending: true, error: null },
              live: {
                ...s.live,
                snapshot: {
                  ...s.live.snapshot,
                  references: s.live.snapshot.references.map((r) => ({ ...r, selected: chosen.has(r.key) })),
                },
              },
            }
          : s,
      );
      const previous = referenceQueues.get(id) ?? Promise.resolve();
      const request = previous.catch(() => undefined).then(() => api.setReferences(id, selected));
      referenceQueues.set(id, request);
      try {
        const snap = await request;
        if (gen.current !== g || seq !== rerankSeq.current) return;
        setSession((s) => ({
          ...s,
          rerank: { pending: false, error: null },
          live: s.live ? { ...s.live, snapshot: snap } : fromSnapshot(snap),
        }));
      } catch (e) {
        if (gen.current !== g || seq !== rerankSeq.current) return;
        setSession((s) => ({ ...s, rerank: { pending: false, error: errorMessage(e) } }));
        // Resync the selection with the server.
        api
          .getSearch(id)
          .then((snap) => {
            if (gen.current !== g || seq !== rerankSeq.current) return;
            setSession((s) => (s.live ? { ...s, live: { ...s.live, snapshot: snap } } : s));
          })
          .catch(() => undefined);
      } finally {
        if (referenceQueues.get(id) === request) referenceQueues.delete(id);
      }
    },
    [api, session.live?.snapshot.id, session.live?.snapshot.status],
  );

  const clear = useCallback(() => {
    stop();
    setSession(IDLE);
  }, [stop]);

  return { session, start, load, setReferences, clear };
}
