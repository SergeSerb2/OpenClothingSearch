import type { Mode, Profile, SearchOptions, Snapshot } from "../api/types";
import { zhName, type CatalogIndex } from "./catalog";

export const MODES: { id: Mode; label: string; short: string; help: string }[] = [
  {
    id: "exact",
    label: "Exact product",
    short: "Exact",
    help: "Find this exact item: same model, color and style code.",
  },
  {
    id: "similar",
    label: "Similar style",
    short: "Similar",
    help: "Find items with the same look and cut, from any brand.",
  },
  {
    id: "alternatives",
    label: "Cheaper alternatives",
    short: "Cheaper",
    help: "Find the same look for less: unbranded or other brands, ranked by look and price.",
  },
];

export const MODE_LABEL: Record<Mode, string> = {
  exact: "Exact product",
  similar: "Similar style",
  alternatives: "Cheaper alternatives",
};

/** Option fields that count as "set" (mode excluded). */
export function countOptions(o: SearchOptions): number {
  let n = 0;
  if (o.category) n++;
  if (o.gender) n++;
  if (o.colors?.length) n++;
  if (o.fit) n++;
  if (o.materials?.length) n++;
  if (o.season) n++;
  if (o.size?.trim()) n++;
  if (o.brands?.length) n++;
  if (o.styles?.length) n++;
  if (o.price_min != null || o.price_max != null) n++;
  if (o.official_only) n++;
  if (o.notes?.trim()) n++;
  return n;
}

/** A query can be empty when the options give the AI something to search for. */
export function optionsCanPlan(o: SearchOptions): boolean {
  return !!(o.category || o.brands?.length || o.styles?.length);
}

/** Removes empty fields; returns undefined when nothing is set and the mode is the default. */
export function cleanOptions(o: SearchOptions): SearchOptions | undefined {
  const out: SearchOptions = {};
  if (o.mode && o.mode !== "exact") out.mode = o.mode;
  if (o.category) out.category = o.category;
  if (o.gender) out.gender = o.gender;
  if (o.colors?.length) out.colors = o.colors;
  if (o.fit) out.fit = o.fit;
  if (o.materials?.length) out.materials = o.materials;
  if (o.season) out.season = o.season;
  if (o.size?.trim()) out.size = o.size.trim();
  if (o.brands?.length) out.brands = o.brands;
  if (o.styles?.length) out.styles = o.styles;
  if (o.price_min != null && Number.isFinite(o.price_min) && o.price_min > 0) out.price_min = o.price_min;
  if (o.price_max != null && Number.isFinite(o.price_max) && o.price_max > 0) out.price_max = o.price_max;
  if (o.official_only) out.official_only = true;
  if (o.notes?.trim()) out.notes = o.notes.trim();
  if (Object.keys(out).length === 0) return undefined;
  if (!out.mode && o.mode) out.mode = o.mode;
  return out;
}

/**
 * Defaults from the user's profile: gender only. The budget is not prefilled as a max price
 * (it hid too many listings); the AI already uses it through the profile.
 */
export function profileDefaults(p: Profile | null | undefined): SearchOptions {
  const o: SearchOptions = {};
  if (p?.gender) o.gender = p.gender;
  return o;
}

export interface OptionChip {
  key: string;
  label: string;
  zh?: string;
  swatch?: string;
}

/** Short human labels for the options of a search, for chips on results and boards. */
export function describeOptions(o: SearchOptions | undefined, idx: CatalogIndex | null): OptionChip[] {
  if (!o) return [];
  const chips: OptionChip[] = [];
  if (o.category) {
    const c = idx?.category.get(o.category);
    chips.push({ key: "category", label: c?.name ?? o.category, zh: c?.zh });
  }
  for (const id of o.colors ?? []) {
    const c = idx?.color.get(id);
    chips.push({ key: `color:${id}`, label: c?.name ?? id, swatch: c?.hex });
  }
  if (o.fit) chips.push({ key: "fit", label: idx?.fit.get(o.fit)?.name ?? o.fit });
  for (const id of o.materials ?? []) chips.push({ key: `mat:${id}`, label: idx?.material.get(id)?.name ?? id });
  for (const id of o.brands ?? []) {
    const b = idx?.brand.get(id);
    chips.push({ key: `brand:${id}`, label: b?.name ?? id, zh: b ? zhName(b) : undefined });
  }
  for (const id of o.styles ?? []) {
    const s = idx?.style.get(id);
    chips.push({ key: `style:${id}`, label: s?.name ?? id, zh: s?.zh[0] });
  }
  if (o.gender) chips.push({ key: "gender", label: o.gender === "men" ? "Men" : o.gender === "women" ? "Women" : "Unisex" });
  if (o.season) chips.push({ key: "season", label: o.season[0].toUpperCase() + o.season.slice(1) });
  if (o.size) chips.push({ key: "size", label: `Size ${o.size}` });
  if (o.price_min != null || o.price_max != null) {
    chips.push({
      key: "price",
      label: o.price_min != null && o.price_max != null ? `¥${o.price_min}–${o.price_max}` : o.price_max != null ? `Under ¥${o.price_max}` : `Over ¥${o.price_min}`,
    });
  }
  if (o.official_only) chips.push({ key: "official", label: "Official stores" });
  if (o.notes) chips.push({ key: "notes", label: `“${o.notes}”` });
  return chips;
}

/** Text for a search that has no query: what the AI will look for. */
export function optionsTitle(o: SearchOptions | undefined, idx: CatalogIndex | null): string {
  if (!o) return "";
  const color = o.colors?.[0] ? idx?.color.get(o.colors[0])?.name : undefined;
  const cat = o.category ? idx?.category.get(o.category)?.name : undefined;
  const brand = o.brands?.[0] ? idx?.brand.get(o.brands[0])?.name : undefined;
  const style = o.styles?.[0] ? idx?.style.get(o.styles[0])?.name : undefined;
  const words = [brand, style, color?.toLowerCase(), cat?.toLowerCase()].filter(Boolean);
  if (!words.length) return "";
  const text = words.join(" ");
  return text[0].toUpperCase() + text.slice(1);
}

/**
 * Title for a search. For option-only searches the backend stores the AI summary in `query`;
 * that repeats the AI plan line, so prefer a short title built from the options.
 */
export function searchTitle(
  snap: Pick<Snapshot, "query" | "options"> & { queries?: { summary?: string } | null; upload_keys?: string[] },
  idx: CatalogIndex | null,
): string {
  const q = snap.query?.trim() ?? "";
  const fromOptions = optionsTitle(snap.options, idx);
  const isSummary = !!q && !!snap.queries?.summary && q === snap.queries.summary.trim();
  // Capitalized so the live title ("Grey hoodie") and the stored one ("grey hoodie") match.
  if (q && !(isSummary && fromOptions)) return q[0].toUpperCase() + q.slice(1);
  return fromOptions || q || (snap.upload_keys?.length ? "Photo search" : "Search");
}
