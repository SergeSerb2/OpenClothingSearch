import { createContext, memo, useContext, type MouseEvent } from "react";
import type { Listing } from "../api/types";
import { yuan } from "../lib/format";
import { useMoney } from "../lib/money";
import { hidePreview, showPreview } from "../lib/preview";
import { METHOD_LABEL, tierOf } from "../lib/sources";
import { tipOf, useEnglish } from "../lib/translate";
import { ListingSourceBadge, MatchBadge, VerdictBadge } from "./Badges";
import { En } from "./En";
import { Img } from "./Img";

/** Resolves a listing by id (used for Yupoo album links on buy-link listings). */
export const ListingLookup = createContext<(id: string) => Listing | undefined>(() => undefined);

export function thumbKey(l: Listing): string | null {
  return l.match_key ?? l.image_key;
}

export function previewHandlers(listing: Listing, sellers?: number) {
  if (!thumbKey(listing)) return {};
  return {
    onMouseEnter: (e: MouseEvent<HTMLElement>) =>
      showPreview({ listing, sellers, rect: e.currentTarget.getBoundingClientRect() }, e.currentTarget),
    onMouseLeave: hidePreview,
  };
}

function AlbumHint({ albums }: { albums: string[] }) {
  const lookup = useContext(ListingLookup);
  const album = (albums ?? []).map((a) => lookup(a) ?? lookup(`yupoo:${a}`)).find(Boolean);
  const [title, shop] = useEnglish([album?.title, album?.shop]);
  if (!albums?.length) return null;
  if (!album) {
    return <div className="album-hint">From a Yupoo album</div>;
  }
  return (
    <a
      className="album-hint album-hint--link"
      href={album.url}
      target="_blank"
      rel="noopener noreferrer"
      title={`Yupoo album: ${tipOf(title)}`}
      onClick={(e) => e.stopPropagation()}
    >
      From Yupoo album{shop.text ? ` · ${shop.text}` : ""}
    </a>
  );
}

/** Small flags for listings the backend ranked lower on purpose. */
export function ListingFlags({ listing: l }: { listing: Listing }) {
  return (
    <>
      {l.branded ? (
        <span className="flag flag--copy" title="The AI saw the original brand's logo or name: this is a copy, not an alternative. Ranked lower.">
          Brand copy
        </span>
      ) : null}
      {l.avoid_hit ? (
        <span className="flag" title="The title has one of the avoid words from the AI plan. Ranked lower.">
          Avoid word
        </span>
      ) : null}
    </>
  );
}

export const ListingCard = memo(function ListingCard({ listing: l }: { listing: Listing }) {
  const tier = tierOf(l);
  const extra = l.extra_keys?.length ?? 0;
  const found = l.found_by.map((m) => METHOD_LABEL[m]).join(" · ");
  const [title] = useEnglish([l.title]);
  const money = useMoney();
  return (
    <article className={`card tier-${tier}`} {...previewHandlers(l)}>
      <div className="card-media">
        <Img imgKey={thumbKey(l)} alt="" />
        <div className="media-top">
          <VerdictBadge verdict={l.verdict} note={l.verdict_note} />
          <MatchBadge listing={l} />
        </div>
        {extra > 1 ? <span className="media-count">{extra} photos</span> : null}
      </div>
      <div className="card-body">
        <div className="price-row">
          {l.price_cny != null ? (
            <>
              <span className="price">{yuan(l.price_cny)}</span>
              <span className="cad">{money.local(l.price_cny)}</span>
            </>
          ) : (
            <span className="price price--none">No price</span>
          )}
        </div>
        <a
          className={`card-title stretched ${title.pending ? "is-translating" : ""}`}
          href={l.url}
          target="_blank"
          rel="noopener noreferrer"
          lang={title.lang}
          title={tipOf(title)}
        >
          {title.text || "Untitled listing"}
        </a>
        <div className="meta">
          {l.shop ? <En text={l.shop} className="meta-shop" /> : null}
          {l.sales ? <En text={l.sales} className="meta-sales" /> : null}
        </div>
        <div className="tags">
          <ListingSourceBadge listing={l} />
          <span className="found" title={l.via.length ? `Found by ${found} via ${l.via.join(", ")}` : `Found by ${found}`}>
            {found}
          </span>
          <ListingFlags listing={l} />
        </div>
        <AlbumHint albums={l.albums} />
      </div>
    </article>
  );
});
