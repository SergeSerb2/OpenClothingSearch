/**
 * In-browser stand-in for the backend, used with `?mock=1`. It keeps per-search state like
 * the real server and replays the fixture as SSE-shaped events, which the UI feeds through
 * the same reducer (lib/searchState.ts) as the real EventSource stream.
 */
import type { Api, EventHandlers } from "../api/client";
import { ApiError } from "../api/client";
import type { AiProvider, HistoryItem, LoginSite, Profile, RefImage, SearchEvent, SearchOptions, Snapshot, Source, SourceStatus, Status } from "../api/types";
import { MOCK_SESSION } from "../lib/mockSession";
import { applyEvent, emptySnapshot, fromSnapshot, type LiveSearch } from "../lib/searchState";
import {
  QUERIES,
  REF_PROVIDER,
  REFERENCES,
  countFound,
  mockImages,
  rank,
  uploadReference,
  type RefSeedList,
} from "./fixture";
import {
  CATALOG,
  MockError,
  garmentImages,
  garmentResults,
  inferCategory,
  mockLook,
  mockSuggest,
  planGarmentSearch,
  type GarmentPlan,
} from "./clothing";
import { mockEnglish } from "./mockTranslate";

type Scenario = "full" | "garment" | "empty" | "error";

interface MockSearch {
  live: LiveSearch;
  scenario: Scenario;
  refs: RefSeedList;
  arrived: number;
  taobaoImage: boolean;
  verified: boolean;
  subs: Set<(ev: SearchEvent) => void>;
  options: SearchOptions;
  sources: Source[];
  plan: GarmentPlan | null;
}

const params = new URLSearchParams(location.search);
const SPEED = Math.max(0.1, Number(params.get("speed")) || 1);

const MOCK_PROVIDERS: AiProvider[] = [
  { id: "openai", name: "OpenAI", base_url: "https://api.openai.com/v1", model: "gpt-5-mini", needs_key: true, key_url: "https://platform.openai.com/api-keys", note: "Paid, pay per use." },
  { id: "gemini", name: "Google Gemini", base_url: "https://generativelanguage.googleapis.com/v1beta/openai", model: "gemini-flash-latest", needs_key: true, key_url: "https://aistudio.google.com/apikey", note: "Has a free tier." },
  { id: "ollama", name: "Ollama (on this computer)", base_url: "http://localhost:11434/v1", model: "qwen2.5vl:7b", needs_key: false, key_url: "https://ollama.com/download", note: "Free and private." },
  { id: "deepseek", name: "DeepSeek", base_url: "https://api.deepseek.com/v1", model: "deepseek-chat", needs_key: true, key_url: "https://platform.deepseek.com/api_keys", note: "Cannot read photos." },
  { id: "custom", name: "Other (OpenAI-compatible)", base_url: "", model: "", needs_key: false, key_url: "", note: "Any OpenAI-compatible endpoint." },
];

const status: Status = {
  llm: true,
  keys: { serper: false, serpapi: true, qualitly: false, apify: false },
  logins: { taobao: false, "1688": true, weidian: true, google: false },
  login_open: null,
  yupoo_stores: ["example-store", "demo-shop", "sample-kicks", "test-gallery", "mock-outlet", "photo-album"],
  ai: { provider: "gemini", base_url: "https://generativelanguage.googleapis.com/v1beta/openai", model: "gemini-flash-latest", key_set: true, vision: true, vision_setting: "auto" },
  providers: MOCK_PROVIDERS,
  profile: {
    gender: "men",
    height_cm: 180,
    weight_kg: 76,
    sizes: { top: "L", bottom: "32", shoe: "EU 43" },
    budget_cny: 600,
    brands: ["arcteryx", "carhartt"],
    styles: ["gorpcore"],
  },
};
const uploadNames = new Map<string, string>();

const searches = new Map<string, MockSearch>();
let nextId = 1;
let nextUpload = 1;

const clone = <T,>(v: T): T => structuredClone(v);
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms / SPEED));
const delay = <T,>(value: () => T, ms = 180): Promise<T> =>
  new Promise((resolve, reject) =>
    setTimeout(() => {
      try {
        resolve(value());
      } catch (e) {
        reject(e);
      }
    }, ms),
  );

function publicRefs(refs: RefSeedList): RefImage[] {
  return refs.map(({ kind: _kind, ...r }) => r);
}

function emit(s: MockSearch, ev: SearchEvent) {
  if (ev.type === "source" && ev.data.source !== "google" && !s.sources.includes(ev.data.source)) return;
  s.live = applyEvent(s.live, ev);
  for (const sub of [...s.subs]) sub(clone(ev));
}

