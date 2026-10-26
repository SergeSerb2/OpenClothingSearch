import type { Listing, Source, Verdict } from "../api/types";
import { pct } from "../lib/format";
import { SOURCE_LABEL, TIER_LABEL, listingSourceLabel, tierOf } from "../lib/sources";

export function SourceBadge({ source, label, count }: { source: Source; label?: string; count?: number }) {
  return (
    <span className={`src src--${source}`}>
      {label ?? SOURCE_LABEL[source]}
      {count != null && count > 1 ? <span className="src-count">{count}</span> : null}
    </span>
  );
}

export function ListingSourceBadge({ listing }: { listing: Listing }) {
  return <SourceBadge source={listing.source} label={listingSourceLabel(listing)} />;
}

export function MatchBadge({ listing }: { listing: Listing }) {
  const tier = tierOf(listing);
  const title = `${TIER_LABEL[tier]} · photo ${listing.image_score.toFixed(2)} · text ${listing.text_score.toFixed(2)}`;
  return (
    <span className={`match match--${tier}`} title={title}>
      {pct(listing.score)}%
    </span>
  );
}

const VERDICT_LABEL: Record<Verdict, string> = {
  same: "Same",
  variant: "Variant",
  different: "Different",
};

export function VerdictBadge({ verdict, note }: { verdict: Verdict | null; note: string }) {
  if (!verdict) return null;
  return (
    <span className={`verdict verdict--${verdict}`} title={note ? `AI check: ${note}` : "AI check"}>
      <span className="verdict-ai">AI</span>
      {VERDICT_LABEL[verdict]}
    </span>
  );
}
