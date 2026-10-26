import { useEffect, useRef, useState, type FormEvent } from "react";
import { LOGIN_SITES } from "../api/types";
import type { ProfileApi } from "../hooks/useProfile";
import type { StatusApi } from "../hooks/useStatus";
import { ProfileForm } from "./ProfileForm";
import { SITE_LABEL } from "../lib/sources";
import { CURRENCIES, setCurrency, useCurrency, type Currency } from "../lib/money";
import { AiSection, KeysSection } from "./AiSettings";
import { setEnglishOnly, useEnglishOnly } from "../lib/translate";
import { parseStores } from "../lib/yupoo";
import { IconCheck, IconX, Spinner } from "./Icons";

export function SettingsPanel({ st, pf }: { st: StatusApi; pf: ProfileApi }) {
  const { status, error, busy, login, refresh } = st;

  if (!status) {
    return error ? (
      <div className="panel-empty">
        <p>Can't read settings: {error}</p>
        <button type="button" className="btn" onClick={() => void refresh()}>
          Retry
        </button>
      </div>
    ) : (
      <div className="panel-empty">
        <Spinner /> Loading…
      </div>
    );
  }

  return (
    <div className="settings">
      <AiSection st={st} />

      <section className="set-section">
        <h3>Logins</h3>
        <p className="set-help">Logging in opens a browser window. Log in there, then click Done.</p>
        <ul className="set-list">
          {LOGIN_SITES.map((site) => {
            const ok = status.logins[site];
            const open = status.login_open === site;
            return (
              <li key={site} className="set-item">
                <span className="set-name">{SITE_LABEL[site]}</span>
                <span className={`state ${ok ? "state--ok" : "state--off"}`}>
                  {ok ? <IconCheck size={12} /> : <span className="dot" />}
                  {open ? "Window open" : ok ? "Logged in" : "Not logged in"}
                </span>
                <button
                  type="button"
                  className={`btn btn--sm ${ok ? "btn--ghost" : ""}`}
                  disabled={status.login_open != null || busy === `login:${site}`}
                  onClick={() => void login(site)}
                >
                  {busy === `login:${site}` ? <Spinner size={11} /> : null}
                  {ok ? "Log in again" : "Log in"}
                </button>
              </li>
            );
          })}
        </ul>
      </section>

      <KeysSection st={st} />

      <section className="set-section">
        <h3>Profile</h3>
        <ProfileForm pf={pf} />
      </section>

      <Language llm={status.llm} />

      <YupooStores st={st} />

      {status.auth ? (
        <section className="set-section">
          <h3>Remote access</h3>
          <p className="set-help">You are logged in with the app's password. Logging out ends the session in this browser.</p>
          <button
            type="button"
            className="btn"
            onClick={() => {
              void fetch("/api/auth/logout", { method: "POST" }).finally(() => window.location.assign("/login"));
            }}
          >
            Log out
          </button>
        </section>
      ) : null}
    </div>
  );
}

function Language({ llm }: { llm: boolean }) {
  const english = useEnglishOnly();
  const currency = useCurrency();
  return (
    <section className="set-section">
      <h3>Language and currency</h3>
      <label className="check">
        <input type="checkbox" checked={english} onChange={(e) => setEnglishOnly(e.target.checked)} />
        Show Chinese text in English
      </label>
      <p className="set-help">
        {llm
          ? "The AI translates listing titles, shop names and search terms. Point at a translated text to see the Chinese. Each text is translated once and saved."
          : "Translation needs the AI, which is not available. Chinese text shows as it is."}{" "}
        Listing links open the original Chinese pages; use your browser's Translate there.
      </p>
      <label className="set-currency">
        <span>Also show prices in</span>
        <select className="select" value={currency} onChange={(e) => setCurrency(e.target.value as Currency)}>
          <option value="none">Yuan only</option>
          {CURRENCIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </label>
      <p className="set-help">Approximate, from daily ExchangeRate-API rates.</p>
    </section>
  );
}

function YupooStores({ st }: { st: StatusApi }) {
  const saved = st.status?.yupoo_stores ?? [];
  const [stores, setStores] = useState<string[]>(saved);
  const [text, setText] = useState("");
  const [invalid, setInvalid] = useState<string[]>([]);
  const [justSaved, setJustSaved] = useState(false);
  const revision = useRef(0);
  const submitted = useRef<number | null>(null);
  const savedKey = saved.join("\n");

  useEffect(() => {
    if (submitted.current == null || submitted.current === revision.current) setStores(savedKey ? savedKey.split("\n") : []);
    submitted.current = null;
  }, [savedKey]);

  const dirty = stores.join("\n") !== savedKey;

  const add = (e?: FormEvent) => {
    e?.preventDefault();
    const { stores: parsed, invalid: bad } = parseStores(text);
    setInvalid(bad);
    if (parsed.length) {
      revision.current++;
      setStores((list) => [...list, ...parsed.filter((p) => !list.includes(p))]);
      setText(bad.join(" "));
    }
  };

  const save = async () => {
    submitted.current = revision.current;
    if (await st.saveStores(stores)) {
      setJustSaved(true);
      setTimeout(() => setJustSaved(false), 2500);
    }
  };

  return (
    <section className="set-section">
      <h3>
        Yupoo stores <span className="muted">{stores.length}</span>
      </h3>
      <p className="set-help">
        Store names are Yupoo subdomains: <code>philanthropist</code> for <code>philanthropist.x.yupoo.com</code>. You can paste full
        store URLs, several at once.
      </p>
      <form className="store-add" onSubmit={add}>
        <input
          className="input"
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setInvalid([]);
          }}
          placeholder="Store name or URL"
          aria-label="Add Yupoo stores"
          spellCheck={false}
        />
        <button type="submit" className="btn" disabled={!text.trim()}>
          Add
        </button>
      </form>
      {invalid.length ? <p className="set-error">Not a Yupoo store: {invalid.join(", ")}</p> : null}
      {stores.length ? (
        <ul className="store-list">
          {stores.map((s) => (
            <li key={s} className="store">
              <span>{s}</span>
              <button
                type="button"
                className="store-remove"
                aria-label={`Remove ${s}`}
                onClick={() => { revision.current++; setStores((list) => list.filter((x) => x !== s)); }}
              >
                <IconX size={10} />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="set-help">No stores. Yupoo is skipped until you add some.</p>
      )}
      <div className="store-actions">
        <button type="button" className="btn btn--primary" disabled={!dirty || st.busy === "stores"} onClick={() => void save()}>
          {st.busy === "stores" ? <Spinner size={11} /> : null}
          Save
        </button>
        {dirty ? (
          <button type="button" className="btn btn--ghost" onClick={() => { revision.current++; setStores(saved); }}>
            Revert
          </button>
        ) : justSaved ? (
          <span className="state state--ok">
            <IconCheck size={12} /> Saved
          </span>
        ) : null}
      </div>
    </section>
  );
}
