import { useEffect, useState } from "react";
import type { Source } from "../api/types";
import { SOURCES } from "../api/types";
import { plural } from "../lib/format";
import { SOURCE_LABEL } from "../lib/sources";
import { Segmented } from "./Pickers";
import { DEFAULT_FILTERS, filtersActive, type Filters, type ResultsView, type SortKey, type VerdictFilter, type ViewMode } from "../lib/view";

interface Props {
  filters: Filters;
  onFilters: (f: Filters) => void;
  sort: SortKey;
  onSort: (s: SortKey) => void;
  mode: ViewMode;
  onMode: (m: ViewMode) => void;
  view: ResultsView;
}

function PriceInput({ value, onChange, placeholder }: { value: number | null; onChange: (v: number | null) => void; placeholder: string }) {
  const [text, setText] = useState(value == null ? "" : String(value));
  useEffect(() => {
    setText((t) => (Number(t) === value || (t === "" && value == null) ? t : value == null ? "" : String(value)));
  }, [value]);
  return (
    <input
      className="price-input"
      type="number"
      inputMode="decimal"
      min={0}
      step="any"
      placeholder={placeholder}
      aria-label={`${placeholder} price in yuan`}
      value={text}
      onChange={(e) => {
        setText(e.target.value);
        const n = e.target.value === "" ? null : Number(e.target.value);
        onChange(n == null || Number.isNaN(n) || n < 0 ? null : n);
      }}
    />
  );
}

export function Toolbar({ filters, onFilters, sort, onSort, mode, onMode, view }: Props) {
  const set = (patch: Partial<Filters>) => onFilters({ ...filters, ...patch });
  const toggleSource = (s: Source) =>
    set({
      hiddenSources: filters.hiddenSources.includes(s)
        ? filters.hiddenSources.filter((x) => x !== s)
        : [...filters.hiddenSources, s],
    });
  const match = filters.minMatch ?? view.weakCutoff;
  const filtered = view.shown !== view.total;

  const counts = (
    <div className="tb-counts" aria-live="polite">
      <span>
        {filtered ? `${view.shown.toLocaleString("en-US")} of ${plural(view.total, "listing")}` : plural(view.total, "listing")},{" "}
        {plural(view.groupCount, "group")}
      </span>
      {filtersActive(filters) ? (
        <button type="button" className="link-btn" onClick={() => onFilters(DEFAULT_FILTERS)}>
          Reset filters
        </button>
      ) : null}
    </div>
  );

  return (
    <div className="toolbar" role="group" aria-label="Result view and filters">
      <div className="tb-row">
        <Segmented<ViewMode>
          label="View"
          value={mode}
          onChange={onMode}
          options={[
            ["grouped", "Grouped"],
            ["all", "All listings"],
          ]}
        />
        {counts}
        <label className="tb-group tb-sort">
          <span className="tb-label">Sort</span>
          <select className="select" value={sort} onChange={(e) => onSort(e.target.value as SortKey)}>
            <option value="match">Best match</option>
            <option value="value">Best value</option>
            <option value="price">Lowest price</option>
          </select>
        </label>
      </div>

      <div className="tb-row tb-row--filters">
        <div className="tb-group" role="group" aria-label="Sources">
          {SOURCES.map((s) => {
            const on = !filters.hiddenSources.includes(s);
            const n = view.sourceCounts[s];
            return (
              <button
                key={s}
                type="button"
                className={`toggle toggle--${s} ${n === 0 ? "is-zero" : ""}`}
                aria-pressed={on}
                onClick={() => toggleSource(s)}
                title={on ? `Hide ${SOURCE_LABEL[s]}` : `Show ${SOURCE_LABEL[s]}`}
              >
                <span className="toggle-dot" />
                {SOURCE_LABEL[s]}
                <span className="toggle-count">{n}</span>
              </button>
            );
          })}
        </div>

        <button
          type="button"
          className="toggle toggle--official"
          aria-pressed={filters.officialOnly}
          onClick={() => set({ officialOnly: !filters.officialOnly })}
          title="Keep only official and flagship stores (Tmall flagship, brand stores)"
        >
          <span className="toggle-dot" />
          Official stores
          <span className="toggle-count">{view.officialCount}</span>
        </button>

        <span className="tb-sep" aria-hidden="true" />

        <label className="tb-group tb-match" title="Minimum match score. By default weak matches are hidden.">
          <span className="tb-label">Match</span>
          <input
            type="range"
            min={0}
            max={100}
            step={1}
            value={match}
            onChange={(e) => set({ minMatch: Number(e.target.value) })}
            aria-valuetext={`${match}% or more`}
          />
          <span className="tb-value">≥{match}%</span>
          {filters.minMatch == null ? (
            <span className="tb-hint">{view.allWeak ? "only weak matches" : "hides weak"}</span>
          ) : (
            <button type="button" className="link-btn" onClick={() => set({ minMatch: null })}>
              Auto
            </button>
          )}
        </label>

        <span className="tb-sep" aria-hidden="true" />

        <div className="tb-group">
          <span className="tb-label">AI check</span>
          <Segmented<VerdictFilter>
            label="AI verdict"
            value={filters.verdict}
            onChange={(v) => set({ verdict: v })}
            options={[
              ["all", "All"],
              ["same", "Same only"],
              ["hide_different", "Hide different"],
            ]}
          />
        </div>

        <span className="tb-sep" aria-hidden="true" />

        <div className="tb-group tb-price" role="group" aria-label="Price range in yuan">
          <span className="tb-label">Price ¥</span>
          <PriceInput placeholder="Min" value={filters.priceMin} onChange={(v) => set({ priceMin: v })} />
          <span className="muted">–</span>
          <PriceInput placeholder="Max" value={filters.priceMax} onChange={(v) => set({ priceMax: v })} />
        </div>
      </div>
    </div>
  );
}
