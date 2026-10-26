import { useSyncExternalStore } from "react";
import type { Listing } from "../api/types";

export interface PreviewState {
  listing: Listing;
  rect: DOMRect;
  /** Group summary, when previewing a group card. */
  sellers?: number;
}

let state: PreviewState | null = null;
let owner: HTMLElement | null = null;
let timer: ReturnType<typeof setTimeout> | undefined;
const listeners = new Set<() => void>();

function set(next: PreviewState | null) {
  state = next;
  for (const l of listeners) l();
}

const canHover = typeof matchMedia === "function" && matchMedia("(hover: hover) and (pointer: fine)").matches;

/** Shows the large hover preview after a short delay. */
export function showPreview(next: PreviewState, element: HTMLElement) {
  if (!canHover) return;
  owner = element;
  clearTimeout(timer);
  timer = setTimeout(() => set(next), state ? 60 : 380);
}

export function hidePreview() {
  clearTimeout(timer);
  owner = null;
  if (state) set(null);
}

new MutationObserver(() => {
  if (owner && !owner.isConnected) hidePreview();
}).observe(document.documentElement, { childList: true, subtree: true });

export function usePreview(): PreviewState | null {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => state,
  );
}
