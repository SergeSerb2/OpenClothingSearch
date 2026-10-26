const memory = new Map<string, string | null>();

export function readStorage(key: string): string | null {
  if (memory.has(key)) return memory.get(key)!;
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writeStorage(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value);
    memory.delete(key);
  } catch {
    memory.set(key, value);
  }
}

window.addEventListener("storage", (e) => {
  if (e.key == null) memory.clear();
  else memory.delete(e.key);
});
