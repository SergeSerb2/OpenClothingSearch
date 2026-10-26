# Backend API

The backend is a FastAPI app on `http://127.0.0.1:8790`. All routes are under `/api`.
In development, the Vite dev server proxies `/api` to it.

The app has no login, so the server only takes requests from its own pages:

- The `Host` header must be `localhost`, `127.0.0.1` or `::1` (plus `FINDER_ALLOWED_HOSTS`).
  This stops DNS rebinding.
- A `POST`/`PUT` with an `Origin` header must come from the same origin, or from the Vite
  dev or preview server (`localhost:5173`, `localhost:4173`). Other origins get `403`.
- With `FINDER_PASSWORD` set, requests through a non-loopback host name (or every request,
  with `FINDER_AUTH=all`) need the `finder_session` cookie. Without it, `/api/*` answers
  `401` and pages redirect to `/login?next=...`. `GET /login` shows the form, `POST /login`
  (form fields `password`, `next`) sets the cookie (30 days), `POST /api/auth/logout`
  clears it. `Status.auth` is true when the request needed the password.
- In a cloud deployment, the gate (`python -m finder.gate`) answers `/login`,
  `/api/auth/logout` and the icon itself, and forwards other requests to
  `FINDER_UPSTREAM` only with a valid cookie. While the app machine starts, `GET` requests
  wait up to 60 s; other requests get `503`.

## Types

```ts
type Source = "taobao" | "1688" | "weidian" | "yupoo";   // "taobao" includes Tmall
type Method = "text" | "image" | "lens" | "store";        // how a listing was found

interface RefImage {
  key: string;          // image cache key; the image is at /api/img/{key}
  url: string;          // original image URL, or "upload"
  title: string;
  page: string;         // page the image came from
  selected: boolean;    // used for ranking
  consensus: number;    // 0..1, agreement with the other reference photos
}

interface SourceStatus {
  source: Source | "google";
  method: Method;
  provider: string;     // "browser", "serper", "apify", "qualitly", "store-index", ...
  state: "pending" | "running" | "done" | "error" | "needs_login" | "needs_key" | "skipped";
                        // needs_login also covers a slider check: the user solves it in the login window
  count: number;        // listings found
  message: string;      // short human text, for example "Log in to Taobao to search it"
}

interface Listing {
  id: string;           // "{source}:{native_id}", stable
  source: Source;
  native_id: string;
  url: string;          // original marketplace / Yupoo album link
  title: string;        // usually Chinese
  image_url: string;    // original image URL (may block hotlinking; prefer image_key)
  image_key: string | null;  // /api/img/{image_key}
  price_cny: number | null;  // Yupoo: read from the album title ("【110Y】", "￥260") when present
  shop: string | null;
  sales: string | null; // free text, for example "1000+人付款"
  found_by: Method[];
  via: string[];        // providers
  image_score: number;  // raw cosine similarity to the best reference photo, about 0.2..1
  text_score: number;   // 0..1 keyword overlap with the generated queries
  score: number;        // 0..1 combined ranking score, mostly image
  tier: "exact" | "close" | "similar" | "weak";
  verdict: "same" | "variant" | "different" | null;  // AI check of top results, null = not checked
  verdict_note: string;
  group: number;        // group id, -1 = none
  extra_keys: string[]; // more photos of the item (Yupoo album photos), /api/img/{key}
  match_key: string | null;  // the photo that matched the reference best (image_key or one of extra_keys)
  albums: string[];     // for buy links found in Yupoo albums: listing ids of those albums ("yupoo:store/123")
}

// A group is one product. Listings join a group when their best photos are near-identical,
// when their titles name the same style code (and their image scores are close), or when a
// listing is the buy link of a Yupoo album. Every listing with a photo is in exactly one
// group, so most groups have size 1.
interface Group {
  id: number;
  listing_ids: string[];  // sorted best first
  best_id: string;
  size: number;
  min_price: number | null;
  max_price: number | null;
  sources: Source[];
  score: number;          // best listing score
}

interface Snapshot {
  id: string;
  query: string;
  created: number;        // unix seconds
  status: "running" | "done" | "error";
  stage: Stage;
  error: string | null;
  queries: { zh: string[]; en: string[]; codes: string[]; category: string } | null;
  ref_provider: string | null;   // "bing", "google (serper)", ...
  references: RefImage[];
  sources: SourceStatus[];
  listings: Listing[];    // sorted by score, best first
  groups: Group[];        // sorted by score, best first
  upload_keys: string[];  // photos the user uploaded for this search
}

type Stage = "queries" | "references" | "searching" | "ranking" | "verifying" | "done";
```

