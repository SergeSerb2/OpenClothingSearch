import { useEffect, useState } from "react";
import type { RefImage, SourceStatus, StreamState } from "../api/types";
import { duration, pct, timeAgo } from "../lib/format";
import type { LiveSearch } from "../lib/searchState";
import { METHOD_LABEL, SOURCE_LABEL, STAGES } from "../lib/sources";
import { toast } from "../lib/toast";
import { Blockers, type BlockerActions } from "./Blockers";
import { IconAlert, IconCheck, IconKey, IconLock, IconRefresh, IconSparkle, Spinner } from "./Icons";
import { useCatalog } from "../lib/catalog";
import { MODES, MODE_LABEL, describeOptions, searchTitle } from "../lib/options";
import { En } from "./En";
import { Img } from "./Img";
import { tipOf, useEn, useEnglish, useEnglishOnly } from "../lib/translate";

interface Props {
  live: LiveSearch;
  stream: StreamState;
  streamError: string | null;
  rerank: { pending: boolean; error: string | null };
  onReferences: (selected: string[]) => void;
  onReconnect: () => void;
  actions: BlockerActions;
  onCompleteLook: () => void;
  completeBusy: boolean;
}

export function RunHeader({ live, stream, streamError, rerank, onReferences, onReconnect, actions, onCompleteLook, completeBusy }: Props) {
  const s = live.snapshot;
  const running = s.status === "running";
  const { index } = useCatalog();
  const title = searchTitle(s, index);
  const hasOptions = !!s.options && Object.keys(s.options).length > 0;
  const mode = s.options?.mode ?? (hasOptions ? "exact" : null);
  const chips = describeOptions({ ...s.options, mode: undefined }, index);
  const shownTitle = useEn(title);
  const english = useEnglishOnly();

  return (
    <section className="run" aria-label="Search progress">
      <div className="run-head">
        <h1
          className={`run-title ${shownTitle.pending ? "is-translating" : ""}`}
          lang={shownTitle.lang}
          title={shownTitle.original ?? undefined}
        >
          {shownTitle.text}
        </h1>
        {mode ? (
          <span className={`mode-badge mode-badge--${mode}`} title={MODES.find((m) => m.id === mode)?.help}>
            {MODE_LABEL[mode]}
          </span>
        ) : null}
        <RunMeta live={live} />
        <button
          type="button"
          className="btn btn--sm run-complete"
          onClick={onCompleteLook}
          disabled={completeBusy || s.status === "error"}
          title="Ask the AI stylist for pieces that go with this item"
        >
          {completeBusy ? <Spinner size={11} /> : <IconSparkle size={13} />}
          Complete the look
        </button>
      </div>
      {chips.length ? (
        <div className="run-options">
          {chips.map((c) => (
            <span key={c.key} className="ochip">
              {c.swatch ? <span className="ochip-swatch" style={{ background: c.swatch }} /> : null}
              {c.label}
              {c.zh && !english ? (
                <span className="ochip-zh" lang="zh">
                  {c.zh}
                </span>
              ) : null}
            </span>
          ))}
        </div>
      ) : null}

      <StageTrack live={live} />

      {s.status === "error" ? (
        <div className="alert alert--error" role="alert">
          <IconAlert size={14} />
          <span>
            <strong>Search failed.</strong> {s.error || "Unknown error."}
          </span>
          {actions.onSearchAgain ? (
            <button type="button" className="btn btn--sm" onClick={actions.onSearchAgain}>
              Try again
            </button>
          ) : null}
        </div>
      ) : null}

      {running && (stream === "reconnecting" || streamError) ? (
        <div className="alert alert--warn" role="status">
          {streamError ? <IconAlert size={14} /> : <Spinner size={12} />}
          <span>{streamError ? `Lost the live updates: ${streamError}` : "Connection dropped. Reconnecting…"}</span>
          {streamError ? (
            <button type="button" className="btn btn--sm" onClick={onReconnect}>
              <IconRefresh size={12} /> Reconnect
            </button>
          ) : null}
        </div>
      ) : null}

      <dl className="run-rows">
        <PlanRow live={live} />
        <QueryRow live={live} />
        <ReferenceRow refs={s.references} provider={s.ref_provider} stage={s.stage} running={running} rerank={rerank} onChange={onReferences} />
        <SourceRow sources={s.sources} running={running} stage={s.stage} />
      </dl>

      {s.listings.length === 0 && s.status !== "running" ? null : <Blockers sources={s.sources} actions={actions} />}
    </section>
  );
}

function RunMeta({ live }: { live: LiveSearch }) {
  const s = live.snapshot;
  const running = s.status === "running";
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [running]);
  if (running) {
    return <span className="run-meta">{duration(Math.max(0, now - s.created * 1000))}</span>;
  }
  const parts = [
    s.status === "done" ? (live.elapsedMs != null ? `Done in ${duration(live.elapsedMs)}` : "Done") : "Failed",
    timeAgo(s.created),
  ];
  return <span className="run-meta">{parts.join(" · ")}</span>;
}

