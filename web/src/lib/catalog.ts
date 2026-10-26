import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { Api } from "../api/client";
import type { Brand, Catalog, Category, CategoryGroup, Color, Named, Style } from "../api/types";

export interface CatalogIndex {
  catalog: Catalog;
  category: Map<string, Category>;
  brand: Map<string, Brand>;
  style: Map<string, Style>;
  color: Map<string, Color>;
  fit: Map<string, Named>;
  material: Map<string, Named>;
  tags: string[];
}

export interface CatalogState {
  index: CatalogIndex | null;
  error: string | null;
  loading: boolean;
  reload: () => void;
}

export const CatalogContext = createContext<CatalogState>({ index: null, error: null, loading: false, reload: () => undefined });

export function useCatalog(): CatalogState {
  return useContext(CatalogContext);
}

function indexOf(catalog: Catalog): CatalogIndex {
  const map = <T extends { id: string }>(list: T[]) => new Map(list.map((x) => [x.id, x]));
  const tags = [...new Set(catalog.brands.flatMap((b) => b.tags))];
  return {
    catalog,
    category: map(catalog.categories),
    brand: map(catalog.brands),
    style: map(catalog.styles),
    color: map(catalog.colors),
    fit: map(catalog.fits),
    material: map(catalog.materials),
    tags: TAG_ORDER.filter((t) => tags.includes(t)).concat(tags.filter((t) => !TAG_ORDER.includes(t))),
  };
}

const TAG_ORDER = [
  "streetwear",
  "outdoor",
  "sportswear",
  "basics",
  "workwear",
  "techwear",
  "designer",
  "luxury",
  "japanese",
  "korean",
  "chinese",
  "denim",
  "skate",
];

export function useCatalogLoader(api: Api): CatalogState {
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api
      .catalog()
      .then((c) => {
        if (cancelled) return;
        setCatalog(c);
        setError(null);
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [api, attempt]);

  const index = useMemo(() => (catalog ? indexOf(catalog) : null), [catalog]);
  const reload = useCallback(() => setAttempt((n) => n + 1), []);
  return { index, error, loading, reload };
}

export const GROUP_LABEL: Record<CategoryGroup, string> = {
  tops: "Tops",
  outerwear: "Outerwear",
  bottoms: "Bottoms",
  shoes: "Shoes",
  bags: "Bags",
  accessories: "Accessories",
};

export const GROUP_ORDER: CategoryGroup[] = ["tops", "outerwear", "bottoms", "shoes", "bags", "accessories"];

function norm(s: string): string {
  return s
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9一-鿿]+/g, "");
}

/** Matches a brand by name, alias or Chinese name. Lower rank = better match. */
export function brandRank(b: Brand, query: string): number | null {
  const q = norm(query);
  if (!q) return 50;
  const names = [b.name, ...b.aliases, ...b.zh].map(norm);
  if (names.some((n) => n === q)) return 0;
  if (names.some((n) => n.startsWith(q))) return 1;
  if (names.some((n) => n.includes(q))) return 2;
  return null;
}

export function searchBrands(brands: Brand[], query: string, tag: string | null, exclude: string[] = []): Brand[] {
  return brands
    .filter((b) => !exclude.includes(b.id) && (!tag || b.tags.includes(tag)))
    .map((b) => ({ b, r: brandRank(b, query) }))
    .filter((x): x is { b: Brand; r: number } => x.r != null)
    .sort((x, y) => x.r - y.r || x.b.name.localeCompare(y.b.name))
    .map((x) => x.b);
}

export const PRICE_TIER = ["", "¥", "¥¥", "¥¥¥", "¥¥¥¥"];

const CJK = /[\u3400-\u9fff]/;

/** First Chinese name of a brand (some catalog "zh" entries are Latin spellings). */
export function zhName(b: Brand): string | undefined {
  return b.zh.find((z) => CJK.test(z));
}

/** Picks black or white text for a swatch background. */
export function inkFor(hex: string): string {
  const n = parseInt(hex.replace("#", ""), 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return 0.299 * r + 0.587 * g + 0.114 * b > 150 ? "#111" : "#fff";
}
