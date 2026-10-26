const NAME = /^[a-z0-9][a-z0-9_-]*$/;
const RESERVED = new Set(["www", "x", "photo", "pic", "h5", "m"]);

/**
 * Turns a pasted Yupoo store reference into its subdomain.
 *   "philanthropist"                                  -> "philanthropist"
 *   "https://philanthropist.x.yupoo.com/albums?tab=1" -> "philanthropist"
 *   "philanthropist.yupoo.com"                        -> "philanthropist"
 *   "https://x.yupoo.com/photos/philanthropist/albums" -> "philanthropist" (old style)
 * Returns null when the input is not a Yupoo store.
 */
export function normalizeStore(raw: string): string | null {
  let s = raw.trim().toLowerCase().replace(/^@/, "");
  if (!s) return null;

  const oldStyle = s.match(/(?:^|[/.])x\.yupoo\.com\/photos\/([a-z0-9_-]+)/);
  if (oldStyle) return oldStyle[1];

  s = s.replace(/^[a-z][a-z0-9+.-]*:\/\//, "");
  const host = s.split(/[/?#]/)[0].replace(/:\d+$/, "");

  if (host.includes(".")) {
    const m = host.match(/^([a-z0-9_-]+)\.(?:x\.)?yupoo\.com$/);
    if (!m || RESERVED.has(m[1])) return null;
    return m[1];
  }
  return NAME.test(host) && !RESERVED.has(host) ? host : null;
}

/** Splits pasted text (newlines, commas, spaces) into store names. */
export function parseStores(text: string): { stores: string[]; invalid: string[] } {
  const stores: string[] = [];
  const invalid: string[] = [];
  for (const part of text.split(/[\s,;]+/)) {
    if (!part) continue;
    const name = normalizeStore(part);
    if (name) {
      if (!stores.includes(name)) stores.push(name);
    } else {
      invalid.push(part);
    }
  }
  return { stores, invalid };
}
