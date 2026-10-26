import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { readStorage, writeStorage } from "./lib/storage";
import { useApi } from "./api/context";
import type { LoginSite, Mode, SearchOptions, SuggestRequest } from "./api/types";
import { BoardView } from "./components/BoardView";
import { Drawer } from "./components/Drawer";
import { HistoryList } from "./components/History";
import { Home } from "./components/Home";
import { BoardList } from "./components/HomeTools";
import { HoverPreview } from "./components/HoverPreview";
import { IconAlert, IconClock, IconGear, Spinner } from "./components/Icons";
import { LookView } from "./components/LookView";
import { OptionsPanel } from "./components/OptionsPanel";
import { Segmented } from "./components/Pickers";
import { Results } from "./components/Results";
import { RunHeader } from "./components/RunHeader";
import { SearchBar, imageFiles } from "./components/SearchBar";
import { SettingsPanel } from "./components/SettingsPanel";
import { Toasts } from "./components/Toasts";
import { Toolbar } from "./components/Toolbar";
import { useHistory } from "./hooks/useHistory";
import { useProfile } from "./hooks/useProfile";
import { errorMessage, useSearch } from "./hooks/useSearch";
import { useStatus } from "./hooks/useStatus";
import { useUploads } from "./hooks/useUploads";
import { newBoardId, saveBoard, useBoards, type Board } from "./lib/boards";
import { CatalogContext, useCatalogLoader } from "./lib/catalog";
import { cleanOptions, countOptions, optionsCanPlan, profileDefaults, searchTitle as searchTitleOf } from "./lib/options";
import { hidePreview } from "./lib/preview";
import { siteLabel } from "./lib/sources";
import { toast } from "./lib/toast";
import { useEn } from "./lib/translate";
import { DEFAULT_FILTERS, buildView, optionFilters, type Filters, type SortKey, type ViewMode } from "./lib/view";

type Panel = "history" | "settings" | null;
type Route = { kind: "home" } | { kind: "search"; id: string } | { kind: "board"; id: string } | { kind: "look"; key: string };

function readPref<T extends string>(key: string, allowed: T[], fallback: T): T {
  const v = readStorage(key);
  return allowed.includes(v as T) ? (v as T) : fallback;
}

function parseRoute(): Route {
  const p = new URLSearchParams(location.search);
  const id = p.get("id");
  if (id) return { kind: "search", id };
  const board = p.get("board");
  if (board) return { kind: "board", id: board };
  const look = p.get("look");
  if (look) return { kind: "look", key: look };
  return { kind: "home" };
}

function urlFor(route: Route): string {
  const params = new URLSearchParams(location.search);
  for (const k of ["id", "board", "look"]) params.delete(k);
  if (route.kind === "search") params.set("id", route.id);
  if (route.kind === "board") params.set("board", route.id);
  if (route.kind === "look") params.set("look", route.key);
  const qs = params.toString();
  return `${location.pathname}${qs ? `?${qs}` : ""}`;
}

function isTyping(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  return el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName);
}

const MISSING = "Type an item name, add a photo, or pick a category, brand or style in Options.";

