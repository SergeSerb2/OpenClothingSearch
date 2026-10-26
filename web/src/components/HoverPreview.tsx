import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { plural, yuan } from "../lib/format";
import { useMoney } from "../lib/money";
import { hidePreview, usePreview } from "../lib/preview";
import { useEnglish } from "../lib/translate";
import { ListingSourceBadge, MatchBadge } from "./Badges";
import { Img } from "./Img";
import { ListingFlags, thumbKey } from "./ListingCard";

const WIDTH = 340;
const GAP = 12;

/** Large image preview next to the hovered card. Pointer-only; hidden on touch screens. */
export function HoverPreview() {
  const p = usePreview();
  const [title, shop] = useEnglish([p?.listing.title, p?.listing.shop]);
  const money = useMoney();
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);

  useEffect(() => {
    window.addEventListener("scroll", hidePreview, { passive: true, capture: true });
    return () => window.removeEventListener("scroll", hidePreview, { capture: true });
  }, []);

  useLayoutEffect(() => {
    if (!p) return setPos(null);
    const h = ref.current?.offsetHeight ?? 420;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const right = p.rect.right + GAP;
    const left = right + WIDTH <= vw - 8 ? right : Math.max(8, p.rect.left - GAP - WIDTH);
    const top = Math.min(Math.max(8, p.rect.top), Math.max(8, vh - h - 8));
    setPos({ left, top });
  }, [p]);

  if (!p) return null;
  const l = p.listing;
  const main = thumbKey(l);
  const extras = (l.extra_keys ?? []).filter((k) => k !== main).slice(0, 8);

  return (
    <div
      ref={ref}
      className="preview"
      style={{ width: WIDTH, left: pos?.left ?? -9999, top: pos?.top ?? 0 }}
      aria-hidden="true"
    >
      <Img imgKey={main} className="preview-img" eager />
      {extras.length > 0 ? (
        <div className="preview-extras">
          {extras.map((k) => (
            <Img key={k} imgKey={k} className="preview-extra" eager />
          ))}
        </div>
      ) : null}
      <div className="preview-body">
        <div className="price-row">
          {l.price_cny != null ? (
            <>
              <span className="price">{yuan(l.price_cny)}</span>
              <span className="cad">{money.local(l.price_cny)}</span>
            </>
          ) : null}
          <MatchBadge listing={l} />
        </div>
        <p className={`preview-title ${title.pending ? "is-translating" : ""}`} lang={title.lang}>
          {title.text}
        </p>
        {title.original ? (
          <p className="preview-original" lang="zh">
            {title.original}
          </p>
        ) : null}
        <div className="tags">
          <ListingSourceBadge listing={l} />
          <ListingFlags listing={l} />
          {l.shop ? (
            <span className="muted" lang={shop.lang}>
              {shop.text}
            </span>
          ) : null}
          {p.sellers ? <span className="muted">· {plural(p.sellers, "listing")}</span> : null}
        </div>
        {l.verdict_note ? <p className="preview-note">AI: {l.verdict_note}</p> : null}
      </div>
    </div>
  );
}
