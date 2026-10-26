import { useCallback, useEffect, useState } from "react";
import { ApiError } from "../api/client";
import { useApi } from "../api/context";
import type { Look } from "../api/types";
import { errorMessage } from "../hooks/useSearch";
import { newBoardId, saveBoard, type Board, type BoardItem } from "../lib/boards";
import { useCatalog } from "../lib/catalog";
import { plural } from "../lib/format";
import { startItems } from "../hooks/useBoardLive";
import { isLook } from "../lib/validation";
import { useEnglishOnly } from "../lib/translate";
import { Crop } from "./Crop";
import { IconAlert, Spinner } from "./Icons";

interface Props {
  uploadKey: string;
  onBoard: (id: string) => void;
  onAnother: () => void;
}

const cacheKey = (k: string) => `look:${k}`;

/** Shop the look: finds each clothing item in an outfit photo, then searches the chosen ones. */
export function LookView({ uploadKey, onBoard, onAnother }: Props) {
  const api = useApi();
  const { index } = useCatalog();
  const english = useEnglishOnly();
  const [look, setLook] = useState<Look | null>(() => {
    try {
      const raw = sessionStorage.getItem(cacheKey(uploadKey));
      const value: unknown = raw ? JSON.parse(raw) : null;
      if (isLook(value, uploadKey)) return value;
      if (raw) sessionStorage.removeItem(cacheKey(uploadKey));
      return null;
    } catch {
      try { sessionStorage.removeItem(cacheKey(uploadKey)); } catch { /* Storage is blocked. */ }
      return null;
    }
  });
  const [error, setError] = useState<string | null>(null);
  /** No clothing: the backend now answers 200 with no items; older versions answered 422. */
  const [noneFound, setNoneFound] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [picked, setPicked] = useState<Set<number> | null>(null);
  const [queries, setQueries] = useState<Record<number, string>>({});
  const [hover, setHover] = useState<number | null>(null);
  const [aspect, setAspect] = useState<number | undefined>(undefined);
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    if (look || noneFound) return;
    let cancelled = false;
    setError(null);
    api
      .look(uploadKey)
      .then((l) => {
        if (cancelled) return;
        setLook(l);
        try {
          sessionStorage.setItem(cacheKey(uploadKey), JSON.stringify(l));
        } catch {
          // ignore
        }
      })
      .catch((e) => {
        if (cancelled) return;
        if (e instanceof ApiError && e.status === 422) setNoneFound(e.message);
        else setError(errorMessage(e));
      });
    return () => {
      cancelled = true;
    };
  }, [api, uploadKey, attempt, look, noneFound]);

  const photoUrl = api.imgUrl(uploadKey);
  const items = look?.items ?? [];
  const empty = noneFound != null || (look != null && items.length === 0);
  const selected = picked ?? new Set(items.map((_, i) => i));

  const search = useCallback(async () => {
    if (!look) return;
    setStarting(true);
    const chosen = look.items.map((it, i) => ({ it, i })).filter(({ i }) => selected.has(i));
    const board: Board = {
      id: newBoardId(api.mock),
      kind: "look",
      title: chosen.length === 1 ? chosen[0].it.label : "Shop the look",
      created: Date.now() / 1000,
      photo_key: uploadKey,
      photo_aspect: aspect,
      mock: api.mock,
      items: chosen.map(
        ({ it, i }): BoardItem => ({
          key: `i${i}`,
          label: it.label,
          query: (queries[i] ?? it.query).trim() || it.query,
          options: { mode: "similar", category: it.category, colors: it.colors },
          upload_keys: it.crop_key ? [it.crop_key] : [],
          crop_key: it.crop_key,
          box: it.box,
          search_id: null,
        }),
      ),
    };
    saveBoard(board);
    const launching = startItems(api, board, board.items.map((i) => i.key));
    onBoard(board.id);
    await launching;
    setStarting(false);
  }, [api, aspect, look, onBoard, queries, selected, uploadKey]);

  return (
    <div className="look">
      <header className="look-head">
        <span className="board-kind">Shop the look</span>
        <h1>
          {empty ? "No clothing found" : look ? `Found ${plural(items.length, "item")}` : error ? "Couldn't read this photo" : "Finding the clothes in your photo…"}
        </h1>
        <p className="muted">
          {look && items.length
            ? "Each item is searched on its own in Similar style mode, using its crop as the reference photo."
            : "The AI marks each clothing item; then you choose which ones to search."}
        </p>
      </header>

      <div className="look-body">
        <figure className={`look-photo ${!look && !error && !empty ? "is-scanning" : ""}`}>
          <img
            src={photoUrl}
            alt="Your outfit photo"
            onLoad={(e) => setAspect(e.currentTarget.naturalWidth / Math.max(1, e.currentTarget.naturalHeight))}
          />
          {items.map((it, i) => {
            const [x0, y0, x1, y1] = it.box;
            return (
              <button
                key={i}
                type="button"
                className={`look-box ${selected.has(i) ? "is-on" : "is-off"} ${hover === i ? "is-hover" : ""}`}
                style={{ left: `${x0 * 100}%`, top: `${y0 * 100}%`, width: `${(x1 - x0) * 100}%`, height: `${(y1 - y0) * 100}%` }}
                onMouseEnter={() => setHover(i)}
                onMouseLeave={() => setHover(null)}
                onClick={() => {
                  const next = new Set(selected);
                  if (next.has(i)) next.delete(i);
                  else next.add(i);
                  setPicked(next);
                }}
                aria-label={`${selected.has(i) ? "Skip" : "Include"} ${it.label}`}
              >
                <span className="look-box-label">
                  {i + 1}. {it.label}
                </span>
              </button>
            );
          })}
          {!look && !error && !empty ? <span className="look-scan" aria-hidden="true" /> : null}
        </figure>

        <div className="look-side">
          {error ? (
            <div className="alert alert--error" role="alert">
              <IconAlert size={14} />
              <span>{error}</span>
              <button type="button" className="btn btn--sm" onClick={() => setAttempt((n) => n + 1)}>
                Retry
              </button>
            </div>
          ) : null}
          {!look && !error && !empty ? (
            <div className="look-wait">
              <Spinner /> This takes a few seconds.
            </div>
          ) : null}
          {empty ? (
            <div className="empty empty--left">
              <p className="empty-title">{noneFound ?? "No clothing items found in this photo."}</p>
              <p className="empty-text">Use a photo where the outfit is clearly visible, ideally full body, in good light.</p>
            </div>
          ) : null}

          {items.length ? (
            <ul className="look-items">
              {items.map((it, i) => {
                const cat = index?.category.get(it.category);
                return (
                  <li
                    key={i}
                    className={`look-item ${selected.has(i) ? "" : "is-off"} ${hover === i ? "is-hover" : ""}`}
                    onMouseEnter={() => setHover(i)}
                    onMouseLeave={() => setHover(null)}
                  >
                    <input
                      type="checkbox"
                      checked={selected.has(i)}
                      aria-label={`Include ${it.label}`}
                      onChange={(e) => {
                        const next = new Set(selected);
                        if (e.target.checked) next.add(i);
                        else next.delete(i);
                        setPicked(next);
                      }}
                    />
                    <Crop cropKey={it.crop_key} photoKey={uploadKey} box={it.box} photoAspect={aspect} className="look-crop" />
                    <div className="look-item-info">
                      <span className="look-item-label">
                        {i + 1}. {it.label}
                      </span>
                      <span className="muted look-item-meta">
                        {cat ? (english ? cat.name : `${cat.name} · ${cat.zh}`) : it.category}
                        {it.colors.map((c) => {
                          const color = index?.color.get(c);
                          return color ? <span key={c} className="ochip-swatch" style={{ background: color.hex }} title={color.name} /> : null;
                        })}
                        {it.crop_key ? null : <span title="The backend could not crop this item; the photo region is shown instead."> · no crop</span>}
                      </span>
                      <input
                        className="input input--sm look-query"
                        value={queries[i] ?? it.query}
                        onChange={(e) => setQueries((q) => ({ ...q, [i]: e.target.value }))}
                        aria-label={`Search words for ${it.label}`}
                      />
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : null}

          <div className="look-actions">
            {items.length ? (
              <button type="button" className="btn btn--primary" disabled={selected.size === 0 || starting} onClick={() => void search()}>
                {starting ? <Spinner size={12} /> : null}
                {selected.size ? `Search ${plural(selected.size, "item")}` : "Pick at least one item"}
              </button>
            ) : null}
            <button type="button" className="btn" onClick={onAnother}>
              Try another photo
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
