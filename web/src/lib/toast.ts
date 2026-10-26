import { useSyncExternalStore } from "react";

export interface Toast {
  id: number;
  text: string;
  tone: "info" | "error";
}

let toasts: Toast[] = [];
let nextId = 1;
const listeners = new Set<() => void>();

function set(next: Toast[]) {
  toasts = next;
  for (const l of listeners) l();
}

export function toast(text: string, tone: Toast["tone"] = "info") {
  const id = nextId++;
  set([...toasts.slice(-2), { id, text, tone }]);
  setTimeout(() => dismiss(id), tone === "error" ? 7000 : 4000);
}

export function dismiss(id: number) {
  set(toasts.filter((t) => t.id !== id));
}

export function useToasts(): Toast[] {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => toasts,
  );
}
