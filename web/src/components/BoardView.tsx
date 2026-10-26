import { useMemo, useState } from "react";
import { useApi } from "../api/context";
import { useBoardLive, startItems, type ItemLive } from "../hooks/useBoardLive";
import { deleteBoard, useBoards, type Board, type BoardItem } from "../lib/boards";
import { inkFor, useCatalog } from "../lib/catalog";
import { pct, plural, timeAgo, yuan } from "../lib/format";
import { useMoney } from "../lib/money";
import { MODE_LABEL, describeOptions } from "../lib/options";
import { STAGES, listingSourceLabel, tierOf } from "../lib/sources";
import { useEnglish, useEnglishOnly } from "../lib/translate";
import { Crop } from "./Crop";
import { En } from "./En";
import { IconAlert, IconCheck, IconExternal, Spinner } from "./Icons";
import { Img } from "./Img";
import { previewHandlers, thumbKey } from "./ListingCard";

const KIND_LABEL: Record<Board["kind"], string> = {
  look: "Shop the look",
  suggest: "AI stylist",
  complete: "Complete the look",
};

interface Props {
  boardId: string;
  mock: boolean;
  onOpenSearch: (id: string) => void;
  onHome: () => void;
}

export function BoardView({ boardId, mock, onOpenSearch, onHome }: Props) {
  const api = useApi();
  const boards = useBoards(mock);
  const board = boards.find((b) => b.id === boardId);
  const ids = useMemo(() => (board ? board.items.map((i) => i.search_id).filter((x): x is string => !!x) : []), [board]);
  const live = useBoardLive(ids);
  const [picked, setPicked] = useState<Set<string> | null>(null);
  const [starting, setStarting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  if (!board) {
    return (
      <div className="empty">
        <p className="empty-title">This board is not saved on this computer.</p>
        <p className="empty-text">Boards are kept in this browser only.</p>
        <div className="empty-actions">
          <button type="button" className="btn" onClick={onHome}>
            Back
          </button>
        </div>
      </div>
    );
  }

  const unsearched = board.items.filter((i) => !i.search_id && !i.launching);
  const selected = picked ?? new Set(unsearched.map((i) => i.key));
  const toStart = unsearched.filter((i) => selected.has(i.key));
  const doneCount = board.items.filter((i) => i.search_id && live.get(i.search_id)?.status === "done").length;
  const runningCount = board.items.filter((i) => i.search_id && live.get(i.search_id)?.status !== "done" && live.get(i.search_id)?.status !== "error").length;

  const start = async (keys: string[]) => {
    setStarting(true);
    await startItems(api, board, keys);
    setStarting(false);
    setPicked(null);
  };

  return (
    <div className="board">
      <header className="board-head">
        {board.photo_key ? (
          <Img imgKey={board.photo_key} className="board-photo" alt="Outfit photo" />
        ) : board.anchor?.thumb_key ? (
          <Img imgKey={board.anchor.thumb_key} className="board-photo" alt="" />
        ) : null}
        <div className="board-title">
          <span className="board-kind">{KIND_LABEL[board.kind]}</span>
          <h1>{board.title}</h1>
          <span className="muted">
            {plural(board.items.length, "item")}
            {ids.length ? ` · ${doneCount} of ${ids.length} searches done` : ""}
            {runningCount ? ` · ${runningCount} running` : ""} · {timeAgo(board.created)}
          </span>
          {board.anchor ? (
            <button type="button" className="link-btn board-anchor" onClick={() => onOpenSearch(board.anchor!.search_id)}>
              Goes with: <En text={board.anchor.label} />
            </button>
          ) : null}
        </div>
        <div className="board-actions">
          {toStart.length ? (
            <button type="button" className="btn btn--primary" disabled={starting} onClick={() => void start(toStart.map((i) => i.key))}>
              {starting ? <Spinner size={12} /> : null}
              Search {plural(toStart.length, "item")}
            </button>
          ) : null}
          {confirmDelete ? (
            <>
              <button
                type="button"
                className="btn btn--danger"
                onClick={() => {
                  deleteBoard(board.id);
                  onHome();
                }}
              >
                Delete board
              </button>
              <button type="button" className="btn btn--ghost" onClick={() => setConfirmDelete(false)}>
                Keep
              </button>
            </>
          ) : (
            <button type="button" className="btn btn--ghost" onClick={() => setConfirmDelete(true)}>
              Delete
            </button>
          )}
        </div>
      </header>

      {board.items.length === 0 ? (
        <div className="empty empty--left">
          <p className="empty-title">This board has no items.</p>
        </div>
      ) : (
        <ol className="bitems">
          {board.items.map((item, i) => (
            <BoardRow
              key={item.key}
              n={i + 1}
              board={board}
              item={item}
              live={item.search_id ? live.get(item.search_id) : undefined}
              checked={selected.has(item.key)}
              onCheck={(on) => {
                const next = new Set(selected);
                if (on) next.add(item.key);
                else next.delete(item.key);
                setPicked(next);
              }}
              onStart={() => void start([item.key])}
              onOpen={() => item.search_id && onOpenSearch(item.search_id)}
              starting={starting || !!item.launching}
            />
          ))}
        </ol>
      )}
    </div>
  );
}

/** Placeholder for an AI suggestion before it has results: its color and category. */
function ItemTile({ item }: { item: BoardItem }) {
  const { index } = useCatalog();
  const color = item.options.colors?.[0] ? index?.color.get(item.options.colors[0]) : undefined;
  const cat = item.options.category ? index?.category.get(item.options.category) : undefined;
  const english = useEnglishOnly();
  const bg = color?.hex ?? "var(--surface-2)";
  return (
    <span className="bitem-thumb item-tile" style={{ background: bg, color: color ? inkFor(color.hex) : "var(--text-3)" }} aria-hidden="true">
      {english ? null : (
        <span className="item-tile-zh" lang="zh">
          {cat?.zh ?? ""}
        </span>
      )}
      <span className="item-tile-name">{cat?.name ?? ""}</span>
    </span>
  );
}

function stageLabel(l: ItemLive | undefined): string {
  if (!l || l.status === "unknown") return "Starting…";
  const st = STAGES.find((s) => s.key === l.stage);
  return `${st?.label ?? "Searching"}${l.count ? ` · ${plural(l.count, "listing")}` : ""}`;
}

function BoardRow({
  n,
  board,
  item,
  live,
  checked,
  onCheck,
  onStart,
  onOpen,
  starting,
}: {
  n: number;
  board: Board;
  item: BoardItem;
  live: ItemLive | undefined;
  checked: boolean;
  onCheck: (on: boolean) => void;
  onStart: () => void;
  onOpen: () => void;
  starting: boolean;
}) {
  const { index } = useCatalog();
  const chips = describeOptions({ ...item.options, mode: undefined, notes: undefined }, index).slice(0, 5);
  const searched = !!item.search_id;
  const status = live?.status;
  const topTitles = useEnglish(live?.top.map((l) => l.title) ?? []);
  const money = useMoney();

  return (
    <li className={`bitem ${searched ? "is-searched" : ""}`}>
      <span className="bitem-n">
        {searched ? (
          n
        ) : (
          <input type="checkbox" checked={checked} onChange={(e) => onCheck(e.target.checked)} aria-label={`Include ${item.label}`} />
        )}
      </span>
      {item.crop_key || (board.photo_key && item.box) ? (
        <Crop cropKey={item.crop_key} photoKey={board.photo_key} box={item.box} photoAspect={board.photo_aspect} className="bitem-thumb" />
      ) : live?.top[0] ? (
        <Img imgKey={thumbKey(live.top[0])} className="bitem-thumb crop" />
      ) : (
        <ItemTile item={item} />
      )}
      <div className="bitem-info">
        {searched ? (
          <button type="button" className="bitem-label stretched" onClick={onOpen}>
            {item.label}
          </button>
        ) : (
          <span className="bitem-label">{item.label}</span>
        )}
        {item.why ? <p className="bitem-why">{item.why}</p> : null}
        <div className="bitem-chips">
          {item.options.mode ? <span className="mode-badge">{MODE_LABEL[item.options.mode]}</span> : null}
          {chips.map((c) => (
            <span key={c.key} className="ochip">
              {c.swatch ? <span className="ochip-swatch" style={{ background: c.swatch }} /> : null}
              {c.label}
            </span>
          ))}
        </div>
        <div className="bitem-status">
          {!searched ? (
            item.start_error ? (
              <span className="bitem-err">
                <IconAlert size={12} /> Couldn't start: {item.start_error}
              </span>
            ) : (
              <span className="muted">Not searched yet</span>
            )
          ) : status === "done" ? (
            <span className="bitem-done">
              <IconCheck size={12} />{" "}
              {live!.count
                ? live!.good
                  ? `${plural(live!.count, "listing")}, ${live!.good} good ${live!.good === 1 ? "match" : "matches"}`
                  : `${plural(live!.count, "listing")}, no strong matches`
                : "No listings found"}
            </span>
          ) : status === "error" ? (
            <span className="bitem-err">
              <IconAlert size={12} /> {live?.error || "Search failed"}
            </span>
          ) : (
            <span className="bitem-running">
              <Spinner size={11} /> {stageLabel(live)}
            </span>
          )}
        </div>
      </div>
      <div className="bitem-top">
        {searched && live?.top.length
          ? live.top.map((l, i) => (
              <a
                key={l.id}
                className={`bmatch tier-${tierOf(l)}`}
                href={l.url}
                target="_blank"
                rel="noopener noreferrer"
                title={`${topTitles[i]?.text ?? l.title}\nOpen on ${listingSourceLabel(l)}`}
                {...previewHandlers(l)}
              >
                <Img imgKey={thumbKey(l)} className="bmatch-img" />
                <span className="bmatch-meta">
                  <span className="bmatch-price">{l.price_cny != null ? yuan(l.price_cny) : "—"}</span>
                  <span className={`bmatch-pct bmatch-pct--${tierOf(l)}`}>{pct(l.score)}%</span>
                </span>
                {l.price_cny != null ? <span className="bmatch-cad">{money.local(l.price_cny)}</span> : null}
                <IconExternal size={10} className="bmatch-ext" />
              </a>
            ))
          : searched && status !== "done" && status !== "error"
            ? [0, 1, 2].map((k) => <span key={k} className="bmatch bmatch--sk" aria-hidden="true" />)
            : null}
      </div>
      <div className="bitem-action">
        {searched ? (
          <span className="bitem-open" aria-hidden="true">
            Open results →
          </span>
        ) : (
          <button type="button" className="btn btn--sm" disabled={starting} onClick={onStart}>
            {item.launching ? "Starting…" : "Search"}
          </button>
        )}
      </div>
    </li>
  );
}
