// Mirrors docs/API.md. Keep in sync with the backend contract.

export type Source = "taobao" | "1688" | "weidian" | "yupoo"; // "taobao" includes Tmall
export type Method = "text" | "image" | "lens" | "store";
export type StatusSource = Source | "google";
export type LoginSite = "taobao" | "1688" | "weidian" | "google";

export const SOURCES: Source[] = ["taobao", "1688", "weidian", "yupoo"];
export const LOGIN_SITES: LoginSite[] = ["taobao", "1688", "weidian", "google"];

export interface RefImage {
  key: string;
  url: string; // original image URL, or "upload"
  title: string;
  page: string;
  selected: boolean;
  consensus: number; // 0..1
}

export type SourceState =
  | "pending"
  | "running"
  | "done"
  | "error"
  | "needs_login"
  | "needs_key"
  | "skipped";

export interface SourceStatus {
  source: StatusSource;
  method: Method;
  provider: string;
  state: SourceState;
  count: number;
  message: string;
}

export type Tier = "exact" | "close" | "similar" | "weak";
export type Verdict = "same" | "variant" | "different";

export interface Listing {
  id: string;
  source: Source;
  native_id: string;
  url: string;
  title: string;
  image_url: string;
  image_key: string | null;
  price_cny: number | null;
  shop: string | null;
  sales: string | null;
  found_by: Method[];
  via: string[];
  image_score: number;
  text_score: number;
  score: number;
  tier: Tier;
  verdict: Verdict | null;
  verdict_note: string;
  group: number; // -1 = none
  extra_keys: string[]; // more photos of the item (Yupoo album photos)
  match_key: string | null; // photo that matched the references best; prefer for thumbnails
  albums: string[]; // for buy links found in Yupoo albums: ids of the albums that link here
  /** v2: official or flagship store. Missing on v1 data. */
  official?: boolean;
  /** v2: the title has one of Queries.avoid (ranks lower). */
  avoid_hit?: boolean;
  /** v2, alternatives mode: the AI saw the original brand's logo or name, so it is a copy. */
  branded?: boolean;
}

export interface Group {
  id: number;
  listing_ids: string[];
  best_id: string;
  size: number;
  min_price: number | null;
  max_price: number | null;
  sources: Source[];
  score: number;
}

export type Stage = "queries" | "references" | "searching" | "ranking" | "verifying" | "done";

export interface Queries {
  zh: string[];
  en: string[];
  codes: string[];
  category: string;
  /** v2: one line, what the AI understood. */
  summary?: string;
  /** v2: words that mark a wrong listing. */
  avoid?: string[];
  /** v2: size advice from the profile, "" when none. */
  size_tip?: string;
}

export interface Snapshot {
  id: string;
  query: string;
  created: number; // unix seconds
  status: "running" | "done" | "error";
  stage: Stage;
  error: string | null;
  queries: Queries | null;
  ref_provider: string | null;
  references: RefImage[];
  sources: SourceStatus[];
  listings: Listing[];
  groups: Group[];
  upload_keys: string[]; // photos the user uploaded for this search
  /** v2: options as sent ({} for v1 searches). */
  options?: SearchOptions;
}

export interface HistoryItem {
  id: string;
  query: string;
  /** The AI's one-line plan, and the options: to name the search like the results page does. */
  summary?: string;
  options?: SearchOptions;
  created: number;
  status: "running" | "done" | "error";
  count: number;
  thumb_key: string | null;
}

export interface AiProvider {
  id: string;
  name: string;
  base_url: string;
  model: string;
  needs_key: boolean;
  key_url: string;
  note: string;
}

export interface AiStatus {
  provider: string;
  base_url: string;
  model: string;
  key_set: boolean;
  /** The key comes from the shell environment, not .env. */
  key_env?: boolean;
  /** The model reads photos (false after it refused one, or when turned off). */
  vision: boolean;
  vision_setting: string;
}

export interface AiConfig {
  provider: string;
  base_url: string;
  model: string;
  /** null keeps the saved key (only for the same base URL); "" removes it. */
  api_key: string | null;
  vision: "auto" | "off";
}

