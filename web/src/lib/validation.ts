import type { Box, Look, SearchOptions } from "../api/types";

export function isRecord(v: unknown): v is Record<string, unknown> {
  return v != null && typeof v === "object" && !Array.isArray(v);
}

export function isStrings(v: unknown): v is string[] {
  return Array.isArray(v) && v.every((s) => typeof s === "string");
}

export function isBox(v: unknown): v is Box {
  return Array.isArray(v) && v.length === 4 && v.every((n) => typeof n === "number" && Number.isFinite(n) && n >= 0 && n <= 1) && v[0] < v[2] && v[1] < v[3];
}

export function isOptions(v: unknown): v is SearchOptions {
  if (!isRecord(v)) return false;
  for (const k of ["category", "fit", "size", "notes"]) if (v[k] !== undefined && typeof v[k] !== "string") return false;
  for (const k of ["colors", "materials", "brands", "styles"]) if (v[k] !== undefined && !isStrings(v[k])) return false;
  for (const k of ["price_min", "price_max"]) if (v[k] !== undefined && (typeof v[k] !== "number" || !Number.isFinite(v[k]))) return false;
  return (v.mode === undefined || ["exact", "similar", "alternatives"].includes(String(v.mode))) &&
    (v.gender === undefined || ["men", "women", "unisex"].includes(String(v.gender))) &&
    (v.season === undefined || ["spring", "summer", "autumn", "winter"].includes(String(v.season))) &&
    (v.official_only === undefined || typeof v.official_only === "boolean");
}

export function isLook(v: unknown, key: string): v is Look {
  return isRecord(v) && v.upload_key === key && Array.isArray(v.items) && v.items.every((i) =>
    isRecord(i) && typeof i.label === "string" && typeof i.category === "string" && typeof i.query === "string" &&
    isStrings(i.colors) && (i.crop_key === null || typeof i.crop_key === "string") && isBox(i.box));
}
