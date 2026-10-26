/**
 * Prices are in yuan (CNY). This module adds an approximate price in the user's own
 * currency. The currency is a setting (localStorage); rates come from GET /api/rates.
 */
import { useEffect, useSyncExternalStore } from "react";
import { readStorage, writeStorage } from "./storage";
import type { Api } from "../api/client";
import { useApi } from "../api/context";

export const CURRENCIES = [
  "USD", "EUR", "GBP", "CAD", "AUD", "NZD", "CHF", "SEK", "NOK", "DKK", "PLN",
  "JPY", "KRW", "SGD", "HKD", "INR", "MXN", "BRL",
] as const;
export type Currency = (typeof CURRENCIES)[number] | "none";

const KEY = "currency";
const EURO = /^(de|fr|es|it|nl|pt-PT|fi|el|sk|sl|et|lv|lt|ga|mt)\b/;
const BY_REGION: Record<string, Currency> = {
  US: "USD", CA: "CAD", GB: "GBP", AU: "AUD", NZ: "NZD", CH: "CHF", SE: "SEK", NO: "NOK",
  DK: "DKK", PL: "PLN", JP: "JPY", KR: "KRW", SG: "SGD", HK: "HKD", IN: "INR", MX: "MXN", BR: "BRL",
};

function guess(): Currency {
  const lang = navigator.language || "en-US";
  const region = lang.split("-")[1]?.toUpperCase();
  if (region && BY_REGION[region]) return BY_REGION[region];
  if (EURO.test(lang)) return "EUR";
  return "USD";
}

function stored(): Currency {
  const v = readStorage(KEY);
  return v === "none" || (CURRENCIES as readonly string[]).includes(v ?? "") ? (v as Currency) : guess();
}

let currency: Currency = stored();
let rates: Record<string, number> | null = null;
let loading = false;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

export function setCurrency(c: Currency) {
  currency = c;
  writeStorage(KEY, c);
  notify();
}

function load(api: Api) {
  if (rates || loading) return;
  loading = true;
  api
    .rates()
    .then((r) => {
      rates = r.rates;
      notify();
    })
    .catch(() => undefined)
    .finally(() => {
      loading = false;
    });
}

const formats = new Map<string, Intl.NumberFormat>();
function fmt(c: string, whole: boolean): Intl.NumberFormat {
  const k = `${c}:${whole}`;
  let f = formats.get(k);
  if (!f) {
    // JPY's symbol is ¥, like the yuan, so show its code instead.
    f = new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: c,
      currencyDisplay: c === "JPY" ? "code" : "symbol",
      minimumFractionDigits: 0,
      maximumFractionDigits: whole ? 0 : 2,
    });
    formats.set(k, f);
  }
  return f;
}

export interface Money {
  currency: Currency;
  /** "≈ $12", or "" when no currency is chosen or the rate is not known yet. */
  local(cny: number): string;
  localRange(min: number | null, max: number | null): string | null;
}

export function useMoney(): Money {
  const api = useApi();
  useEffect(() => load(api), [api]);
  const c = useSyncExternalStore(subscribe, () => currency);
  const rate = useSyncExternalStore(subscribe, () => (c !== "none" && rates ? rates[c] ?? 0 : 0));
  const one = (cny: number, whole: boolean) => fmt(c, whole).format(cny * rate);
  const isWhole = (cny: number) => cny * rate >= 10 || c === "JPY" || c === "KRW";
  return {
    currency: c,
    local(cny) {
      return rate ? `≈ ${one(cny, isWhole(cny))}` : "";
    },
    localRange(min, max) {
      if (!rate || (min == null && max == null)) return null;
      if (min == null || max == null) return `≈ ${one((min ?? max)!, isWhole((min ?? max)!))}`;
      const whole = isWhole(max);
      const a = one(min, whole);
      const b = one(max, whole);
      return a === b ? `≈ ${a}` : `≈ ${a}–${b}`;
    },
  };
}

/** The chosen currency, for the Settings select. */
export function useCurrency(): Currency {
  return useSyncExternalStore(subscribe, () => currency);
}