function ranked(s: MockSearch) {
  let out;
  if (s.plan) {
    const outliers = s.plan.refs.filter((r) => r.outlier && s.refs.find((x) => x.key === r.key)?.selected).map((r) => r.colorId);
    out = garmentResults(s.plan, s.arrived, s.verified, outliers, s.options.mode);
  } else {
    out = rank({ refs: s.refs, arrived: s.arrived, taobaoImage: s.taobaoImage, verified: s.verified });
    for (const l of out.listings) l.official = /tmall\.com/.test(l.url) || /官方旗舰店/.test(l.shop ?? "");
  }
  out.listings = out.listings.filter((l) => s.sources.includes(l.source));
  const byId = new Map(out.listings.map((l) => [l.id, l]));
  out.groups = out.groups.map((g) => {
    const members = g.listing_ids.flatMap((id) => byId.has(id) ? [byId.get(id)!] : []);
    const prices = members.flatMap((l) => l.price_cny == null ? [] : [l.price_cny]);
    return {
      ...g, listing_ids: members.map((l) => l.id), size: members.length, best_id: members[0]?.id ?? "",
      score: members[0]?.score ?? 0, sources: [...new Set(members.map((l) => l.source))],
      min_price: prices.length ? Math.min(...prices) : null, max_price: prices.length ? Math.max(...prices) : null,
    };
  }).filter((g) => g.size > 0);
  return out;
}

function results(s: MockSearch): SearchEvent {
  return { type: "results", data: ranked(s) };
}

function src(
  source: SourceStatus["source"],
  method: SourceStatus["method"],
  provider: string,
  state: SourceStatus["state"],
  message = "",
  count = 0,
): SearchEvent {
  return { type: "source", data: { source, method, provider, state, count, message } };
}

function scenarioFor(query: string, options: SearchOptions): Scenario {
  const q = query.trim();
  if (/^(nothing|empty)\b/i.test(q)) return "empty";
  if (/^(fail|error)\b/i.test(q)) return "error";
  if (/dunk|panda|jordan/i.test(q)) return "full";
  const clothing = options.category || options.brands?.length || options.styles?.length || (options.mode && options.mode !== "exact");
  if (clothing || (q && inferCategory(q))) return "garment";
  return "full";
}

function createSearch(query: string, uploadKeys: string[], scenario: Scenario, created?: number, options: SearchOptions = {}, sources?: Source[]): MockSearch {
  const id = `mock${MOCK_SESSION}-${nextId++}`;
  const snap = emptySnapshot(id, query, uploadKeys);
  snap.options = options;
  if (created) snap.created = created;
  const s: MockSearch = {
    live: fromSnapshot(snap),
    scenario,
    refs: [...uploadKeys.map(uploadReference), ...clone(REFERENCES)],
    arrived: 0,
    taobaoImage: status.logins.taobao,
    verified: false,
    subs: new Set(),
    options,
    sources: sources ?? (["taobao", "1688", "weidian", ...(!options.mode || options.mode === "exact" || options.brands?.length ? ["yupoo" as const] : [])]),
    plan: null,
  };
  if (scenario === "garment") {
    const plan = planGarmentSearch({ id, query, options, profile: status.profile ?? null });
    s.plan = plan;
    s.refs = [
      ...uploadKeys.map(uploadReference),
      ...plan.refs.map((r, i) => ({
        key: r.key,
        url: `https://img.example.invalid/${r.key}.jpg`,
        title: `${r.colorId} ${plan.category.name.toLowerCase()}`,
        page: i % 2 ? "https://www.pinterest.com/pin/1234567890/" : "https://www.ssense.com/en-ca/men/product/item/123",
        selected: !r.outlier,
        consensus: r.outlier ? 0.32 : 0.9 - i * 0.04,
        kind: "panda" as const,
      })),
    ];
  }
  searches.set(id, s);
  return s;
}