## Routes

| Method | Path | Body | Returns |
|---|---|---|---|
| POST | `/api/upload` | multipart `file` | `{ key }` |
| POST | `/api/search` | `{ query: string, upload_keys?: string[], sources?: Source[] }` | `{ id }` (`422` for an unknown source or a bad key) |
| GET | `/api/search/{id}` | | `Snapshot` |
| GET | `/api/search/{id}/events` | | SSE stream, see below |
| POST | `/api/search/{id}/references` | `{ selected: string[] }` (ref keys) | `Snapshot` (re-ranked) |
| GET | `/api/history` | | `{ id, query, summary, options, created, status, count, thumb_key }[]` (newest first by `created`, includes running searches; `count` = listings with a photo, like the snapshot) |
| GET | `/api/img/{key}` | | `image/jpeg` |
| GET | `/api/status` | | `Status` |
| POST | `/api/login/{site}` | site = `taobao`, `1688`, `weidian`, `google` | `Status` (opens a visible browser window) |
| POST | `/api/login/done` | | `Status` (closes it) |
| PUT | `/api/yupoo-stores` | `{ stores: string[] }` | `Status` |
| POST | `/api/translate` | `{ texts: string[] }` (at most 100) | `{ translations: Record<string, string> }`, see below |
| GET | `/api/rates` | | `{ rates: Record<string, number>, updated, source }`: 1 CNY in other currencies, see below |
| POST | `/api/ai/test` | `AiConfig` | `AiTestResult` (does not save) |
| PUT | `/api/ai` | `AiConfig` | `Status` (writes `.env`) |
| PUT | `/api/keys` | `{ serper?, serpapi?, apify?, qualitly?: string }` | `Status` (writes `.env`; `""` removes a key) |

`query` can be empty when `upload_keys` is given (search by photo only). Upload keys are
the 40-character keys that `/api/upload` returns. Uploads larger than 15 MB get `413`.

```ts
interface Status {
  llm: boolean;                                  // AI available
  keys: { serper: boolean; serpapi: boolean; qualitly: boolean; apify: boolean };
  keys_env: { serper: boolean; ... };            // the key comes from the shell environment, not .env
  ai: AiStatus;
  providers: AiProvider[];                       // presets for the Settings page
  logins: { taobao: boolean; "1688": boolean; weidian: boolean; google: boolean };
  login_open: string | null;                     // site whose login window is open
  yupoo_stores: string[];                        // store subdomains, e.g. "philanthropist"
}
```

## SSE events (`/api/search/{id}/events`)