export interface AiTestResult {
  models: string[];
  models_error: string | null;
  chat: { ok: boolean; ms?: number; sample?: string; error?: string };
  /** unsupported: the model cannot read photos (not a timeout or rate limit). */
  vision: { ok: boolean; unsupported?: boolean; error?: string };
}

export type KeyId = "serper" | "serpapi" | "qualitly" | "apify";

export interface Status {
  llm: boolean;
  keys: Record<KeyId, boolean>;
  /** Keys set in the shell environment; the app cannot remove them. */
  keys_env?: Record<KeyId, boolean>;
  ai?: AiStatus;
  providers?: AiProvider[];
  /** This page is behind the app's password (remote access): show Log out. */
  auth?: boolean;
  logins: Record<LoginSite, boolean>;
  login_open: string | null;
  yupoo_stores: string[];
  /** v2 */
  profile?: Profile;
}

export interface SearchBody {
  query: string;
  upload_keys?: string[];
  sources?: Source[];
  options?: SearchOptions;
}

// ---------------------------------------------------------------- v2: clothing

export type Mode = "exact" | "similar" | "alternatives";
export type Gender = "men" | "women" | "unisex";
export type Season = "spring" | "summer" | "autumn" | "winter";

export interface SearchOptions {
  mode?: Mode;
  category?: string;
  gender?: Gender;
  colors?: string[];
  fit?: string;
  materials?: string[];
  season?: Season;
  size?: string;
  brands?: string[];
  styles?: string[];
  price_min?: number;
  price_max?: number;
  official_only?: boolean;
  notes?: string;
}

export interface Named {
  id: string;
  name: string;
  zh: string;
}

export type CategoryGroup = "tops" | "outerwear" | "bottoms" | "shoes" | "bags" | "accessories";

export interface Category extends Named {
  group: CategoryGroup;
}

export interface Color extends Named {
  hex: string;
}

export interface Brand {
  id: string;
  name: string;
  zh: string[];
  aliases: string[];
  tags: string[];
  price_tier: 1 | 2 | 3 | 4;
  categories: string[];
}

export interface Style {
  id: string;
  name: string;
  zh: string[];
  description: string;
  categories: string[];
  brands: string[];
  colors: string[];
  materials: string[];
  image_query: string;
}

export interface Catalog {
  categories: Category[];
  brands: Brand[];
  styles: Style[];
  colors: Color[];
  fits: Named[];
  materials: Named[];
}

export interface Profile {
  gender: Gender | null;
  height_cm: number | null;
  weight_kg: number | null;
  sizes: { top: string; bottom: string; shoe: string };
  budget_cny: number | null;
  brands: string[];
  styles: string[];
}

export type Box = [number, number, number, number];

export interface LookItem {
  label: string;
  category: string;
  query: string;
  colors: string[];
  crop_key: string | null;
  box: Box;
}

export interface Look {
  upload_key: string;
  items: LookItem[];
}

export interface SuggestRequest {
  anchor?: { search_id?: string; query?: string };
  styles?: string[];
  notes?: string;
  count?: number;
}

export interface SuggestItem {
  label: string;
  why: string;
  query: string;
  options: SearchOptions;
}

export interface Suggestions {
  title: string;
  items: SuggestItem[];
}

/** One SSE message from /api/search/{id}/events. */
export type SearchEvent =
  | { type: "snapshot"; data: Snapshot }
  | { type: "stage"; data: { stage: Stage; message: string } }
  | { type: "queries"; data: Queries | null }
  | { type: "references"; data: { provider: string; references: RefImage[] } }
  | { type: "source"; data: SourceStatus }
  | { type: "results"; data: { listings: Listing[]; groups: Group[] } }
  | { type: "done"; data: { elapsed_ms: number } }
  | { type: "error"; data: { message: string } };

export type SearchEventType = SearchEvent["type"];

export const EVENT_TYPES: SearchEventType[] = [
  "snapshot",
  "stage",
  "queries",
  "references",
  "source",
  "results",
  "done",
  "error",
];

/** Connection state reported by the event transport (not part of the contract). */
export type StreamState = "connecting" | "open" | "reconnecting" | "closed";
