import { useSyncExternalStore } from "react";
import { readStorage, writeStorage } from "./storage";
import type { Box, SearchOptions } from "../api/types";
import { MOCK_SESSION } from "./mockSession";
import { isBox, isOptions, isRecord, isStrings } from "./validation";

/** A set of item searches shown together: from "Shop the look" or the AI stylist. */
export interface Board {
  id: string;
  kind: "look" | "suggest" | "complete";
  title: string;
  created: number; // unix seconds
  /** Outfit photo for "Shop the look". */
  photo_key?: string;
  /** Width / height of the outfit photo, for undistorted CSS crops. */
  photo_aspect?: number;
  /** The search a "Complete the look" board started from. */
  anchor?: { search_id: string; label: string; thumb_key: string | null };
  items: BoardItem[];
  /** Data source, so mock boards don't show up against the real backend. */
  mock: boolean;
}

export interface BoardItem {
  key: string;
  label: string;
  why?: string;
  query: string;
  options: SearchOptions;
  upload_keys: string[];
  crop_key?: string | null;
  box?: Box;
  search_id: string | null;
  start_error?: string;
  launching?: boolean;
}

const KEY = "boards.v1";
const MAX = 40;
const listeners = new Set<() => void>();
let cache: Board[] | null = null;

function isBoard(v: unknown): v is Board {
  if (!isRecord(v) || typeof v.id !== "string" || !["look", "suggest", "complete"].includes(String(v.kind)) ||
    typeof v.title !== "string" || typeof v.created !== "number" || !Number.isFinite(v.created) || typeof v.mock !== "boolean") return false;
  if (v.photo_key !== undefined && typeof v.photo_key !== "string") return false;
  if (v.photo_aspect !== undefined && (typeof v.photo_aspect !== "number" || !Number.isFinite(v.photo_aspect) || v.photo_aspect <= 0)) return false;
  if (v.anchor !== undefined && (!isRecord(v.anchor) || typeof v.anchor.search_id !== "string" || typeof v.anchor.label !== "string" ||
    (v.anchor.thumb_key !== null && typeof v.anchor.thumb_key !== "string"))) return false;
  return Array.isArray(v.items) && v.items.every((i) => isRecord(i) && typeof i.key === "string" && typeof i.label === "string" &&
    typeof i.query === "string" && isOptions(i.options) && isStrings(i.upload_keys) && (i.search_id === null || typeof i.search_id === "string") &&
    (i.why === undefined || typeof i.why === "string") && (i.crop_key == null || typeof i.crop_key === "string") &&
    (i.box === undefined || isBox(i.box)) && (i.start_error === undefined || typeof i.start_error === "string") &&
    (i.launching === undefined || typeof i.launching === "boolean"));
}

function read(): Board[] {
  if (cache) return cache;
  try {
    const raw = readStorage(KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    cache = Array.isArray(parsed) ? parsed.filter(isBoard).filter((b) => !b.mock || b.id.startsWith(`bmock-${MOCK_SESSION}-`)).slice(0, MAX).map((b) => ({
      ...b, items: b.items.map((i) => ({ ...i, launching: false })),
    })) : [];
  } catch {
    cache = [];
  }
  return cache;
}

function write(boards: Board[]) {
  cache = boards.slice(0, MAX);
  try {
    writeStorage(KEY, JSON.stringify(cache));
  } catch {
    // Storage full or blocked: keep the in-memory copy.
  }
  for (const l of listeners) l();
}

window.addEventListener("storage", (e) => {
  if (e.key !== KEY && e.key !== null) return;
  cache = null;
  for (const l of listeners) l();
});

export function saveBoard(board: Board) {
  const rest = read().filter((b) => b.id !== board.id);
  write([board, ...rest].sort((a, b) => b.created - a.created));
}

export function updateBoard(id: string, update: (b: Board) => Board) {
  write(read().map((b) => (b.id === id ? update(b) : b)));
}

export function deleteBoard(id: string) {
  write(read().filter((b) => b.id !== id));
}

export function getBoard(id: string): Board | undefined {
  return read().find((b) => b.id === id);
}

export function newBoardId(mock = false): string {
  return `b${mock ? `mock-${MOCK_SESSION}-` : ""}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

export function useBoards(mock: boolean): Board[] {
  const all = useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    read,
  );
  return all.filter((b) => b.mock === mock);
}
