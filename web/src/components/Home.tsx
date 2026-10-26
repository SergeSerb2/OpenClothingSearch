import { LOGIN_SITES, type Profile } from "../api/types";
import type { HistoryApi } from "../hooks/useHistory";
import type { StatusApi } from "../hooks/useStatus";
import type { Board } from "../lib/boards";
import { useCatalog } from "../lib/catalog";
import { plural } from "../lib/format";
import { API_KEYS, SITE_LABEL } from "../lib/sources";
import { HistoryList } from "./History";
import { BoardList, LookDrop, StylistBox } from "./HomeTools";
import { IconCheck, Spinner } from "./Icons";
import { StyleGallery } from "./StyleGallery";

interface Props {
  st: StatusApi;
  history: HistoryApi;
  boards: Board[];
  profile: Profile | null;
  selectedStyles: string[];
  onExample: (q: string) => void;
  onOpen: (id: string) => void;
  onOpenBoard: (id: string) => void;
  onOpenSettings: () => void;
  onOpenHistory: (tab: "searches" | "boards") => void;
  onUseStyle: (id: string) => void;
  onStarter: (id: string) => void;
  onAsk: (notes: string) => void;
  onLook: () => (key: string) => void;
  onLookDragOver: (over: boolean) => void;
  suggestBusy: string | null;
  suggestError: string | null;
}

const EXAMPLES = ["Nike Dunk Low Panda", "Arc'teryx Beta LT jacket", "heavyweight grey hoodie", "olive cargo pants"];

export function Home(p: Props) {
  const { st, history, boards } = p;
  const { index, error: catalogError, loading: catalogLoading, reload } = useCatalog();
  const status = st.status;
  const keyCount = status ? API_KEYS.filter((k) => status.keys[k.id]).length : 0;
  const count = history.items?.length ?? 0;
  const profileEmpty = !p.profile || (!p.profile.gender && !p.profile.sizes.top && !p.profile.budget_cny);

  return (
    <div className="home">
      {status && !status.llm ? (
        <section className="setup-banner" aria-label="Set up AI">
          <div>
            <strong>Connect an AI provider</strong>
            <p>
              The AI writes Chinese search terms, checks photos, translates titles into English and runs the stylist. Google
              Gemini has a free tier, and Ollama runs free on your own computer.
            </p>
          </div>
          <button type="button" className="btn btn--primary" onClick={p.onOpenSettings}>
            Set up AI
          </button>
        </section>
      ) : null}
      <section className="home-intro">
        <h1>Type an item name, pick options, or drop a photo anywhere on this page.</h1>
        <p className="muted">
          Searches Taobao, Tmall, 1688, Weidian and Yupoo stores, then ranks listings by how closely their photos match.
          {profileEmpty ? (
            <>
              {" "}
              <button type="button" className="link-btn" onClick={p.onOpenSettings}>
                Add your sizes and budget
              </button>{" "}
              so the AI can tailor results.
            </>
          ) : null}
        </p>
        <div className="chips home-examples">
          <span className="muted">Try</span>
          {EXAMPLES.map((q) => (
            <button key={q} type="button" className="qchip qchip--en" onClick={() => p.onExample(q)}>
              {q}
            </button>
          ))}
        </div>
      </section>

      <div className="home-tools">
        <section className="home-card">
          <header className="home-card-head">
            <h2>Shop the look</h2>
          </header>
          <LookDrop onUploaded={p.onLook} onDragOverChange={p.onLookDragOver} />
        </section>
        <section className="home-card">
          <header className="home-card-head">
            <h2>Ask the AI stylist</h2>
          </header>
          <StylistBox onAsk={p.onAsk} busy={p.suggestBusy === "notes"} error={p.suggestError} />
        </section>
      </div>

      <section className="home-section">
        <header className="home-section-head">
          <h2>Styles</h2>
          <span className="muted">Use a style to add it to your search options, or get a starter kit of key pieces.</span>
        </header>
        {index ? (
          <StyleGallery
            index={index}
            selected={p.selectedStyles}
            onUse={p.onUseStyle}
            onStarter={p.onStarter}
            busy={p.suggestBusy && p.suggestBusy !== "notes" ? p.suggestBusy : null}
            favorites={p.profile?.styles ?? []}
          />
        ) : catalogLoading ? (
          <div className="panel-empty">
            <Spinner /> Loading styles…
          </div>
        ) : (
          <div className="panel-empty">
            <span>Styles are not available: {catalogError}</span>
            <button type="button" className="btn btn--sm" onClick={reload}>
              Retry
            </button>
          </div>
        )}
      </section>

      <div className="home-cols">
        <section className="home-card">
          <header className="home-card-head">
            <h2>Recent searches</h2>
            {count > 6 ? (
              <button type="button" className="link-btn" onClick={() => p.onOpenHistory("searches")}>
                All {count}
              </button>
            ) : null}
          </header>
          <HistoryList history={history} currentId={null} onOpen={p.onOpen} limit={6} />
        </section>

        <section className="home-card">
          <header className="home-card-head">
            <h2>Boards</h2>
            {boards.length > 6 ? (
              <button type="button" className="link-btn" onClick={() => p.onOpenHistory("boards")}>
                All {boards.length}
              </button>
            ) : null}
          </header>
          <BoardList boards={boards} onOpen={p.onOpenBoard} limit={6} />
        </section>

        <section className="home-card">
          <header className="home-card-head">
            <h2>Sources</h2>
            <button type="button" className="link-btn" onClick={p.onOpenSettings}>
              Settings
            </button>
          </header>
          {!status ? (
            <div className="panel-empty">{st.error ? <span>Backend not reachable.</span> : <Spinner />}</div>
          ) : (
            <ul className="set-list">
              {LOGIN_SITES.map((site) => {
                const ok = status.logins[site];
                return (
                  <li key={site} className="set-item">
                    <span className="set-name">{SITE_LABEL[site]}</span>
                    <span className={`state ${ok ? "state--ok" : "state--off"}`}>
                      {ok ? <IconCheck size={12} /> : <span className="dot" />}
                      {ok ? "Logged in" : "Not logged in"}
                    </span>
                    {!ok ? (
                      <button
                        type="button"
                        className="btn btn--sm"
                        disabled={status.login_open != null || st.busy === `login:${site}`}
                        onClick={() => void st.login(site)}
                      >
                        Log in
                      </button>
                    ) : null}
                  </li>
                );
              })}
              <li className="set-item">
                <span className="set-name">Yupoo</span>
                <span className={`state ${status.yupoo_stores.length ? "state--ok" : "state--off"}`}>
                  {status.yupoo_stores.length ? <IconCheck size={12} /> : <span className="dot" />}
                  {status.yupoo_stores.length ? plural(status.yupoo_stores.length, "store") : "No stores"}
                </span>
              </li>
              <li className="set-item">
                <span className="set-name">API keys</span>
                <span className={`state ${keyCount ? "state--ok" : "state--off"}`}>
                  {keyCount ? <IconCheck size={12} /> : <span className="dot" />}
                  {keyCount} of {API_KEYS.length} set
                </span>
              </li>
              <li className="set-item">
                <span className="set-name">AI</span>
                <span className={`state ${status.llm ? "state--ok" : "state--off"}`}>
                  {status.llm ? <IconCheck size={12} /> : <span className="dot" />}
                  {status.llm ? status.ai?.model || "Set up" : "Not set up"}
                </span>
                {!status.llm ? (
                  <button type="button" className="btn btn--sm" onClick={p.onOpenSettings}>
                    Set up
                  </button>
                ) : null}
              </li>
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