/** Runs a scenario. With instant=true it completes synchronously (for seeded history). */
async function run(s: MockSearch, instant = false) {
  const step = instant ? () => undefined : wait;
  const startedAt = performance.now();
  const listingsOf = () => s.live.snapshot.listings;
  const count = (source: SourceStatus["source"], method: SourceStatus["method"]) => countFound(source, method, listingsOf());

  emit(s, { type: "stage", data: { stage: "queries", message: "Asking AI for search terms" } });
  await step(700);
  if (s.plan) {
    emit(s, { type: "queries", data: s.plan.queries });
  } else if (s.scenario === "empty") {
    emit(s, { type: "queries", data: { zh: ["克罗心 十字架 吊坠"], en: ["chrome hearts cross pendant"], codes: [], category: "jewelry", summary: "Exact product: Chrome Hearts cross pendant in silver", avoid: ["吊坠链"], size_tip: "" } });
  } else if (s.scenario === "error") {
    emit(s, { type: "queries", data: { zh: ["石头岛 幽灵系列 衬衫外套"], en: ["stone island ghost piece overshirt"], codes: [], category: "jacket" } });
  } else {
    emit(s, {
      type: "queries",
      data: {
        ...(s.live.snapshot.query ? QUERIES : { ...QUERIES, en: ["nike dunk low retro panda (from photo)", ...QUERIES.en] }),
        summary: "Exact product: Nike Dunk Low Retro in white and black (DD1391-100)",
        avoid: ["童鞋", "GS", "大童"],
        size_tip: status.profile?.sizes.shoe ? `You wear ${status.profile.sizes.shoe}. Dunks run true to size; check the foot length (脚长) in mm.` : "",
      },
    });
  }
  emit(s, { type: "stage", data: { stage: "references", message: s.plan ? "Finding reference photos of the look" : "Finding reference photos on Bing" } });
  await step(800);

  if (s.scenario === "error") {
    emit(s, { type: "error", data: { message: "Reference photo search failed: Bing returned HTTP 429 (rate limited). Try again in a minute." } });
    return;
  }

  if (s.scenario === "empty") {
    s.refs = s.refs.filter((r) => r.url === "upload");
    emit(s, { type: "references", data: { provider: REF_PROVIDER, references: publicRefs(s.refs) } });
    emit(s, { type: "stage", data: { stage: "searching", message: "Searching 6 sources" } });
    emit(s, src("taobao", "text", "browser", "needs_login", "Log in to Taobao to search it"));
    emit(s, src("taobao", "image", "browser", "needs_login", "Log in to Taobao to search by photo"));
    emit(s, src("1688", "text", "browser", "needs_login", "Log in to 1688 to search it"));
    emit(s, src("1688", "image", "apify", "needs_key", "Add an Apify key in Settings to search 1688 by photo"));
    emit(s, src("weidian", "text", "browser", "needs_login", "Log in to Weidian to search it"));
    emit(s, src("google", "lens", "serpapi", "needs_key", "Add a Serper or SerpApi key in Settings to use Google Lens"));
    await step(600);
    emit(s, { type: "stage", data: { stage: "ranking", message: "Nothing to rank" } });
    emit(s, results(s));
    emit(s, { type: "done", data: { elapsed_ms: instant ? 2140 : Math.round(performance.now() - startedAt) } });
    return;
  }

  emit(s, { type: "references", data: { provider: REF_PROVIDER, references: publicRefs(s.refs) } });
  await step(100);
  emit(s, { type: "stage", data: { stage: "searching", message: "Searching 9 sources" } });
  emit(s, src("taobao", "text", "browser", "running"));
  emit(s, s.taobaoImage ? src("taobao", "image", "browser", "running") : src("taobao", "image", "browser", "needs_login", "Log in to Taobao to search by photo"));
  emit(s, src("1688", "text", "browser", "running"));
  emit(s, status.keys.apify ? src("1688", "image", "apify", "running") : src("1688", "image", "apify", "needs_key", "Add an Apify key in Settings to search 1688 by photo"));
  emit(s, src("weidian", "text", "browser", "running"));
  emit(s, src("weidian", "image", "browser", "running"));
  const yupoo = s.sources.includes("yupoo");
  emit(s, yupoo ? src("yupoo", "store", "store-index", "running", `Searching ${status.yupoo_stores.length} stores`) : src("yupoo", "store", "store-index", "skipped", "Yupoo is searched in Exact mode or when a brand is picked"));
  emit(s, src("google", "lens", "serpapi", "running"));
  if (!s.plan) emit(s, src("google", "lens", "browser", "skipped", "Using SerpApi for Lens"));

  await step(600);
  s.arrived = 1;
  emit(s, results(s));
  emit(s, src("taobao", "text", "browser", "done", "", count("taobao", "text")));
  if (s.taobaoImage) emit(s, src("taobao", "image", "browser", "done", "", count("taobao", "image")));

  await step(400);
  s.arrived = 2;
  await step(400);
  emit(s, results(s));
  emit(s, src("1688", "text", "browser", "done", "", count("1688", "text")));
  emit(s, src("weidian", "text", "browser", "done", "", count("weidian", "text")));
  await step(300);
  emit(s, src("weidian", "image", "browser", "error", "Weidian showed a captcha page. Try again later."));
  await step(500);
  s.arrived = 3;
  emit(s, results(s));
  emit(s, src("google", "lens", "serpapi", "done", "", count("google", "lens")));
  await step(600);
  s.arrived = 4;
  emit(s, results(s));
  if (yupoo) emit(s, src("yupoo", "store", "store-index", "done", `Searched ${status.yupoo_stores.length} stores`, count("yupoo", "store")));

  await step(200);
  emit(s, { type: "stage", data: { stage: "ranking", message: `Ranking ${listingsOf().length} listings by photo` } });
  await step(400);
  emit(s, results(s));
  emit(s, { type: "stage", data: { stage: "verifying", message: s.plan && s.options.mode !== "exact" && s.options.mode ? "AI is checking which listings match the look" : "AI is checking the top 24" } });
  await step(1000);
  s.verified = true;
  emit(s, results(s));
  emit(s, { type: "done", data: { elapsed_ms: instant ? 6280 : Math.round(performance.now() - startedAt) } });
}

