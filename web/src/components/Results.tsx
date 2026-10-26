import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import type { Listing, Snapshot } from "../api/types";
import { plural } from "../lib/format";
import type { ResultsView } from "../lib/view";
import { Blockers, blockerLines, type BlockerActions } from "./Blockers";
import { GroupCard, GroupPanel } from "./GroupCard";
import { ListingCard, ListingLookup } from "./ListingCard";

interface Props {
  snapshot: Snapshot;
  view: ResultsView;
  dimmed: boolean;
  onResetFilters: () => void;
  onShowWeak: () => void;
  actions: BlockerActions;
}

export function Results({ snapshot, view, dimmed, onResetFilters, onShowWeak, actions }: Props) {
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());

  const identities = useMemo(() => new Map(snapshot.groups.map((g) => [g.id, JSON.stringify([...g.listing_ids].sort())])), [snapshot.groups]);
  const toggle = useCallback((id: number) => {
    const key = identities.get(id);
    if (!key) return;
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, [identities]);
  const close = useCallback((id: number) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      const key = identities.get(id);
      if (key) next.delete(key);
      return next;
    });
    requestAnimationFrame(() => {
      document.querySelector<HTMLElement>(`[aria-controls="group-panel-${id}"]`)?.focus();
    });
  }, [identities]);

  useEffect(() => {
    if (expanded.size === 0) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      if (document.querySelector(".drawer")) return;
      // Like Collapse: give focus back to the group card.
      const card = document.querySelector<HTMLElement>('.card--group [aria-expanded="true"]');
      setExpanded(new Set());
      requestAnimationFrame(() => card?.focus());
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [expanded]);

  const index = useMemo(() => {
    const m = new Map<string, Listing>();
    for (const l of snapshot.listings) m.set(l.id, l);
    return m;
  }, [snapshot.listings]);
  const lookup = useCallback((id: string) => index.get(id), [index]);

  const running = snapshot.status === "running";

  if (view.total === 0) {
    if (running) return <Skeleton note={stageNote(snapshot)} />;
    return <NoResults snapshot={snapshot} actions={actions} />;
  }

  if (view.shown === 0) {
    const h = view.hiddenBy;
    const reasons = [
      h.match ? `${h.match} below the match threshold` : null,
      h.source ? `${h.source} from hidden sources` : null,
      h.official ? `${h.official} not from official stores` : null,
      h.verdict ? `${h.verdict} by the AI filter` : null,
      h.price ? `${h.price} outside the price range` : null,
    ].filter(Boolean);
    return (
      <div className="empty">
        <p className="empty-title">All {plural(view.total, "listing")} are hidden by filters.</p>
        <p className="empty-text">{reasons.join(", ")}.</p>
        <div className="empty-actions">
          {h.match ? (
            <button type="button" className="btn btn--primary" onClick={onShowWeak}>
              Show weak matches
            </button>
          ) : null}
          <button type="button" className="btn" onClick={onResetFilters}>
            Reset filters
          </button>
        </div>
      </div>
    );
  }

  return (
    <ListingLookup.Provider value={lookup}>
      <div className={`grid ${dimmed ? "is-dimmed" : ""}`} aria-busy={dimmed || undefined}>
        {view.items.map((item) =>
          item.kind === "listing" ? (
            <ListingCard key={item.key} listing={item.listing} />
          ) : (
            <Fragment key={item.key}>
              <GroupCard item={item} expanded={expanded.has(identities.get(item.group.id)!)} onToggle={toggle} />
              {expanded.has(identities.get(item.group.id)!) ? <GroupPanel item={item} onClose={close} /> : null}
            </Fragment>
          ),
        )}
        {running ? <SkeletonCards count={3} /> : null}
      </div>
    </ListingLookup.Provider>
  );
}

function stageNote(s: Snapshot): string {
  switch (s.stage) {
    case "queries":
      return "Working out the search terms sellers use.";
    case "references":
      return "Finding reference photos of the item.";
    default:
      return "Listings appear here as each source finishes.";
  }
}

function SkeletonCards({ count }: { count: number }) {
  return (
    <>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="card card--skeleton" aria-hidden="true">
          <div className="card-media" />
          <div className="card-body">
            <span className="sk sk--w40" />
            <span className="sk" />
            <span className="sk sk--w70" />
          </div>
        </div>
      ))}
    </>
  );
}

function Skeleton({ note }: { note: string }) {
  return (
    <div>
      <p className="results-note">{note}</p>
      <div className="grid">
        <SkeletonCards count={12} />
      </div>
    </div>
  );
}

function NoResults({ snapshot, actions }: { snapshot: Snapshot; actions: BlockerActions }) {
  const sources = snapshot.sources;
  const ran = sources.filter((s) => s.state === "done");
  const blocked = blockerLines(sources);

  if (snapshot.status === "error") {
    return (
      <div className="empty">
        <p className="empty-title">The search stopped before any listings came in.</p>
        <p className="empty-text">See the error above. Fix it, then search again.</p>
        {actions.onSearchAgain ? (
          <div className="empty-actions">
            <button type="button" className="btn btn--primary" onClick={actions.onSearchAgain}>
              Search again
            </button>
          </div>
        ) : null}
      </div>
    );
  }

  if (ran.length === 0 && blocked.length > 0) {
    return (
      <div className="empty empty--left">
        <p className="empty-title">No listings: no source could run.</p>
        <p className="empty-text">Every source needed a login, an API key, or failed. Fix one of these and search again.</p>
        <Blockers sources={sources} actions={actions} showSearchAgain={false} />
        <div className="empty-actions">
          {actions.onSearchAgain ? (
            <button type="button" className="btn btn--primary" onClick={actions.onSearchAgain}>
              Search again
            </button>
          ) : null}
          <button type="button" className="btn" onClick={actions.onOpenSettings}>
            Open settings
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="empty empty--left">
      <p className="empty-title">No listings found.</p>
      <p className="empty-text">
        {ran.length > 0
          ? `${plural(ran.length, "source")} searched with no matches. Try a shorter name, the style code, or add a photo.`
          : "No sources ran. Check Settings."}
      </p>
      {blocked.length > 0 ? (
        <>
          <p className="empty-text">These sources did not run:</p>
          <Blockers sources={sources} actions={actions} />
        </>
      ) : null}
    </div>
  );
}
