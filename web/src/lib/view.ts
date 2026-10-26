import type { Group, Listing, Snapshot, Source } from "../api/types";
import { SOURCES } from "../api/types";
import { pct } from "./format";
import { tierOf } from "./sources";

export type ViewMode = "grouped" | "all";
export type SortKey = "match" | "price" | "value";
export type VerdictFilter = "all" | "same" | "hide_different";

export interface Filters {
  hiddenSources: Source[];
  /** Minimum match in percent. null = automatic: hide "weak" tier. */
  minMatch: number | null;
  verdict: VerdictFilter;
  priceMin: number | null;
  priceMax: number | null;
  /** Keep only official / flagship stores (Listing.official). */
  officialOnly: boolean;
}

export const DEFAULT_FILTERS: Filters = {
  hiddenSources: [],
  minMatch: null,
  verdict: "all",
  priceMin: null,
  priceMax: null,
  officialOnly: false,
};

export interface GroupItem {
  kind: "group";
  key: string;
  group: Group;
  /** Visible listings in display order. */
  listings: Listing[];
  /** Highest-scoring visible listing; its image represents the group. */
  best: Listing;
  minPrice: number | null;
  maxPrice: number | null;
  sources: Source[];
  hidden: number;
}

export interface ListingItem {
  kind: "listing";
  key: string;
  listing: Listing;
}

export type Item = GroupItem | ListingItem;

export interface ResultsView {
  items: Item[];
  total: number;
  shown: number;
  /** Cards in the grouped view (multi-seller groups + single listings). */
  groupCount: number;
  sourceCounts: Record<Source, number>;
  /** Why listings are hidden, for empty states. */
  hiddenBy: { source: number; official: number; match: number; verdict: number; price: number };
  /** Listings from official stores (before other filters). */
  officialCount: number;
  /** Lowest score (in %) that the automatic "hide weak" setting keeps. */
  weakCutoff: number;
  /** No listing is better than a weak match; the automatic filter then shows them all. */
  allWeak: boolean;
}

export function optionFilters(options: Snapshot["options"]): Filters {
  return { ...DEFAULT_FILTERS, officialOnly: !!options?.official_only, priceMin: options?.price_min ?? null, priceMax: options?.price_max ?? null };
}

type Check = (l: Listing) => boolean;

function checks(f: Filters, allWeak: boolean) {
  const source: Check = (l) => !f.hiddenSources.includes(l.source);
  // Automatic: hide weak matches, unless every match is weak (then show the closest ones).
  const match: Check =
    f.minMatch == null ? (allWeak ? () => true : (l) => tierOf(l) !== "weak") : (l) => pct(l.score) >= f.minMatch!;
  const verdict: Check =
    f.verdict === "same"
      ? (l) => l.verdict === "same"
      : f.verdict === "hide_different"
        ? (l) => l.verdict !== "different"
        : () => true;
  const priceActive = f.priceMin != null || f.priceMax != null;
  const price: Check = !priceActive
    ? () => true
    : (l) =>
        // Unknown prices (many Yupoo albums) stay visible; they show "No price".
        l.price_cny == null ||
        ((f.priceMin == null || l.price_cny >= f.priceMin) && (f.priceMax == null || l.price_cny <= f.priceMax));
  const official: Check = f.officialOnly ? (l) => l.official === true : () => true;
  return { source, official, match, verdict, price };
}

/** "Best value": high match and low price. Price counts on a log scale across the visible listings. */
function sortByValue(list: Listing[]): Listing[] {
  const prices = list.map((l) => l.price_cny).filter((p): p is number => p != null && p >= 0);
  if (prices.length < 2) return list;
  const lo = Math.log1p(Math.min(...prices));
  const span = Math.max(1e-6, Math.log1p(Math.max(...prices)) - lo);
  const value = (l: Listing) => (l.price_cny != null && l.price_cny >= 0 ? l.score - 0.35 * ((Math.log1p(l.price_cny) - lo) / span) : -Infinity);
  return [...list].sort((a, b) => value(b) - value(a) || b.score - a.score);
}


