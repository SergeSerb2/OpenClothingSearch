import type { Listing, LoginSite, Method, Stage, StatusSource, Tier } from "../api/types";

export const SOURCE_LABEL: Record<StatusSource, string> = {
  taobao: "Taobao",
  "1688": "1688",
  weidian: "Weidian",
  yupoo: "Yupoo",
  google: "Google",
};

export const METHOD_LABEL: Record<Method, string> = {
  text: "text",
  image: "image",
  lens: "lens",
  store: "store",
};

export const SITE_LABEL: Record<LoginSite, string> = {
  taobao: "Taobao",
  "1688": "1688",
  weidian: "Weidian",
  google: "Google",
};

/** Taobao listings include Tmall; show the more specific name when the link says so. */
export function listingSourceLabel(l: Pick<Listing, "source" | "url">): string {
  if (l.source === "taobao" && /(^|\.)tmall\.(com|hk)/i.test(hostOf(l.url))) return "Tmall";
  return SOURCE_LABEL[l.source];
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return "";
  }
}

export function loginSiteFor(source: StatusSource): LoginSite | null {
  return source === "yupoo" ? null : source;
}

export function isLoginSite(s: string): s is LoginSite {
  return s === "taobao" || s === "1688" || s === "weidian" || s === "google";
}

export function siteLabel(site: string): string {
  return isLoginSite(site) ? SITE_LABEL[site] : site;
}

export const STAGES: { key: Exclude<Stage, "done">; label: string }[] = [
  { key: "queries", label: "Search terms" },
  { key: "references", label: "Reference photos" },
  { key: "searching", label: "Searching" },
  { key: "ranking", label: "Ranking" },
  { key: "verifying", label: "AI check" },
];

/** Uses the backend tier; falls back to score bands if a listing has none. */
export function tierOf(l: Pick<Listing, "tier" | "score">): Tier {
  if (l.tier) return l.tier;
  if (l.score >= 0.85) return "exact";
  if (l.score >= 0.7) return "close";
  if (l.score >= 0.5) return "similar";
  return "weak";
}

export const TIER_LABEL: Record<Tier, string> = {
  exact: "Exact match",
  close: "Close match",
  similar: "Similar",
  weak: "Weak match",
};

export const API_KEYS = [
  {
    id: "serper",
    name: "Serper",
    env: "SERPER_API_KEY",
    url: "https://serper.dev/api-keys",
    about: "Google Images, Google Lens and site search. Finds Yupoo and Weidian pages. 2,500 free searches.",
  },
  {
    id: "serpapi",
    name: "SerpApi",
    env: "SERPAPI_API_KEY",
    url: "https://serpapi.com/manage-api-key",
    about: "The same Google searches; used when Serper fails. 250 free searches a month.",
  },
  {
    id: "apify",
    name: "Apify",
    env: "APIFY_TOKEN",
    url: "https://console.apify.com/settings/integrations",
    about: "Photo search on 1688. About $0.015 a search, from Apify's $5 free monthly credit.",
  },
  {
    id: "qualitly",
    name: "Qualit.ly",
    env: "QUALITLY_API_KEY",
    url: "https://qualit.ly",
    about: "Extra Weidian, Taobao and 1688 listings with QC photos. Free plan: 5 results a query.",
  },
] as const;
