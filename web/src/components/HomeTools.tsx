import { useEffect, useRef, useState, type DragEvent } from "react";
import { useApi } from "../api/context";
import { errorMessage } from "../hooks/useSearch";
import type { Board } from "../lib/boards";
import { isPhoto } from "../lib/photos";
import { plural, timeAgo } from "../lib/format";
import { IconCamera, IconImage, Spinner } from "./Icons";
import { Img } from "./Img";

/** "Shop the look": drop or pick an outfit photo; uploads it and hands back the key. */
export function LookDrop({ onUploaded, onDragOverChange }: { onUploaded: () => (key: string) => void; onDragOverChange: (over: boolean) => void }) {
  const api = useApi();
  const fileRef = useRef<HTMLInputElement>(null);
  const request = useRef(0);
  useEffect(() => () => { request.current++; }, []);
  const [over, setOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const take = async (file: File | undefined) => {
    if (!file) return;
    if (!isPhoto(file)) {
      setError("That is not an image file.");
      return;
    }
    const seq = ++request.current;
    const complete = onUploaded();
    setBusy(true);
    setError(null);
    try {
      const { key } = await api.upload(file);
      if (seq === request.current) complete(key);
    } catch (e) {
      if (seq === request.current) setError(errorMessage(e));
    } finally {
      if (seq === request.current) setBusy(false);
    }
  };

  const setOverBoth = (v: boolean) => {
    setOver(v);
    onDragOverChange(v);
  };

  const onDrop = (e: DragEvent) => {
    // preventDefault marks the drop as handled; the page-wide drop handler then ignores it.
    e.preventDefault();
    setOverBoth(false);
    void take([...e.dataTransfer.files].find(isPhoto));
  };

  return (
    <div
      className={`look-drop ${over ? "is-over" : ""}`}
      onDragEnter={(e) => {
        e.preventDefault();
        setOverBoth(true);
      }}
      onDragOver={(e) => e.preventDefault()}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) setOverBoth(false);
      }}
      onDrop={onDrop}
    >
      <IconImage size={22} />
      <div className="look-drop-text">
        <strong>Drop an outfit photo</strong>
        <span className="muted">A street-style or Pinterest photo. The AI finds each piece and searches it.</span>
      </div>
      <button type="button" className="btn btn--sm" onClick={() => fileRef.current?.click()} disabled={busy}>
        {busy ? <Spinner size={11} /> : <IconCamera size={13} />}
        {busy ? "Uploading" : "Choose photo"}
      </button>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        hidden
        aria-label="Outfit photo"
        onChange={(e) => {
          void take(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
      {error ? <p className="look-drop-error">{error}</p> : null}
    </div>
  );
}

const EXAMPLES = [
  "Outfit for a rainy week in London, under ¥800 total",
  "Smart casual for a first date, nothing flashy",
  "Minimal autumn capsule: 6 pieces that all match",
];

/** "Ask the AI stylist": free text to suggestions. */
export function StylistBox({ onAsk, busy, error }: { onAsk: (notes: string) => void; busy: boolean; error: string | null }) {
  const [text, setText] = useState("");
  const [asked, setAsked] = useState("");
  const submit = () => {
    if (!text.trim() || busy) return;
    setAsked(text.trim());
    onAsk(text.trim());
  };
  return (
    <form
      className="stylist"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <textarea
        className="stylist-input"
        value={text}
        rows={3}
        placeholder="Describe what you need: the occasion, weather, budget, what you already own…"
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            submit();
          }
        }}
        aria-label="Ask the AI stylist"
      />
      <div className="stylist-foot">
        <div className="chips">
          {EXAMPLES.map((ex) => (
            <button key={ex} type="button" className="qchip qchip--en" onClick={() => setText(ex)}>
              {ex}
            </button>
          ))}
        </div>
        <button type="submit" className="btn btn--primary" disabled={!text.trim() || busy}>
          {busy ? <Spinner size={12} /> : null}
          {busy ? "Thinking" : "Ask"}
        </button>
      </div>
      {error && text.trim() === asked ? <p className="stylist-error">{error}</p> : null}
    </form>
  );
}

const KIND: Record<Board["kind"], string> = { look: "Shop the look", suggest: "AI stylist", complete: "Complete the look" };

export function BoardList({ boards, onOpen, limit, currentId }: { boards: Board[]; onOpen: (id: string) => void; limit?: number; currentId?: string | null }) {
  if (!boards.length) return <p className="panel-empty muted">No boards yet. Shop a look or ask the stylist to make one.</p>;
  return (
    <ul className="history">
      {(limit ? boards.slice(0, limit) : boards).map((b) => {
        const thumb = b.photo_key ?? b.anchor?.thumb_key ?? b.items.find((i) => i.crop_key)?.crop_key ?? null;
        const searched = b.items.filter((i) => i.search_id).length;
        return (
          <li key={b.id}>
            <button type="button" className={`history-item ${b.id === currentId ? "is-current" : ""}`} onClick={() => onOpen(b.id)}>
              <Img imgKey={thumb} className="history-thumb" />
              <span className="history-text">
                <span className="history-query">{b.title}</span>
                <span className="history-meta">
                  {KIND[b.kind]} · {plural(b.items.length, "item")}
                  {searched < b.items.length ? ` · ${searched} searched` : ""} · {timeAgo(b.created)}
                </span>
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
