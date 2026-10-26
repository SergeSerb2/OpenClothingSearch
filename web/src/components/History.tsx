import type { HistoryItem } from "../api/types";
import type { HistoryApi } from "../hooks/useHistory";
import { useCatalog, type CatalogIndex } from "../lib/catalog";
import { plural, timeAgo } from "../lib/format";
import { searchTitle } from "../lib/options";
import { Spinner } from "./Icons";
import { En } from "./En";
import { Img } from "./Img";

interface Props {
  history: HistoryApi;
  currentId: string | null;
  onOpen: (id: string) => void;
  limit?: number;
}

function label(h: HistoryItem, idx: CatalogIndex | null): string {
  // The same title as the results page ("Grey hoodie", not the AI's plan sentence).
  return searchTitle({ query: h.query, options: h.options, queries: { summary: h.summary }, upload_keys: h.query ? [] : ["photo"] }, idx);
}

export function HistoryList({ history, currentId, onOpen, limit }: Props) {
  const { index } = useCatalog();
  const { items, error, loading, refresh } = history;
  if (items == null) {
    if (error) {
      return (
        <div className="panel-empty">
          <p>Can't load recent searches: {error}</p>
          <button type="button" className="btn btn--sm" onClick={() => void refresh()}>
            Retry
          </button>
        </div>
      );
    }
    return (
      <div className="panel-empty">
        <Spinner /> Loading…
      </div>
    );
  }
  if (items.length === 0) {
    return <p className="panel-empty muted">No searches yet.</p>;
  }
  const shown = limit ? items.slice(0, limit) : items;
  return (
    <ul className={`history ${loading ? "is-loading" : ""}`}>
      {shown.map((h) => (
        <li key={h.id}>
          <button
            type="button"
            className={`history-item ${h.id === currentId ? "is-current" : ""}`}
            onClick={() => onOpen(h.id)}
            aria-current={h.id === currentId || undefined}
          >
            <Img imgKey={h.thumb_key} className="history-thumb" />
            <span className="history-text">
              <En text={label(h, index)} className="history-query" />
              <span className="history-meta">
                {timeAgo(h.created)}
                {" · "}
                {h.status === "running" ? (
                  <span className="history-running">Running</span>
                ) : h.status === "error" ? (
                  <span className="history-error">Failed</span>
                ) : (
                  plural(h.count, "listing")
                )}
              </span>
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}