Each message has an `event:` name and a JSON `data:` payload. The stream ends after `done` or `error`.
A client that connects late first receives one `snapshot` event with the full state.
The `error` event name is the same as the browser's own EventSource connection error; tell them
apart by the `data` payload (the backend's `error` always has one).
`POST /references` re-ranks the current listings; a search must be finished first (409 otherwise).

| event | data |
|---|---|
| `snapshot` | `Snapshot` |
| `stage` | `{ stage: Stage, message: string }` |
| `queries` | `Snapshot["queries"]` |
| `references` | `{ provider: string, references: RefImage[] }` |
| `source` | `SourceStatus` (replace the entry with the same `source`+`method`+`provider`) |
| `results` | `{ listings: Listing[], groups: Group[] }` (full replacement, sent at most about once a second) |
| `done` | `{ elapsed_ms: number }` |
| `error` | `{ message: string }` |

## Clothing features (v2)

These additions help find clothes. The AI turns options, brands and styles into the search terms
that Chinese sellers use. Everything below is additive; old clients keep working.

### Search options

```ts
type Mode = "exact" | "similar" | "alternatives";
// exact        = this exact product (default, the v1 behavior)
// similar      = the same kind of item and look (style search, no single product)
// alternatives = the same look for less: unbranded / other brands, ranked by look and price

interface SearchOptions {
  mode?: Mode;
  category?: string;        // Category.id, e.g. "hoodie"
  gender?: "men" | "women" | "unisex";
  colors?: string[];        // Color.id
  fit?: string;             // Fit.id, e.g. "oversized"
  materials?: string[];     // Material.id, e.g. "heavyweight-cotton"
  season?: "spring" | "summer" | "autumn" | "winter";
  size?: string;            // free text, e.g. "L", "EU 43", "32x32"
  brands?: string[];        // Brand.id
  styles?: string[];        // Style.id
  price_min?: number;       // CNY
  price_max?: number;       // CNY
  official_only?: boolean;  // keep only official / flagship stores (Tmall, brand stores)
  notes?: string;           // free-text wishes, e.g. "no big logo, with a hood"
}
```

`POST /api/search` accepts `options?: SearchOptions`. `query` may be empty when `options` has a
category, a brand or a style (the AI writes the search terms; `Snapshot.query` then holds a short
title built from the options, for example "grey hoodie").
The backend does not filter by `price_min`/`price_max`: they guide the AI and the UI's price filter.
Unknown `/api/...` routes return a JSON 404. `Snapshot` gets two more fields:

```ts
interface Snapshot {
  // ...v1 fields...
  options: SearchOptions;            // as sent ({} for v1 searches)
  queries: Queries | null;           // v1 shape plus the fields below
}
interface Queries {
  zh: string[]; en: string[]; codes: string[]; category: string;  // v1
  summary: string;      // one line: what the AI understood, e.g. "Boxy heavyweight grey hoodie, no logo, under ¥250"
  avoid: string[];      // words that mark a wrong listing (titles with them rank lower), e.g. ["童装", "kids"]
  size_tip: string;     // size advice from the user's profile, "" when none
}
```

Default sources: Yupoo is searched only in `exact` mode or when `options.brands` is set (its stores
list branded products); pass `sources` to override.

In `similar` and `alternatives` mode the AI check judges the look, not the exact product:
`verdict: "same"` then means "matches the look".

`Listing` gets `avoid_hit: boolean`: the title has one of `Queries.avoid` (it ranks lower).
`Listing` gets `branded: boolean`: in `alternatives` mode, the AI check saw the original brand's logo,
name or nickname on the listing (a copy, not an alternative). It ranks lower, like `avoid_hit`.
In `alternatives` mode the backend also adds the brand's seller names and common copy markers to
`Queries.avoid`.
`Listing` gets `official: boolean`: the shop is an official or flagship store (Tmall flagship,
`官方旗舰店`, brand store). With `official_only`, the backend still returns every listing; the UI
filters on this field so the user can switch it off without searching again.

### Catalog

`GET /api/catalog` returns static data for pickers and presets:

```ts
interface Catalog {
  categories: Category[];
  brands: Brand[];
  styles: Style[];
  colors: Color[];
  fits: Named[];
  materials: Named[];
}
interface Named { id: string; name: string; zh: string }
interface Category extends Named {
  group: "tops" | "outerwear" | "bottoms" | "shoes" | "bags" | "accessories";
}
interface Color extends Named { hex: string }
interface Brand {
  id: string;            // "arcteryx"
  name: string;          // "Arc'teryx"
  zh: string[];          // Chinese names sellers use, e.g. ["始祖鸟", "始祖鳥"]
  aliases: string[];     // other Latin spellings, e.g. ["arcteryx", "arc teryx"]
  tags: string[];        // "streetwear" | "luxury" | "sportswear" | "outdoor" | "workwear" | "denim" |
                         // "basics" | "japanese" | "korean" | "chinese" | "designer" | "skate" | "techwear"
  price_tier: 1 | 2 | 3 | 4;   // 1 = budget, 4 = luxury
  categories: string[];  // Category.id the brand is known for
}
interface Style {
  id: string;            // "gorpcore"
  name: string;          // "Gorpcore"
  zh: string[];          // Chinese style words sellers use, e.g. ["山系", "户外机能"]
  description: string;   // one sentence
  categories: string[];  // typical Category.id
  brands: string[];      // typical Brand.id
  colors: string[];      // typical Color.id
  materials: string[];   // typical Material.id
  image_query: string;   // English image-search query for a reference outfit photo
}
```

### Profile

The profile makes the AI personal (sizes, gender, budget, taste). It is stored in `data/profile.json`.

```ts
interface Profile {
  gender: "men" | "women" | "unisex" | null;
  height_cm: number | null;
  weight_kg: number | null;
  sizes: { top: string; bottom: string; shoe: string };   // the user's usual sizes, "" = unknown
  budget_cny: number | null;     // typical max price per item
  brands: string[];              // favorite Brand.id
  styles: string[];              // favorite Style.id
}
```

| Method | Path | Body | Returns |
|---|---|---|---|
| GET | `/api/catalog` | | `Catalog` |
| GET | `/api/profile` | | `Profile` |
| PUT | `/api/profile` | `Profile` | `Profile` |
| POST | `/api/look` | `{ upload_key: string }` | `Look` |
| POST | `/api/suggest` | `SuggestRequest` | `Suggestions` |

`Status` gets `profile: Profile`.

### Shop the look

`POST /api/look` takes an uploaded outfit photo (for example a street-style or Pinterest photo).
The AI finds each clothing item in it. The backend crops each item into its own photo.

```ts
interface Look {
  upload_key: string;
  items: LookItem[];
}
interface LookItem {
  label: string;         // "Charcoal oversized hoodie"
  category: string;      // Category.id
  query: string;         // English search query
  colors: string[];      // Color.id
  crop_key: string | null;   // cropped photo of the item (/api/img/{key}); null if the crop failed
  box: [number, number, number, number];  // x0, y0, x1, y1 as fractions 0..1 of the photo
}
```

When the photo shows no clothing, the reply is `200` with `items: []`.

The UI then starts one normal search per chosen item:
`POST /api/search { query: item.query, upload_keys: [item.crop_key], options: { mode: "similar", category, colors } }`.

### Suggestions (AI stylist)

`POST /api/suggest` asks the AI for concrete items to search. It covers:
- "Complete the look": give an `anchor` (a search or a query); the AI suggests pieces that go with it.
- "Style starter kit": give `styles`; the AI suggests the key pieces of that style.
- "Ideas": give `notes` only, for example "outfit for a rainy week in London, under ¥800 total".

```ts
interface SuggestRequest {
  anchor?: { search_id?: string; query?: string };
  styles?: string[];      // Style.id
  notes?: string;
  count?: number;         // default 6, max 10
}
interface Suggestions {
  title: string;          // "Gorpcore starter kit"
  items: SuggestItem[];
}
interface SuggestItem {
  label: string;          // "Shell jacket in olive"
  why: string;            // one short sentence
  query: string;          // English search query
  options: SearchOptions; // ready to pass to POST /api/search
}
```

The profile (gender, sizes, budget, favorite brands and styles) is applied to suggestions and plans.

## Translation

`POST /api/translate` gives English for Chinese text: listing titles, shop names, sales counts,
search terms and avoid words. The web app shows the English and keeps the Chinese in the tooltip.

- `translations` is keyed by each text exactly as sent. Texts with no Chinese, texts longer than
  300 characters, and texts the AI did not translate are left out; show those as they are.
- Sales counts such as `1000+人付款` are translated by rules, with no AI call.
- Translations are saved in `data/translations.sqlite`, so each text costs one AI call once.
  The backend sends 25 texts per AI call, with thinking turned off (about 5 s per call).
- A text the AI did not translate is tried again after 10 minutes.
- Without the AI (`Status.llm` is false), only the rule-based texts are translated.

## AI provider settings

The AI is any OpenAI-compatible chat API. `server/finder/llm.py` adapts to provider
differences on the first error and remembers them: `max_tokens` vs
`max_completion_tokens`, unsupported `reasoning_effort` values, lower token limits, and
models that cannot read photos (photo features then turn off).

```ts
interface AiProvider {
  id: string;            // "openai", "gemini", "anthropic", "openrouter", "ollama", "lmstudio", "deepseek", "custom"
  name: string;
  base_url: string;      // preset URL ("" for custom)
  model: string;         // a suggested model; the test lists the real ones
  needs_key: boolean;
  key_url: string;       // where to get a key (or download the app)
  note: string;
}
interface AiStatus {
  provider: string;
  base_url: string;
  model: string;
  key_set: boolean;      // the key itself is never returned
  key_env: boolean;      // the key comes from the shell environment
  vision: boolean;       // photos are sent to the AI
  vision_setting: string; // "auto" or "off"
}
interface AiConfig {
  provider: string;
  base_url: string;      // http(s), no query or fragment
  model: string;
  api_key: string | null; // null keeps the saved key, but only for the same base_url
  vision: "auto" | "off";
}
interface AiTestResult {
  models: string[];                 // from GET {base_url}/models, when the provider lists them
  models_error: string | null;
  chat: { ok: boolean; ms?: number; sample?: string; error?: string };
  vision: { ok: boolean; unsupported?: boolean; error?: string };
                       // a test photo: does the model see red? unsupported: it cannot read photos
                       // (a timeout or rate limit leaves it false)
}
```

A saved key is never sent to another base URL. Saving a new base URL without a key clears
the key; if the shell environment sets `LLM_API_KEY`, the app writes `LLM_API_KEY=""` so
that key is not used either.

## Exchange rates

`GET /api/rates` gives approximate rates from CNY for display ("≈ $12"). It uses
ExchangeRate-API's free endpoint, caches the result in `data/rates.json` for 12 hours,
and falls back to built-in rates when offline (`source: "built-in"`).
