import { useEffect, useId, useRef, useState } from "react";
import type { AiConfig, AiTestResult, KeyId } from "../api/types";
import { errorMessage } from "../hooks/useSearch";
import type { StatusApi } from "../hooks/useStatus";
import { API_KEYS } from "../lib/sources";
import { toast } from "../lib/toast";
import { IconCheck, IconX, Spinner } from "./Icons";

type Draft = Omit<AiConfig, "api_key"> & { api_key: string };

const trimUrl = (u: string) => u.trim().replace(/\/+$/, "");

/** Pick an AI provider, paste a key, test it, save it to .env. */
export function AiSection({ st }: { st: StatusApi }) {
  const status = st.status!;
  const providers = status.providers ?? [];
  const saved = status.ai;
  const savedVision: Draft["vision"] = saved?.vision_setting === "off" ? "off" : "auto";
  const fromSaved = (): Draft => ({
    provider: saved?.provider ?? "custom",
    base_url: saved?.base_url ?? "",
    model: saved?.model ?? "",
    api_key: "",
    vision: savedVision,
  });
  const [draft, setDraft] = useState<Draft>(fromSaved);
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<AiTestResult | null>(null);
  const [testError, setTestError] = useState<string | null>(null);
  const testSeq = useRef(0);
  const ids = { provider: useId(), url: useId(), key: useId(), model: useId(), models: useId() };
  const savedSig = `${saved?.provider}|${saved?.base_url}|${saved?.model}|${saved?.key_set}|${saved?.vision_setting}`;

  // After a save (or a reload of the status), start again from the saved values.
  useEffect(() => {
    setDraft(fromSaved());
  }, [savedSig]);

  const preset = providers.find((p) => p.id === draft.provider);
  const sameUrl = trimUrl(draft.base_url) === (saved?.base_url ?? "");
  const keySaved = !!saved?.key_set && sameUrl;
  const missingKey = !!preset?.needs_key && !draft.api_key.trim() && !keySaved;
  const dirty =
    draft.provider !== saved?.provider ||
    trimUrl(draft.base_url) !== (saved?.base_url ?? "") ||
    draft.model.trim() !== (saved?.model ?? "") ||
    draft.api_key.trim() !== "" ||
    draft.vision !== savedVision;
  const config = (): AiConfig => ({
    provider: draft.provider,
    base_url: trimUrl(draft.base_url),
    model: draft.model.trim(),
    api_key: draft.api_key.trim() ? draft.api_key.trim() : null,
    vision: draft.vision,
  });
  const set = (patch: Partial<Draft>) => {
    setDraft((d) => ({ ...d, ...patch }));
    if (patch.base_url !== undefined || patch.api_key !== undefined || patch.provider !== undefined || patch.model !== undefined) {
      testSeq.current++;
      setTesting(false);
      setResult(null);
      setTestError(null);
    }
  };

  const pick = (id: string) => {
    const p = providers.find((x) => x.id === id);
    if (id === saved?.provider) set({ ...fromSaved(), vision: draft.vision });
    else set({ provider: id, base_url: p?.base_url ?? "", model: p?.model ?? "", api_key: "" });
  };

  const test = async () => {
    const seq = ++testSeq.current;
    setTesting(true);
    setTestError(null);
    try {
      const r = await st.testAi(config());
      if (seq !== testSeq.current) return; // the settings changed while the test ran
      setResult(r);
      // The model cannot read photos: save it with photos off (the user can turn them back on).
      if (r.chat.ok && r.vision.unsupported) setDraft((d) => ({ ...d, vision: "off" }));
    } catch (e) {
      if (seq !== testSeq.current) return;
      setResult(null);
      setTestError(errorMessage(e));
    } finally {
      if (seq === testSeq.current) setTesting(false);
    }
  };

  const save = async () => {
    if (await st.saveAi(config())) toast("AI settings saved.");
  };

  const models = result?.models ?? [];
  const unknownModel = models.length > 0 && draft.model.trim() !== "" && !models.includes(draft.model.trim());

  return (
    <section className="set-section">
      <h3>AI provider</h3>
      <p className="set-help">
        The AI writes the Chinese search terms, checks photos, translates titles and runs the stylist. Search still works
        without it, with fewer features. Free choices: Google Gemini's free tier, or Ollama on this computer.
      </p>
      <p className="ai-now">
        {status.llm && saved ? (
          <span className="state state--ok">
            <IconCheck size={12} /> {providers.find((p) => p.id === saved.provider)?.name ?? "Connected"} · {saved.model}
            {saved.vision ? " · reads photos" : " · no photos"}
          </span>
        ) : (
          <span className="state state--off">
            <span className="dot" /> Not set up
          </span>
        )}
      </p>

      <div className="ai-form">
        <label className="ai-field" htmlFor={ids.provider}>
          <span className="ai-label">Provider</span>
          <select id={ids.provider} className="select select--full" value={draft.provider} onChange={(e) => pick(e.target.value)}>
            {providers.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        {preset?.note ? (
          <p className="set-help ai-note">
            {preset.note}{" "}
            {preset.key_url ? (
              <a href={preset.key_url} target="_blank" rel="noopener noreferrer">
                {preset.needs_key ? "Get a key" : "Download"}
              </a>
            ) : null}
          </p>
        ) : null}
        <label className="ai-field" htmlFor={ids.url}>
          <span className="ai-label">Base URL</span>
          <input
            id={ids.url}
            className="input"
            value={draft.base_url}
            onChange={(e) => set({ base_url: e.target.value })}
            placeholder="https://example.com/v1"
            spellCheck={false}
            autoComplete="off"
          />
        </label>
        <label className="ai-field" htmlFor={ids.key}>
          <span className="ai-label">API key{preset?.needs_key ? "" : " (optional)"}</span>
          <input
            id={ids.key}
            className="input"
            type="password"
            value={draft.api_key}
            onChange={(e) => set({ api_key: e.target.value })}
            placeholder={keySaved ? "Saved. Paste a new key to change it." : preset?.needs_key ? "Paste your API key" : "Local servers usually need no key"}
            spellCheck={false}
            autoComplete="off"
          />
        </label>
        <label className="ai-field" htmlFor={ids.model}>
          <span className="ai-label">Model</span>
          <input
            id={ids.model}
            className="input"
            list={ids.models}
            value={draft.model}
            onChange={(e) => set({ model: e.target.value })}
            placeholder={models.length ? "Pick a model from the list" : "Model name"}
            spellCheck={false}
            autoComplete="off"
          />
          <datalist id={ids.models}>
            {models.map((m) => (
              <option key={m} value={m} />
            ))}
          </datalist>
        </label>
        <label className="check ai-vision">
          <input type="checkbox" checked={draft.vision === "auto"} onChange={(e) => set({ vision: e.target.checked ? "auto" : "off" })} />
          <span>
            Send photos to the AI <span className="muted">(for photo checks and Shop the look; needs a model that reads photos)</span>
          </span>
        </label>
      </div>

      <div className="ai-actions">
        <button type="button" className="btn" onClick={() => void test()} disabled={testing || !draft.base_url.trim()}>
          {testing ? <Spinner size={11} /> : null}
          Test connection
        </button>
        <button type="button" className="btn btn--primary" onClick={() => void save()} disabled={!dirty || missingKey || st.busy === "ai" || !draft.base_url.trim()}>
          {st.busy === "ai" ? <Spinner size={11} /> : null}
          Save
        </button>
        {missingKey ? <span className="muted">Paste your API key first.</span> : null}
      </div>

      {testError ? (
        <p className="ai-result ai-result--bad">
          <IconX size={11} /> {testError}
        </p>
      ) : null}
      {result ? (
        <ul className="ai-results" aria-live="polite">
          <li className={result.chat.ok ? "ai-result ai-result--ok" : "ai-result ai-result--bad"}>
            {result.chat.ok ? <IconCheck size={12} /> : <IconX size={11} />}
            {result.chat.ok ? `Answers in ${((result.chat.ms ?? 0) / 1000).toFixed(1)} s` : result.chat.error}
          </li>
          {result.chat.ok ? (
            <li className={result.vision.ok ? "ai-result ai-result--ok" : "ai-result ai-result--warn"}>
              {result.vision.ok ? <IconCheck size={12} /> : <IconX size={11} />}
              {result.vision.ok ? "Reads photos" : `No photos: ${result.vision.error ?? "the model did not read the test photo."} Photo checks and Shop the look will be off.`}
            </li>
          ) : null}
          <li className="ai-result muted">
            {models.length ? `${models.length} models found. Pick one in the Model field.` : result.models_error ?? "The provider listed no models."}
          </li>
          {unknownModel ? <li className="ai-result ai-result--warn">This model name is not in the provider's list.</li> : null}
        </ul>
      ) : null}
    </section>
  );
}

/** Optional service keys. Values are written to .env and never shown again. */
export function KeysSection({ st }: { st: StatusApi }) {
  const status = st.status!;
  const [values, setValues] = useState<Partial<Record<KeyId, string>>>({});
  const save = async (id: KeyId, value: string) => {
    if (await st.saveKeys({ [id]: value })) {
      setValues((v) => ({ ...v, [id]: "" }));
      toast(value ? "Key saved." : "Key removed.");
    }
  };
  return (
    <section className="set-section">
      <h3>API keys</h3>
      <p className="set-help">All keys are optional; each one turns on more sources. Keys are saved in the project's .env file.</p>
      <ul className="keys">
        {API_KEYS.map((k) => {
          const ok = status.keys[k.id];
          const fromEnv = !!status.keys_env?.[k.id];
          const value = values[k.id] ?? "";
          return (
            <li key={k.id} className="key-row">
              <div className="key-head">
                <span className="set-name">{k.name}</span>
                <span className={`state ${ok ? "state--ok" : "state--off"}`}>
                  {ok ? <IconCheck size={12} /> : <span className="dot" />}
                  {fromEnv ? "Set in your shell environment" : ok ? "Set" : "Not set"}
                </span>
                <a className="key-link" href={k.url} target="_blank" rel="noopener noreferrer">
                  Get a key
                </a>
              </div>
              <p className="set-help key-about">{k.about}</p>
              <form
                className="key-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (value.trim()) void save(k.id, value.trim());
                }}
              >
                <input
                  className="input input--sm"
                  type="password"
                  value={value}
                  onChange={(e) => setValues((v) => ({ ...v, [k.id]: e.target.value }))}
                  placeholder={ok ? "Paste a new key to replace it" : `Paste your ${k.name} key`}
                  aria-label={`${k.name} key`}
                  autoComplete="off"
                  spellCheck={false}
                />
                <button type="submit" className="btn btn--sm" disabled={!value.trim() || st.busy === "keys"}>
                  Save
                </button>
                {ok ? (
                  <button type="button" className="btn btn--sm btn--ghost" disabled={st.busy === "keys"} onClick={() => void save(k.id, "")}>
                    Remove
                  </button>
                ) : null}
              </form>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