function StageTrack({ live }: { live: LiveSearch }) {
  const s = live.snapshot;
  const current = STAGES.findIndex((st) => st.key === s.stage);
  const done = s.stage === "done" || s.status === "done";
  return (
    <div className="stages">
      <ol className="stage-list" aria-label="Stages">
        {STAGES.map((st, i) => {
          const state = done || i < current ? "done" : i === current ? (s.status === "error" ? "failed" : "active") : "todo";
          return (
            <li key={st.key} className={`stage stage--${state}`} aria-current={state === "active" ? "step" : undefined}>
              <span className="stage-mark">
                {state === "done" ? <IconCheck size={11} /> : state === "active" ? <Spinner size={10} /> : state === "failed" ? <IconAlert size={11} /> : null}
              </span>
              {st.label}
            </li>
          );
        })}
      </ol>
      {s.status === "running" && live.stageMessage ? <span className="stage-msg">{live.stageMessage}</span> : null}
    </div>
  );
}

function copy(text: string, what?: string) {
  void navigator.clipboard?.writeText(text).then(
    () => toast(what ? `Copied the ${what}` : `Copied “${text}”`),
    () => undefined,
  );
}

const AVOID_SHOWN = 6;

function PlanRow({ live }: { live: LiveSearch }) {
  const q = live.snapshot.queries;
  const [allAvoid, setAllAvoid] = useState(false);
  const translated = useEnglish(q?.avoid ?? []);
  if (!q || (!q.summary && !q.size_tip && !q.avoid?.length)) return null;
  // A Chinese brand name and its Latin name can translate to the same word: show it once.
  const seen = new Set<string>();
  const avoid = translated.filter((w) => {
    const k = w.text.toLowerCase();
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  const shownAvoid = allAvoid ? avoid : avoid.slice(0, AVOID_SHOWN);
  return (
    <div className="run-row run-row--plan">
      <dt>AI plan</dt>
      <dd>
        <div className="plan">
          {q.summary ? <p className="plan-summary">{q.summary}</p> : null}
          {q.size_tip ? (
            <p className="plan-size">
              <span className="plan-key">Size</span>
              <En text={q.size_tip} />
            </p>
          ) : null}
          {q.avoid?.length ? (
            <p className="plan-avoid">
              <span className="plan-key" title="Titles with these words rank lower">
                Avoid
              </span>
              {shownAvoid.map((w) => (
                <span
                  key={w.original ?? w.text}
                  className={`avoid-word ${w.pending ? "is-translating" : ""}`}
                  lang={w.lang}
                  title={w.original ?? undefined}
                >
                  {w.text}
                </span>
              ))}
              {avoid.length > AVOID_SHOWN ? (
                <button type="button" className="link-btn" onClick={() => setAllAvoid((v) => !v)} aria-expanded={allAvoid}>
                  {allAvoid ? "Show fewer" : `+${avoid.length - AVOID_SHOWN} more`}
                </button>
              ) : null}
            </p>
          ) : null}
        </div>
      </dd>
    </div>
  );
}

function QueryRow({ live }: { live: LiveSearch }) {
  const q = live.snapshot.queries;
  const zh = useEnglish(q?.zh ?? []);
  const waiting = live.snapshot.status === "running" && live.snapshot.stage === "queries";
  return (
    <div className="run-row">
      <dt>Queries</dt>
      <dd>
        {q ? (
          <div className="chips">
            {q.zh.map((t, i) => {
              const s = zh[i];
              return (
                <button
                  key={`zh${t}`}
                  type="button"
                  className={`qchip ${s.pending ? "is-translating" : ""}`}
                  lang={s.lang}
                  onClick={() => copy(t, s.original ? "Chinese search term" : undefined)}
                  title={s.original ? `Chinese: ${t}\nClick to copy the Chinese, for searching on the site` : "Copy"}
                >
                  {s.text}
                </button>
              );
            })}
            {q.codes.map((t) => (
              <button key={`c${t}`} type="button" className="qchip qchip--code" onClick={() => copy(t)} title="Style code · copy">
                {t}
              </button>
            ))}
            {q.en.map((t) => (
              <button key={`en${t}`} type="button" className="qchip qchip--en" onClick={() => copy(t)} title="Copy">
                {t}
              </button>
            ))}
            {q.category ? <span className="muted qcat">{q.category}</span> : null}
          </div>
        ) : waiting ? (
          <span className="muted">
            <Spinner size={10} /> Asking AI for the terms sellers use…
          </span>
        ) : (
          <span className="muted">None. Searched with the text as typed.</span>
        )}
      </dd>
    </div>
  );
}

function providerName(p: string | null): string {
  if (!p) return "";
  return p.replace(/^\w/, (c) => c.toUpperCase());
}

function host(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

function ReferenceRow({
  refs,
  provider,
  stage,
  running,
  rerank,
  onChange,
}: {
  refs: RefImage[];
  provider: string | null;
  stage: string;
  running: boolean;
  rerank: { pending: boolean; error: string | null };
  onChange: (selected: string[]) => void;
}) {
  const selected = refs.filter((r) => r.selected);
  const titles = useEnglish(refs.map((r) => (r.url === "upload" ? "" : r.title)));
  const toggle = (r: RefImage) => {
    if (running) return;
    if (r.selected && selected.length === 1) {
      toast("Keep at least one reference photo.", "error");
      return;
    }
    const next = refs.filter((x) => (x.key === r.key ? !x.selected : x.selected)).map((x) => x.key);
    onChange(next);
  };
  const waiting = running && (stage === "queries" || stage === "references") && refs.length === 0;
  return (
    <div className="run-row">
      <dt>References</dt>
      <dd>
        {refs.length === 0 ? (
          waiting ? (
            <span className="muted">
              <Spinner size={10} /> Finding reference photos…
            </span>
          ) : (
            <span className="muted">{running ? "None yet." : stage === "references" || stage === "queries" ? "None. The search stopped before this step." : "No reference photos. Ranking uses text only."}</span>
          )
        ) : (
          <div className="refs">
            <div className="ref-strip">
              {refs.map((r, i) => (
                <button
                  key={r.key}
                  type="button"
                  className={`ref ${r.selected ? "is-on" : "is-off"}`}
                  aria-pressed={r.selected}
                  aria-disabled={running || undefined}
                  onClick={() => toggle(r)}
                  title={[
                    r.url === "upload" ? "Your photo" : tipOf(titles[i]),
                    r.page ? host(r.page) : "",
                    `Agrees with the others: ${pct(r.consensus)}%`,
                    running
                      ? "You can change references when the search finishes."
                      : r.selected
                        ? "Used for ranking. Click to drop it: the results are ranked again without the AI check."
                        : "Not used. Click to use it.",
                  ]
                    .filter(Boolean)
                    .join("\n")}
                >
                  <Img imgKey={r.key} alt={r.title} />
                  {r.url === "upload" ? <span className="ref-tag">You</span> : null}
                  <span className="ref-bar" style={{ width: `${Math.round(r.consensus * 100)}%` }} />
                </button>
              ))}
            </div>
            <span className="ref-meta">
              {selected.length} of {refs.length} used
              {provider ? ` · from ${providerName(provider)}` : ""}
              {rerank.pending ? (
                <span className="ref-status">
                  <Spinner size={10} /> Re-ranking…
                </span>
              ) : rerank.error ? (
                <span className="ref-status ref-status--error">Couldn't re-rank: {rerank.error}</span>
              ) : null}
            </span>
          </div>
        )}
      </dd>
    </div>
  );
}

const STATE_TEXT: Record<SourceStatus["state"], string> = {
  pending: "Waiting",
  running: "Searching",
  done: "Done",
  error: "Failed",
  needs_login: "Needs login",
  needs_key: "Needs API key",
  skipped: "Skipped",
};

function SourceRow({ sources, running, stage }: { sources: SourceStatus[]; running: boolean; stage: string }) {
  const sorted = [...sources].sort((a, b) => order(a) - order(b));
  return (
    <div className="run-row">
      <dt>Sources</dt>
      <dd>
        {sources.length === 0 ? (
          <span className="muted">{running && (stage === "queries" || stage === "references") ? "Starts after the reference photos." : "No sources ran."}</span>
        ) : (
          <div className="chips">
            {sorted.map((src) => (
              <span
                key={`${src.source}:${src.method}:${src.provider}`}
                className={`schip schip--${src.state}`}
                title={`${SOURCE_LABEL[src.source]} ${METHOD_LABEL[src.method]} via ${src.provider}: ${STATE_TEXT[src.state]}${src.message ? `. ${src.message}` : ""}`}
              >
                <span className="schip-mark">
                  {src.state === "running" ? (
                    <Spinner size={9} />
                  ) : src.state === "needs_login" ? (
                    <IconLock size={11} />
                  ) : src.state === "needs_key" ? (
                    <IconKey size={11} />
                  ) : src.state === "error" ? (
                    <IconAlert size={11} />
                  ) : (
                    <span className="dot" />
                  )}
                </span>
                <span className="schip-name">{SOURCE_LABEL[src.source]}</span>
                <span className="schip-method">{METHOD_LABEL[src.method]}</span>
                {src.provider !== "browser" ? <span className="schip-provider">{src.provider}</span> : null}
                {src.state === "done" || (src.state === "running" && src.count > 0) ? <span className="schip-count">{src.count}</span> : null}
              </span>
            ))}
          </div>
        )}
      </dd>
    </div>
  );
}

const SOURCE_ORDER = ["taobao", "1688", "weidian", "yupoo", "google"];
const METHOD_ORDER = ["text", "image", "lens", "store"];
function order(s: SourceStatus): number {
  return SOURCE_ORDER.indexOf(s.source) * 10 + METHOD_ORDER.indexOf(s.method);
}