// Seeded history, oldest first.
{
  const now = Date.now() / 1000;
  const seed = (query: string, scenario: Scenario, ageSeconds: number, uploads: string[] = []) => {
    const s = createSearch(query, uploads, scenario, now - ageSeconds);
    void run(s, true);
  };
  mockImages["mock/upload-seed"] = mockImages["mock/s4"];
  seed("", "full", 5 * 86400, ["mock/upload-seed"]);
  seed("Stone Island ghost piece overshirt", "error", 3 * 86400);
  seed("Chrome Hearts cross pendant", "empty", 26 * 3600);
  seed("Nike Dunk Low Panda", "full", 2 * 3600);
}

function get(id: string): MockSearch {
  const s = searches.get(id);
  if (!s) throw new ApiError("Search not found", 404);
  return s;
}

export const mockApi: Api = {
  mock: true,

  async upload(file) {
    if (file.size > 15 * 1024 * 1024) throw new ApiError("photo is larger than 15 MB", 413);
    const url = URL.createObjectURL(file);
    try {
      const image = new Image();
      image.src = url;
      await image.decode();
    } catch {
      URL.revokeObjectURL(url);
      throw new ApiError("This file is not a photo the app can read. Use JPEG, PNG, WebP or HEIC.", 400);
    }
    const key = `mock/upload-${MOCK_SESSION}-${nextUpload++}`;
    mockImages[key] = url;
    uploadNames.set(key, file.name);
    return delay(() => ({ key }), 450);
  },

  search(body) {
    return delay(() => {
      const keys = body.upload_keys ?? [];
      const o = body.options ?? {};
      const hasPlanInput = !!(o.category || o.brands?.length || o.styles?.length);
      if (!body.query.trim() && keys.length === 0 && !hasPlanInput) {
        throw new ApiError("Type an item name, add a photo, or pick a category, brand or style.", 422);
      }
      const s = createSearch(body.query.trim(), keys, scenarioFor(body.query, o), undefined, o, body.sources);
      void run(s);
      return { id: s.live.snapshot.id };
    }, 150);
  },

  getSearch: (id) => delay(() => clone(get(id).live.snapshot), 220),

  events(id, { onEvent, onState }: EventHandlers) {
    let active = true;
    const s = searches.get(id);
    const sub = (ev: SearchEvent) => {
      if (!active) return;
      onEvent(ev);
      if (ev.type === "done" || ev.type === "error") close();
    };
    const close = () => {
      if (!active) return;
      active = false;
      clearTimeout(timer);
      s?.subs.delete(sub);
      onState("closed");
    };
    onState("connecting");
    const timer = setTimeout(() => {
      if (!active) return;
      if (!s) return close();
      onState("open");
      const snap: Snapshot = clone(s.live.snapshot);
      onEvent({ type: "snapshot", data: snap });
      if (snap.status !== "running") return close();
      s.subs.add(sub);
    }, 60);
    return close;
  },

  setReferences(id, selected) {
    return delay(() => {
      const s = get(id);
      if (s.live.snapshot.status === "running") throw new ApiError("Wait for the search to finish before changing references.", 409);
      const set = new Set(selected);
      if (!selected.length) throw new ApiError("Keep at least one reference photo.", 400);
      if (selected.some((key) => !s.refs.some((r) => r.key === key))) throw new ApiError("Unknown reference photo.", 400);
      s.refs = s.refs.map((r) => ({ ...r, selected: set.has(r.key) }));
      s.verified = false;
      const out = ranked(s);
      for (const l of out.listings) {
        l.verdict = null;
        l.verdict_note = "";
        l.branded = false;
      }
      s.live = {
        ...s.live,
        snapshot: { ...s.live.snapshot, references: publicRefs(s.refs), listings: out.listings, groups: out.groups },
      };
      return clone(s.live.snapshot);
    }, 500);
  },

  history: () =>
    delay(() =>
      [...searches.values()]
        .map((s): HistoryItem => {
          const snap = s.live.snapshot;
          return {
            id: snap.id,
            query: snap.query,
            created: snap.created,
            status: snap.status,
            count: snap.listings.length,
            thumb_key: snap.listings[0]?.image_key ?? snap.references[0]?.key ?? null,
          };
        })
        .sort((a, b) => b.created - a.created),
    ),

  status: () => delay(() => clone(status), 120),

  login(site: LoginSite) {
    return delay(() => {
      status.login_open = site;
      return clone(status);
    }, 400);
  },

  loginDone() {
    return delay(() => {
      const site = status.login_open as LoginSite | null;
      if (site) status.logins[site] = true;
      status.login_open = null;
      return clone(status);
    }, 300);
  },

  putYupooStores(stores) {
    return delay(() => {
      status.yupoo_stores = [...stores];
      return clone(status);
    }, 300);
  },

  imgUrl(key) {
    // Unknown keys get an invalid data URI so the <img> error path (placeholder) is exercised.
    return mockImages[key] ?? garmentImages[key] ?? "data:image/png;base64,AAAA";
  },

  catalog: () => delay(() => clone(CATALOG), 260),

  profile: () => delay(() => clone(status.profile!), 120),

  putProfile(profile: Profile) {
    return delay(() => {
      status.profile = clone(profile);
      return clone(profile);
    }, 300);
  },

  async look(uploadKey) {
    await wait(1400);
    try {
      const items = await mockLook(uploadKey, uploadNames.get(uploadKey) ?? "", mockImages[uploadKey], (k, uri) => {
        mockImages[k] = uri;
      });
      return { upload_key: uploadKey, items };
    } catch (e) {
      if (e instanceof MockError) throw new ApiError(e.message, e.status);
      throw e;
    }
  },

  async testAi(config) {
    await wait(900);
    if (!config.model) return { models: ["gemini-flash-latest", "gemini-2.5-pro"], models_error: null, chat: { ok: false, error: "Pick a model." }, vision: { ok: false } };
    if (config.base_url.includes("fail")) throw new ApiError("Cannot reach the AI provider at " + config.base_url + ". Is it running?", 502);
    return {
      models: [...new Set([config.model, "gemini-flash-latest", "gemini-2.5-pro"])],
      models_error: null,
      chat: { ok: true, ms: 840, sample: "卫衣" },
      vision: config.provider === "deepseek" ? { ok: false, error: "The AI model deepseek-chat cannot read photos." } : { ok: true },
    };
  },

  saveAi(config) {
    return delay(() => {
      status.ai = { provider: config.provider, base_url: config.base_url, model: config.model, key_set: config.api_key === null ? !!status.ai?.key_set : !!config.api_key, vision: config.vision !== "off", vision_setting: config.vision };
      status.llm = !!(config.base_url && config.model);
      return clone(status);
    }, 300);
  },

  saveKeys(keys) {
    return delay(() => {
      for (const [k, v] of Object.entries(keys)) if (v !== undefined) status.keys[k as keyof Status["keys"]] = !!v;
      return clone(status);
    }, 300);
  },

  rates: () => delay(() => ({ rates: { USD: 0.14, EUR: 0.13, GBP: 0.11, CAD: 0.19, AUD: 0.21, JPY: 21, KRW: 190 }, updated: 0, source: "mock" }), 100),

  async translate(texts) {
    await wait(900);
    const translations: Record<string, string> = {};
    for (const t of texts) {
      const en = /[\u3400-\u9fff]/.test(t) ? mockEnglish(t) : null;
      if (en) translations[t] = en;
    }
    return { translations };
  },

  async suggest(req) {
    await wait(1100);
    const anchorSnap = req.anchor?.search_id ? searches.get(req.anchor.search_id)?.live.snapshot : undefined;
    const anchorQuery = anchorSnap ? anchorSnap.query || anchorSnap.queries?.en[0] || null : null;
    try {
      const suggestions = mockSuggest(req, anchorQuery);
      for (const item of suggestions.items) {
        if (status.profile?.gender) item.options.gender = status.profile.gender;
        const budget = item.options.price_max || status.profile?.budget_cny;
        if (budget != null) item.options.price_max = budget;
      }
      return clone(suggestions);
    } catch (e) {
      if (e instanceof MockError) throw new ApiError(e.message, e.status);
      throw e;
    }
  },
};
