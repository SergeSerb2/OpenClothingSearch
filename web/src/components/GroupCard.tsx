import { memo } from "react";
import type { Source } from "../api/types";
import { plural, yuanRange } from "../lib/format";
import { useMoney } from "../lib/money";
import { SOURCE_LABEL, tierOf } from "../lib/sources";
import { tipOf, useEn } from "../lib/translate";
import type { GroupItem } from "../lib/view";
import { MatchBadge, SourceBadge, VerdictBadge } from "./Badges";
import { IconChevron, IconStack, IconX } from "./Icons";
import { Img } from "./Img";
import { ListingCard, previewHandlers, thumbKey } from "./ListingCard";

function sourceCounts(item: GroupItem): [Source, number][] {
  const counts = new Map<Source, number>();
  for (const l of item.listings) counts.set(l.source, (counts.get(l.source) ?? 0) + 1);
  return item.sources.map((s) => [s, counts.get(s) ?? 0]);
}

interface CardProps {
  item: GroupItem;
  expanded: boolean;
  onToggle: (id: number) => void;
}

export const GroupCard = memo(function GroupCard({ item, expanded, onToggle }: CardProps) {
  const best = item.best;
  const n = item.listings.length;
  const price = yuanRange(item.minPrice, item.maxPrice);
  const panelId = `group-panel-${item.group.id}`;
  const title = useEn(best.title);
  const money = useMoney();
  return (
    <article className={`card card--group tier-${tierOf(best)} ${expanded ? "is-expanded" : ""}`} {...previewHandlers(best, n)}>
      <div className="card-media">
        <Img imgKey={thumbKey(best)} alt="" />
        <div className="media-top">
          <VerdictBadge verdict={best.verdict} note={best.verdict_note} />
          <MatchBadge listing={best} />
        </div>
        <span className="media-sellers">
          <IconStack size={12} />
          {n}
        </span>
      </div>
      <div className="card-body">
        <div className="price-row">
          {price ? (
            <>
              <span className="price">{price}</span>
              <span className="cad">{money.localRange(item.minPrice, item.maxPrice)}</span>
            </>
          ) : (
            <span className="price price--none">No price</span>
          )}
        </div>
        <button
          type="button"
          className={`card-title stretched ${title.pending ? "is-translating" : ""}`}
          lang={title.lang}
          title={tipOf(title)}
          aria-expanded={expanded}
          aria-controls={panelId}
          onClick={() => onToggle(item.group.id)}
        >
          {title.text || "Untitled listing"}
        </button>
        <div className="meta">
          <span className="meta-sellers">
            {plural(n, "listing")}
            {item.hidden > 0 ? <span className="muted"> · {item.hidden} hidden</span> : null}
          </span>
        </div>
        <div className="tags">
          {sourceCounts(item).map(([s, c]) => (
            <SourceBadge key={s} source={s} count={c} />
          ))}
          <IconChevron size={14} className={`group-chevron ${expanded ? "is-open" : ""}`} />
        </div>
      </div>
    </article>
  );
});

interface PanelProps {
  item: GroupItem;
  onClose: (id: number) => void;
}

export function GroupPanel({ item, onClose }: PanelProps) {
  const price = yuanRange(item.minPrice, item.maxPrice);
  const money = useMoney();
  return (
    <section className="group-panel" id={`group-panel-${item.group.id}`} aria-label="Listings of this product">
      <header className="group-panel-head">
        <strong>{plural(item.listings.length, "listing")}</strong>
        {price ? (
          <span>
            {price} <span className="muted">{money.localRange(item.minPrice, item.maxPrice)}</span>
          </span>
        ) : null}
        <span className="muted">
          {sourceCounts(item)
            .map(([s, c]) => `${SOURCE_LABEL[s]} ${c}`)
            .join(" · ")}
        </span>
        {item.hidden > 0 ? <span className="muted">{item.hidden} hidden by filters</span> : null}
        <button type="button" className="btn btn--ghost btn--sm group-panel-close" onClick={() => onClose(item.group.id)}>
          <IconX size={12} /> Collapse
        </button>
      </header>
      <div className="grid grid--inner">
        {item.listings.map((l) => (
          <ListingCard key={l.id} listing={l} />
        ))}
      </div>
    </section>
  );
}
