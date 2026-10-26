/**
 * English for Chinese text in the UI (titles, shop names, search terms).
 *
 * Components ask for the texts they show; the store collects them for a moment and sends
 * them to POST /api/translate in batches. The backend caches every translation, so a text
 * costs one AI call once. Until a translation arrives, the original text shows, dimmed.
 */
import { useEffect, useSyncExternalStore } from "react";
import { readStorage, writeStorage } from "./storage";
import type { Api } from "../api/client";
import { useApi } from "../api/context";

const CJK = /[㐀-鿿豈-﫿]/;
const BATCH = 25; // one AI call on the backend
const PARALLEL = 3;
const RETRY_MS = 90_000; // the backend tries a failed text again after 60 s
const MAX_TRIES = 3;
const SETTING_KEY = "translate";

export function hasChinese(text: string | null | undefined): text is string {
  return !!text && CJK.test(text);
}

// ---- setting: show English (default) or the original Chinese ----

const settingListeners = new Set<() => void>();
let englishOn = readStorage(SETTING_KEY) !== "0";

export function setEnglishOnly(on: boolean) {
  englishOn = on;
  writeStorage(SETTING_KEY, on ? "1" : "0");
  settingListeners.forEach((l) => l());
}

function subscribeSetting(l: () => void) {
  settingListeners.add(l);
  return () => settingListeners.delete(l);
}

/** True when Chinese text shows in English only. */
export function useEnglishOnly(): boolean {
  return useSyncExternalStore(subscribeSetting, () => englishOn);
}

// ---- translation store ----

const done = new Map<string, string>();
const failedAt = new Map<string, number>();
const tries = new Map<string, number>();
/** How many mounted components show each text; failed texts on screen are tried again. */
const mounted = new Map<string, number>();
let retryTimer: ReturnType<typeof setTimeout> | null = null;
const queue: string[] = [];
const queued = new Set<string>();
const listeners = new Set<() => void>();
let active = 0;
let timer: ReturnType<typeof setTimeout> | null = null;
let api: Api | null = null;

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

function want(texts: string[], current: Api) {
  api = current;
  const now = Date.now();
  for (const t of texts) {
    if (done.has(t) || queued.has(t) || (tries.get(t) ?? 0) >= MAX_TRIES || now - (failedAt.get(t) ?? -RETRY_MS) < RETRY_MS) continue;
    queued.add(t);
    queue.push(t);
  }
  if (queue.length && !timer) timer = setTimeout(pump, 40);
}

/** Forget failures and try the texts on screen again (for example after the AI provider changed). */
export function retryTranslations() {
  failedAt.clear();
  tries.clear();
  listeners.forEach((l) => l());
  if (api) want([...mounted.keys()], api);
}

function scheduleRetry() {
  if (retryTimer) clearTimeout(retryTimer);
  retryTimer = null;
  const eligible = [...failedAt].filter(([t]) => mounted.has(t) && !queued.has(t) && (tries.get(t) ?? 0) < MAX_TRIES);
  if (!eligible.length) return;
  const due = Math.min(...eligible.map(([, at]) => at + RETRY_MS));
  retryTimer = setTimeout(() => {
    retryTimer = null;
    const now = Date.now();
    const again = eligible.filter(([t, at]) => mounted.has(t) && now - at >= RETRY_MS).map(([t]) => t);
    if (api) want(again, api);
    scheduleRetry();
  }, Math.max(0, due - Date.now()));
}

function pump() {
  timer = null;
  while (api && active < PARALLEL && queue.length) {
    const batch = queue.splice(0, BATCH);
    active++;
    api
      .translate(batch)
      .then(({ translations }) => {
        for (const t of batch) {
          const en = translations[t];
          if (en) {
            done.set(t, en);
            failedAt.delete(t);
          } else failedAt.set(t, Date.now());
        }
      })
      .catch(() => {
        for (const t of batch) failedAt.set(t, Date.now());
      })
      .finally(() => {
        for (const t of batch) {
          queued.delete(t);
          if (failedAt.has(t)) tries.set(t, (tries.get(t) ?? 0) + 1);
        }
        if (batch.some((t) => failedAt.has(t))) scheduleRetry();
        active--;
        listeners.forEach((l) => l());
        pump();
      });
  }
}

export interface Shown {
  /** What to show: the English text, or the original while there is none. */
  text: string;
  /** The Chinese original, when `text` is a translation. */
  original: string | null;
  /** A translation is on its way. */
  pending: boolean;
  /** "zh" when `text` is still Chinese. */
  lang: "zh" | undefined;
}

function shown(t: string | null | undefined, on: boolean): Shown {
  if (!hasChinese(t)) return { text: t ?? "", original: null, pending: false, lang: undefined };
  const en = on ? done.get(t) : undefined;
  if (en) return { text: en, original: t, pending: false, lang: undefined };
  return { text: t, original: null, pending: on && (queued.has(t) || !failedAt.has(t)), lang: "zh" };
}

/** Each text in English when the setting is on. Re-renders only when one of these texts changes. */
export function useEnglish(texts: readonly (string | null | undefined)[]): Shown[] {
  const on = useEnglishOnly();
  const current = useApi();
  const chinese = on ? texts.filter(hasChinese) : [];
  const key = chinese.join("\u0001");
  useEffect(() => {
    if (!key) return;
    const list = key.split("\u0001");
    for (const t of list) mounted.set(t, (mounted.get(t) ?? 0) + 1);
    want(list, current);
    scheduleRetry();
    return () => {
      for (const t of list) {
        const n = (mounted.get(t) ?? 1) - 1;
        if (n > 0) mounted.set(t, n);
        else mounted.delete(t);
      }
    };
  }, [key, current]);
  // The snapshot is a string, so React compares it by value.
  useSyncExternalStore(subscribe, () => chinese.map((t) => done.get(t) ?? (failedAt.has(t) ? "\u0002" : "")).join("\u0001"));
  return texts.map((t) => shown(t, on));
}

export function useEn(text: string | null | undefined): Shown {
  return useEnglish([text])[0];
}

/** Tooltip text: the full English, then the Chinese original. */
export function tipOf(s: Shown, extra?: string): string {
  return [s.text, s.original, extra].filter(Boolean).join("\n\n");
}