export function App() {
  const api = useApi();
  const catalog = useCatalogLoader(api);
  const st = useStatus();
  const history = useHistory();
  const uploads = useUploads();
  const pf = useProfile(st.status?.profile);
  const boards = useBoards(api.mock);
  const { session, start, load, setReferences, clear } = useSearch();

  const [route, setRoute] = useState<Route>(parseRoute);
  const [query, setQuery] = useState("");
  const [opts, setOpts] = useState<SearchOptions>({ mode: "exact" });
  const optsTouched = useRef(false);
  const [optionsOpen, setOptionsOpen] = useState(() => readStorage("optionsOpen") === "1");
  const [hint, setHint] = useState<string | null>(null);
  const [panel, setPanel] = useState<Panel>(null);
  const [historyTab, setHistoryTab] = useState<"searches" | "boards">("searches");
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [sort, setSort] = useState<SortKey>(() => readPref("sort", ["match", "price", "value"], "match"));
  const [mode, setMode] = useState<ViewMode>(() => readPref("view", ["grouped", "all"], "grouped"));
  const [pendingSubmit, setPendingSubmit] = useState<{
    query: string; options: SearchOptions | undefined; uploadIds: number[]; generation: number; navigation: number;
  } | null>(null);
  const navigationGen = useRef(0);
  const submitGen = useRef(0);
  const suggestGen = useRef(0);
  const lookGen = useRef(0);
  const dragDepth = useRef(0);
  const [dragging, setDragging] = useState(false);
  const [lookOver, setLookOver] = useState(false);
  const [suggestBusy, setSuggestBusy] = useState<string | null>(null);
  const [suggestError, setSuggestError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const chromeRef = useRef<HTMLDivElement>(null);

  // The sticky toolbar sits below the top bar and any banners; track their height.
  useEffect(() => {
    const el = chromeRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => document.documentElement.style.setProperty("--chrome-h", `${el.offsetHeight}px`));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => writeStorage("sort", sort), [sort]);
  useEffect(() => writeStorage("view", mode), [mode]);
  useEffect(() => writeStorage("optionsOpen", optionsOpen ? "1" : "0"), [optionsOpen]);
  // A card can disappear from under the cursor when the view changes.
  useEffect(() => hidePreview(), [filters, sort, mode]);

  // Prefill gender from the profile until the user edits options.
  useEffect(() => {
    if (!pf.profile || optsTouched.current) return;
    setOpts((o) => ({ mode: o.mode, ...profileDefaults(pf.profile) }));
  }, [pf.profile]);

  const changeOpts = useCallback((o: SearchOptions) => {
    optsTouched.current = true;
    setOpts(o);
    setHint(null);
  }, []);

  const live = session.live;
  const snapshot = live?.snapshot ?? null;
  const currentId = snapshot?.id ?? null;

  // Per search: fresh filters, with official-store and price taken from the options it was run with.
  const filtersFor = useRef<string | null>(null);
  useEffect(() => {
    if (!snapshot || filtersFor.current === snapshot.id) return;
    filtersFor.current = snapshot.id;
    const { officialOnly, priceMin, priceMax } = optionFilters(snapshot.options);
    setFilters({ ...DEFAULT_FILTERS, officialOnly, priceMin, priceMax });
  }, [snapshot]);

  // ---- navigation ----
  const cancelNavigation = useCallback(() => {
    navigationGen.current++;
    submitGen.current++;
    suggestGen.current++;
    lookGen.current++;
    setPendingSubmit(null);
    setSuggestBusy(null);
    hidePreview();
  }, []);

  const navigate = useCallback(
    (next: Route, opt: { push?: boolean; load?: boolean } = {}) => {
      cancelNavigation();
      const { push = true } = opt;
      setPanel(null);
      setRoute(next);
      if (push) window.history.pushState(null, "", urlFor(next));
      if (next.kind === "search") {
        if (opt.load !== false) void load(next.id);
      } else {
        clear();
      }
      window.scrollTo(0, 0);
    },
    [load, clear, cancelNavigation],
  );

  useEffect(() => {
    const r = parseRoute();
    if (r.kind === "search") void load(r.id);
    const onPop = () => {
      navigate(parseRoute(), { push: false });
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const openSearch = useCallback(
    (id: string) => {
      // The search bar shows what this search looked for, so Enter does not rerun another query.
      const q = history.items?.find((h) => h.id === id)?.query ?? "";
      setQuery(q === "Photo search" || q.length > 80 ? "" : q);
      void history.refresh();
      navigate({ kind: "search", id });
    },
    [navigate, history],
  );

  const goHome = () => {
    navigate({ kind: "home" });
    void history.refresh();
    inputRef.current?.focus();
  };

  // ---- searching ----
  const runSearch = useCallback(
    async (q: string, keys: string[], options: SearchOptions | undefined) => {
      cancelNavigation();
      const g = navigationGen.current;
      setPanel(null);
      setHint(null);
      filtersFor.current = null;
      setRoute({ kind: "search", id: "" });
      const id = await start(q, keys, options);
      if (id && g === navigationGen.current) {
        setRoute({ kind: "search", id });
        window.history.pushState(null, "", urlFor({ kind: "search", id }));
        void history.refresh();
      }
    },
    [start, history, cancelNavigation],
  );

  const missing = !query.trim() && uploads.items.length === 0 && !optionsCanPlan(opts) ? MISSING : null;

  const submit = (q = query) => {
    const generation = ++submitGen.current;
    setPendingSubmit(null);
    if (!q.trim() && uploads.items.length === 0 && !optionsCanPlan(opts)) {
      setHint(MISSING);
      return;
    }
    if (uploads.items.some((i) => i.state === "error")) {
      setHint("Retry or remove the failed photo.");
      return;
    }
    const options = cleanOptions(opts);
    if (uploads.pending) {
      setPendingSubmit({ query: q.trim(), options, uploadIds: uploads.items.map((i) => i.id), generation, navigation: navigationGen.current });
      return;
    }
    void runSearch(q.trim(), uploads.keys, options);
  };

  useEffect(() => {
    if (!hint) return;
    const t = setTimeout(() => setHint(null), 7000);
    return () => clearTimeout(t);
  }, [hint]);

  useEffect(() => {
    if (!pendingSubmit) return;
    if (pendingSubmit.generation !== submitGen.current || pendingSubmit.navigation !== navigationGen.current) return;
    const required = uploads.items.filter((i) => pendingSubmit.uploadIds.includes(i.id));
    if (required.some((i) => i.state === "error")) {
      setPendingSubmit(null);
      setHint("Retry or remove the failed photo, then search again.");
      return;
    }
    if (required.some((i) => i.state === "uploading")) return;
    setPendingSubmit(null);
    if (!pendingSubmit.query && !required.length && !optionsCanPlan(pendingSubmit.options ?? {})) {
      setHint(MISSING);
      return;
    }
    void runSearch(pendingSubmit.query, required.flatMap((i) => i.key ? [i.key] : []), pendingSubmit.options);
  }, [pendingSubmit, uploads.items, runSearch]);

  const searchAgain = useCallback(() => {
    if (!snapshot) return;
    setQuery(snapshot.query);
    const o = snapshot.options && Object.keys(snapshot.options).length ? snapshot.options : undefined;
    void runSearch(snapshot.query, session.uploadKeys ?? [], o);
  }, [snapshot, session.uploadKeys, runSearch]);

  // Refresh history once a search finishes.
  const finished = snapshot?.status !== "running" ? snapshot?.status : null;
  useEffect(() => {
    if (finished) void history.refresh();
  }, [finished, currentId]);

  const searchTitle = useEn(snapshot ? searchTitleOf(snapshot, catalog.index) : "").text;
  useEffect(() => {
    const b = route.kind === "board" ? boards.find((x) => x.id === route.id) : undefined;
    document.title =
      route.kind === "search" && snapshot
        ? `${searchTitle} · OpenSearch`
        : b
          ? `${b.title} · OpenSearch`
          : route.kind === "look"
            ? "Shop the look · OpenSearch"
            : "OpenSearch";
  }, [route, snapshot, searchTitle, boards]);

  // ---- AI stylist ----
  const makeSuggestBoard = useCallback(
    async (req: SuggestRequest, kind: Board["kind"], busyKey: string, anchor?: Board["anchor"]) => {
      const seq = ++suggestGen.current;
      const nav = navigationGen.current;
      const current = () => seq === suggestGen.current && nav === navigationGen.current;
      setSuggestBusy(busyKey);
      setSuggestError(null);
      try {
        const s = await api.suggest(req);
        if (!current()) return;
        if (!s.items.length) {
          const msg = "No suggestions. Add the occasion, weather or pieces you want.";
          if (busyKey === "notes") setSuggestError(msg);
          else toast(msg, "error");
          return;
        }
        const board: Board = {
          id: newBoardId(api.mock),
          kind,
          title: s.title,
          created: Date.now() / 1000,
          mock: api.mock,
          anchor,
          items: s.items.map((it, i) => ({
            key: `s${i}`,
            label: it.label,
            why: it.why,
            query: it.query,
            options: it.options ?? {},
            upload_keys: [],
            search_id: null,
          })),
        };
        saveBoard(board);
        navigate({ kind: "board", id: board.id });
      } catch (e) {
        if (!current()) return;
        const msg = `Couldn't get suggestions: ${errorMessage(e)}`;
        if (busyKey === "notes") setSuggestError(msg);
        else toast(msg, "error");
      } finally {
        if (current()) setSuggestBusy(null);
      }
    },
    [api, navigate],
  );

  const completeLook = useCallback(() => {
    if (!snapshot) return;
    const best = snapshot.listings[0];
    void makeSuggestBoard({ anchor: { search_id: snapshot.id } }, "complete", "complete", {
      search_id: snapshot.id,
      label: searchTitle,
      thumb_key: best ? (best.match_key ?? best.image_key) : (snapshot.upload_keys?.[0] ?? null),
    });
  }, [snapshot, searchTitle, makeSuggestBoard]);

  const useStyle = useCallback(
    (id: string) => {
      const styles = opts.styles ?? [];
      if (styles.includes(id)) {
        changeOpts({ ...opts, styles: styles.filter((s) => s !== id) });
        return;
      }
      const next: SearchOptions = { ...opts, styles: [...styles, id] };
      const name = catalog.index?.style.get(id)?.name ?? id;
      if (!opts.mode || opts.mode === "exact") {
        next.mode = "similar";
        toast(`Added ${name}. Mode set to Similar style.`);
      } else {
        toast(`Added ${name} to the options.`);
      }
      changeOpts(next);
      setOptionsOpen(true);
      window.scrollTo({ top: 0, behavior: "smooth" });
    },
    [opts, changeOpts, catalog.index],
  );

  // ---- keyboard, paste, drop ----
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "/" && !isTyping(e.target) && !e.metaKey && !e.ctrlKey && !panel) {
        e.preventDefault();
        inputRef.current?.focus();
        inputRef.current?.select();
      } else if (e.key === "Escape" && e.target === inputRef.current) {
        inputRef.current?.blur();
      }
    };
    const onPaste = (e: ClipboardEvent) => {
      if (isTyping(e.target) && e.target !== inputRef.current) return;
      const files = imageFiles(e.clipboardData);
      if (files.length) {
        e.preventDefault();
        uploads.add(files);
        inputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("paste", onPaste);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("paste", onPaste);
    };
  }, [panel, uploads]);

  useEffect(() => {
    const depth = dragDepth;
    const hasFiles = (e: DragEvent) => [...(e.dataTransfer?.types ?? [])].includes("Files");
    const enter = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      depth.current++;
      setDragging(true);
    };
    const over = (e: DragEvent) => {
      if (hasFiles(e)) e.preventDefault();
    };
    const leave = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      depth.current = Math.max(0, depth.current - 1);
      if (depth.current === 0) setDragging(false);
    };
    const drop = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      depth.current = 0;
      setDragging(false);
      setLookOver(false);
      if (e.defaultPrevented) return; // a drop zone (Shop the look) took it
      e.preventDefault();
      const files = imageFiles(e.dataTransfer);
      if (files.length) {
        uploads.add(files);
        inputRef.current?.focus();
      }
    };
    window.addEventListener("dragenter", enter);
    window.addEventListener("dragover", over);
    window.addEventListener("dragleave", leave);
    window.addEventListener("drop", drop);
    return () => {
      window.removeEventListener("dragenter", enter);
      window.removeEventListener("dragover", over);
      window.removeEventListener("dragleave", leave);
      window.removeEventListener("drop", drop);
    };
  }, [uploads.add]);

  // ---- derived ----
  const view = useMemo(() => (snapshot ? buildView(snapshot, filters, sort, mode) : null), [snapshot, filters, sort, mode]);

  const onLogin = useCallback((site: LoginSite) => void st.login(site), [st]);
  const blockerActions = {
    status: st.status,
    busy: st.busy,
    loggedInAt: st.loggedInAt,
    since: (snapshot?.created ?? 0) * 1000,
    onLogin,
    onSearchAgain: snapshot ? searchAgain : undefined,
    onOpenSettings: () => setPanel("settings"),
  };

  useEffect(() => {
    if (panel === "history") void history.refresh();
  }, [panel, history.refresh]);

  const closePanel = useCallback(() => setPanel(null), []);
  const fromProfile: string[] = [];
  if (pf.profile?.gender && opts.gender === pf.profile.gender) fromProfile.push("Gender");

  const openOptions = () => {
    setOptionsOpen(true);
    setHint(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <CatalogContext.Provider value={catalog}>
      <div className="app">
        <div className="chrome" ref={chromeRef}>
          <header className="topbar">
            <a
              className="brand"
              href={urlFor({ kind: "home" })}
              onClick={(e) => {
                e.preventDefault();
                goHome();
              }}
            >
              <img src="/icon.svg" alt="" width={22} height={22} />
              <span>OpenSearch</span>
            </a>
            <SearchBar
              ref={inputRef}
              query={query}
              onQuery={(q) => {
                setQuery(q);
                setHint(null);
              }}
              uploads={uploads}
              onSubmit={() => submit()}
              busy={session.phase === "starting"}
              waitingForUploads={pendingSubmit != null}
              mode={opts.mode ?? "exact"}
              onMode={(m: Mode) => changeOpts({ ...opts, mode: m })}
              optionsCount={countOptions(opts)}
              optionsOpen={optionsOpen}
              onToggleOptions={() => (optionsOpen ? setOptionsOpen(false) : openOptions())}
              missing={missing}
              hint={hint}
              onOpenOptions={openOptions}
            />
            <nav className="topbar-actions">
              {api.mock ? (
                <span className="mock-tag" title="Mock data from src/dev/fixture.ts and src/dev/clothing.ts. Remove ?mock=1 to use the backend.">
                  Mock
                </span>
              ) : null}
              <button type="button" className="btn btn--ghost" onClick={() => setPanel("history")} aria-haspopup="dialog" aria-label="History">
                <IconClock /> <span className="hide-sm">History</span>
              </button>
              <button type="button" className="btn btn--ghost" onClick={() => setPanel("settings")} aria-haspopup="dialog" aria-label="Settings">
                <IconGear /> <span className="hide-sm">Settings</span>
              </button>
            </nav>
          </header>

          {st.status?.login_open ? (
            <div className="banner banner--login" role="status">
              <Spinner size={12} />
              <span>
                <strong>{siteLabel(st.status.login_open)} login window is open.</strong> Log in in the browser window, then click Done.
              </span>
              <button type="button" className="btn btn--primary btn--sm" onClick={() => void st.loginDone()} disabled={st.busy === "done"}>
                {st.busy === "done" ? <Spinner size={11} /> : null}
                Done
              </button>
            </div>
          ) : null}

          {st.error && !st.status ? (
            <div className="banner banner--error" role="alert">
              <IconAlert size={14} />
              <span>
                <strong>Can't reach the backend.</strong> Start the server (it listens on 127.0.0.1:8790). This page retries on its own.
                Or open <a href="?mock=1">mock mode</a>.
              </span>
              <button type="button" className="btn btn--sm" onClick={() => void st.refresh()}>
                Retry
              </button>
            </div>
          ) : null}
        </div>

        <main className="main">
          {optionsOpen ? (
            <OptionsPanel
              options={opts}
              onChange={changeOpts}
              onReset={() => changeOpts({ mode: opts.mode })}
              onClose={() => setOptionsOpen(false)}
              fromProfile={fromProfile}
              onSubmit={() => submit()}
            />
          ) : null}

          {route.kind === "home" ? (
            <Home
              st={st}
              history={history}
              boards={boards}
              profile={pf.profile}
              selectedStyles={opts.styles ?? []}
              onExample={(q) => {
                setQuery(q);
                submit(q);
              }}
              onOpen={openSearch}
              onOpenBoard={(id) => navigate({ kind: "board", id })}
              onOpenSettings={() => setPanel("settings")}
              onOpenHistory={(tab) => { setHistoryTab(tab); setPanel("history"); }}
              onUseStyle={useStyle}
              onStarter={(id) => void makeSuggestBoard({ styles: [id] }, "suggest", id)}
              onAsk={(notes) => void makeSuggestBoard({ notes }, "suggest", "notes")}
              onLook={() => {
                const seq = ++lookGen.current;
                const nav = navigationGen.current;
                return (key) => {
                  if (seq === lookGen.current && nav === navigationGen.current) navigate({ kind: "look", key });
                };
              }}
              onLookDragOver={setLookOver}
              suggestBusy={suggestBusy}
              suggestError={suggestError}
            />
          ) : route.kind === "board" ? (
            <BoardView key={route.id} boardId={route.id} mock={api.mock} onOpenSearch={openSearch} onHome={goHome} />
          ) : route.kind === "look" ? (
            <LookView
              key={route.key}
              uploadKey={route.key}
              onBoard={(id) => navigate({ kind: "board", id })}
              onAnother={goHome}
            />
          ) : session.phase === "idle" || session.phase === "starting" || session.phase === "loading" ? (
            <div className="loading">
              <Spinner /> {session.phase === "loading" ? "Loading search…" : "Starting search…"}
            </div>
          ) : session.phase === "failed" ? (
            <div className="empty">
              <p className="empty-title">{session.error}</p>
              <div className="empty-actions">
                <button type="button" className="btn" onClick={goHome}>
                  Back
                </button>
                <button type="button" className="btn btn--ghost" onClick={() => setPanel("history")}>
                  Recent searches
                </button>
              </div>
            </div>
          ) : live && view ? (
            <>
              <RunHeader
                live={live}
                stream={session.stream}
                streamError={session.streamError}
                rerank={session.rerank}
                onReferences={(keys) => void setReferences(keys)}
                onReconnect={() => currentId && navigate({ kind: "search", id: currentId }, { push: false })}
                actions={blockerActions}
                onCompleteLook={completeLook}
                completeBusy={suggestBusy === "complete"}
              />
              {view.total > 0 ? (
                <Toolbar filters={filters} onFilters={setFilters} sort={sort} onSort={setSort} mode={mode} onMode={setMode} view={view} />
              ) : null}
              <Results
                key={live.snapshot.id}
                snapshot={live.snapshot}
                view={view}
                dimmed={session.rerank.pending}
                onResetFilters={() => setFilters(DEFAULT_FILTERS)}
                onShowWeak={() => setFilters((f) => ({ ...f, minMatch: 0 }))}
                actions={blockerActions}
              />
            </>
          ) : null}
        </main>

        {panel === "history" ? (
          <Drawer title="History" onClose={closePanel}>
            <div className="drawer-tabs">
              <Segmented<"searches" | "boards">
                label="History"
                value={historyTab}
                onChange={setHistoryTab}
                options={[
                  ["searches", "Searches"],
                  ["boards", `Boards${boards.length ? ` (${boards.length})` : ""}`],
                ]}
              />
            </div>
            {historyTab === "searches" ? (
              <HistoryList history={history} currentId={currentId} onOpen={openSearch} />
            ) : (
              <BoardList boards={boards} onOpen={(id) => navigate({ kind: "board", id })} currentId={route.kind === "board" ? route.id : null} />
            )}
          </Drawer>
        ) : null}
        {panel === "settings" ? (
          <Drawer title="Settings" onClose={closePanel}>
            <SettingsPanel st={st} pf={pf} />
          </Drawer>
        ) : null}

        {dragging && !lookOver ? (
          <div className="drop-overlay" aria-hidden="true">
            <div className="drop-box">Drop a photo to search with it</div>
          </div>
        ) : null}
        <HoverPreview />
        <Toasts />
      </div>
    </CatalogContext.Provider>
  );
}
