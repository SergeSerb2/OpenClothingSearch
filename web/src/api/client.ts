import type {
  AiConfig,
  AiTestResult,
  Catalog,
  HistoryItem,
  KeyId,
  Look,
  LoginSite,
  Profile,
  SearchBody,
  SearchEvent,
  Snapshot,
  Status,
  StreamState,
  SuggestRequest,
  Suggestions,
} from "./types";
import { EVENT_TYPES } from "./types";

export interface EventHandlers {
  onEvent(ev: SearchEvent): void;
  onState(state: StreamState): void;
}

/** Everything the UI needs from the backend. The mock (src/dev/fixture.ts) implements the same interface. */
export interface Api {
  mock: boolean;
  upload(file: File): Promise<{ key: string }>;
  search(body: SearchBody): Promise<{ id: string }>;
  getSearch(id: string): Promise<Snapshot>;
  /** Subscribes to the SSE stream. Returns a function that closes it. */
  events(id: string, handlers: EventHandlers): () => void;
  setReferences(id: string, selected: string[]): Promise<Snapshot>;
  history(): Promise<HistoryItem[]>;
  status(): Promise<Status>;
  login(site: LoginSite): Promise<Status>;
  loginDone(): Promise<Status>;
  putYupooStores(stores: string[]): Promise<Status>;
  imgUrl(key: string): string;
  // v2
  catalog(): Promise<Catalog>;
  profile(): Promise<Profile>;
  putProfile(profile: Profile): Promise<Profile>;
  look(uploadKey: string): Promise<Look>;
  suggest(req: SuggestRequest): Promise<Suggestions>;
  /** English for Chinese texts; texts with no translation are left out. */
  translate(texts: string[]): Promise<{ translations: Record<string, string> }>;
  testAi(config: AiConfig): Promise<AiTestResult>;
  saveAi(config: AiConfig): Promise<Status>;
  /** A key per service: a string sets it, "" removes it, a missing key stays as it is. */
  saveKeys(keys: Partial<Record<KeyId, string>>): Promise<Status>;
  /** Approximate value of 1 CNY in other currencies. */
  rates(): Promise<{ rates: Record<string, number>; updated: number; source: string }>;
}

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      method,
      headers: body === undefined || body instanceof FormData ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : body instanceof FormData ? body : JSON.stringify(body),
    });
  } catch {
    throw new ApiError("Can't reach the backend.", 0);
  }
  if (res.status === 401) {
    // The server asks for the password (remote access): go to its login page, then come back.
    window.location.assign(`/login?next=${encodeURIComponent(location.pathname + location.search)}`);
    throw new ApiError("Log in first.", 401);
  }
  if (!res.ok) {
    throw new ApiError(await errorText(res), res.status);
  }
  // An unknown /api route can fall through to the SPA's index.html; treat that as "not there".
  if (!(res.headers.get("content-type") ?? "").includes("json")) {
    throw new ApiError("This backend does not support this yet.", 404);
  }
  return (await res.json()) as T;
}

async function errorText(res: Response): Promise<string> {
  const text = await res.text().catch(() => "");
  try {
    const data = JSON.parse(text) as { detail?: unknown; message?: unknown };
    const detail = data.detail ?? data.message;
    if (typeof detail === "string") return detail;
    if (Array.isArray(detail)) {
      return detail.map((d) => (typeof d === "object" && d && "msg" in d ? String(d.msg) : String(d))).join("; ");
    }
  } catch {
    // not JSON
  }
  if (res.status === 502 || res.status === 503 || res.status === 504) return "Can't reach the backend.";
  if (res.status === 404 || res.status === 405) return "This backend does not support this yet.";
  return text.trim().slice(0, 200) || `${res.status} ${res.statusText}`;
}

function openEvents(id: string, { onEvent, onState }: EventHandlers): () => void {
  const es = new EventSource(`/api/search/${encodeURIComponent(id)}/events`);
  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    es.close();
    onState("closed");
  };

  onState("connecting");
  es.onopen = () => onState("open");

  for (const type of EVENT_TYPES) {
    es.addEventListener(type, (raw) => {
      // The contract has a server event named "error", which collides with EventSource's
      // own connection "error" event. Only MessageEvents with data come from the server.
      if (!(raw instanceof MessageEvent) || typeof raw.data !== "string") {
        if (type === "error") {
          if (es.readyState === EventSource.CLOSED) close();
          else onState("reconnecting");
        }
        return;
      }
      let data: unknown;
      try {
        data = JSON.parse(raw.data);
      } catch {
        return;
      }
      onEvent({ type, data } as SearchEvent);
      if (type === "done" || type === "error") close();
      if (type === "snapshot") {
        const status = (data as Snapshot).status;
        if (status === "done" || status === "error") close();
      }
    });
  }
  return close;
}

export const realApi: Api = {
  mock: false,
  upload(file) {
    const form = new FormData();
    form.append("file", file);
    return request("POST", "/api/upload", form);
  },
  search: (body) => request("POST", "/api/search", body),
  getSearch: (id) => request("GET", `/api/search/${encodeURIComponent(id)}`),
  events: openEvents,
  setReferences: (id, selected) =>
    request("POST", `/api/search/${encodeURIComponent(id)}/references`, { selected }),
  history: () => request("GET", "/api/history"),
  status: () => request("GET", "/api/status"),
  login: (site) => request("POST", `/api/login/${site}`),
  loginDone: () => request("POST", "/api/login/done"),
  putYupooStores: (stores) => request("PUT", "/api/yupoo-stores", { stores }),
  imgUrl: (key) => `/api/img/${key.split("/").map(encodeURIComponent).join("/")}`,
  catalog: () => request("GET", "/api/catalog"),
  profile: () => request("GET", "/api/profile"),
  putProfile: (profile) => request("PUT", "/api/profile", profile),
  look: (uploadKey) => request("POST", "/api/look", { upload_key: uploadKey }),
  suggest: (req) => request("POST", "/api/suggest", req),
  translate: (texts) => request("POST", "/api/translate", { texts }),
  rates: () => request("GET", "/api/rates"),
  testAi: (config) => request("POST", "/api/ai/test", config),
  saveAi: (config) => request("PUT", "/api/ai", config),
  saveKeys: (keys) => request("PUT", "/api/keys", keys),
};