function byPrice(a: Listing, b: Listing): number {
  if (a.price_cny == null && b.price_cny == null) return b.score - a.score;
  if (a.price_cny == null) return 1;
  if (b.price_cny == null) return -1;
  return a.price_cny - b.price_cny || b.score - a.score;
}

export function buildView(snap: Snapshot, f: Filters, sort: SortKey, mode: ViewMode): ResultsView {
  const all = snap.listings;
  const allWeak = all.length > 0 && all.every((l) => tierOf(l) === "weak");
  const c = checks(f, allWeak);

  const sourceCounts = Object.fromEntries(SOURCES.map((s) => [s, 0])) as Record<Source, number>;
  const hiddenBy = { source: 0, official: 0, match: 0, verdict: 0, price: 0 };
  let visible: Listing[] = [];
  let weakCutoff = 101;
  let officialCount = 0;

  for (const l of all) {
    const ok = { source: c.source(l), official: c.official(l), match: c.match(l), verdict: c.verdict(l), price: c.price(l) };
    if (l.official) officialCount++;
    if (ok.official && ok.match && ok.verdict && ok.price) sourceCounts[l.source] += 1;
    if (tierOf(l) !== "weak") weakCutoff = Math.min(weakCutoff, pct(l.score));
    if (ok.source && ok.official && ok.match && ok.verdict && ok.price) {
      visible.push(l);
    } else {
      // Attribute each hidden listing to the first filter that removed it.
      if (!ok.source) hiddenBy.source++;
      else if (!ok.official) hiddenBy.official++;
      else if (!ok.match) hiddenBy.match++;
      else if (!ok.verdict) hiddenBy.verdict++;
      else hiddenBy.price++;
    }
  }

  // The backend sends listings best first; keep that order for "match".
  if (sort === "price") visible.sort(byPrice);
  else if (sort === "value") visible = sortByValue(visible);

  const groupsById = new Map<number, Group>();
  for (const g of snap.groups) groupsById.set(g.id, g);

  const grouped: Item[] = [];
  const buckets = new Map<number, Listing[]>();
  for (const l of visible) {
    const g = l.group >= 0 ? groupsById.get(l.group) : undefined;
    if (!g || g.size < 2) {
      grouped.push({ kind: "listing", key: l.id, listing: l });
      continue;
    }
    let bucket = buckets.get(g.id);
    if (!bucket) {
      bucket = [];
      buckets.set(g.id, bucket);
      // Placeholder; finalized below once all members are collected.
      grouped.push({ kind: "group", key: `g${JSON.stringify([...g.listing_ids].sort())}`, group: g } as GroupItem);
    }
    bucket.push(l);
  }

  const items: Item[] = grouped.map((item) => {
    if (item.kind === "listing") return item;
    const listings = buckets.get(item.group.id)!;
    if (listings.length === 1) return { kind: "listing", key: listings[0].id, listing: listings[0] };
    let best = listings[0];
    let minPrice: number | null = null;
    let maxPrice: number | null = null;
    const sources: Source[] = [];
    for (const l of listings) {
      if (l.score > best.score) best = l;
      if (l.price_cny != null) {
        minPrice = minPrice == null ? l.price_cny : Math.min(minPrice, l.price_cny);
        maxPrice = maxPrice == null ? l.price_cny : Math.max(maxPrice, l.price_cny);
      }
      if (!sources.includes(l.source)) sources.push(l.source);
    }
    sources.sort((a, b) => SOURCES.indexOf(a) - SOURCES.indexOf(b));
    return {
      ...item,
      listings,
      best,
      minPrice,
      maxPrice,
      sources,
      hidden: Math.max(0, item.group.size - listings.length),
    };
  });

  return {
    items:
      mode === "grouped" ? items : visible.map((l) => ({ kind: "listing", key: l.id, listing: l })),
    total: all.length,
    shown: visible.length,
    groupCount: items.length,
    sourceCounts,
    hiddenBy,
    officialCount,
    weakCutoff: weakCutoff === 101 ? 0 : weakCutoff,
    allWeak,
  };
}

export function filtersActive(f: Filters): boolean {
  return (
    f.hiddenSources.length > 0 ||
    f.minMatch != null ||
    f.verdict !== "all" ||
    f.priceMin != null ||
    f.priceMax != null ||
    f.officialOnly
  );
}
