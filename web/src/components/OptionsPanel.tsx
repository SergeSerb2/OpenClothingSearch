import { useId, type ReactNode } from "react";
import type { Gender, SearchOptions, Season } from "../api/types";
import { useCatalog } from "../lib/catalog";
import { useMoney } from "../lib/money";
import { countOptions } from "../lib/options";
import { IconX, Spinner } from "./Icons";
import { BrandPicker, CategorySelect, ColorSwatches, NamedSelect, Segmented, StyleChips, ToggleChips } from "./Pickers";

interface Props {
  options: SearchOptions;
  onChange: (o: SearchOptions) => void;
  onReset: () => void;
  onClose: () => void;
  /** Which fields came from the profile, for a hint. */
  fromProfile: string[];
  /** Enter in a text field runs the search. */
  onSubmit?: () => void;
}

function Field({ label, children, wide, htmlFor }: { label: string; children: ReactNode; wide?: boolean; htmlFor?: string }) {
  return (
    <div className={`opt ${wide ? "opt--wide" : ""}`}>
      {htmlFor ? (
        <label className="opt-label" htmlFor={htmlFor}>
          {label}
        </label>
      ) : (
        <span className="opt-label">{label}</span>
      )}
      <div className="opt-control">{children}</div>
    </div>
  );
}

function num(v: string): number | undefined {
  if (v.trim() === "") return undefined;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : undefined;
}

export function OptionsPanel({ options: o, onChange, onReset, onClose, fromProfile, onSubmit }: Props) {
  const { index, error, loading, reload } = useCatalog();
  const set = (patch: Partial<SearchOptions>) => onChange({ ...o, ...patch });
  const ids = { cat: useId(), fit: useId(), size: useId(), notes: useId(), min: useId() };
  const cadHint = useMoney().localRange(o.price_min ?? null, o.price_max ?? null);
  const n = countOptions(o);

  return (
    <section
      className="opts"
      aria-label="Search options"
      onKeyDown={(e) => {
        const t = e.target;
        if (e.key === "Enter" && !e.defaultPrevented && t instanceof HTMLInputElement && t.type !== "checkbox" && onSubmit) {
          e.preventDefault();
          onSubmit();
        }
      }}
    >
      <header className="opts-head">
        <h2>Options</h2>
        <span className="muted">The AI turns these into the words Chinese sellers use.</span>
        <div className="opts-head-actions">
          {n > 0 ? (
            <button type="button" className="btn btn--ghost btn--sm" onClick={onReset}>
              Clear
            </button>
          ) : null}
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close options">
            <IconX size={14} />
          </button>
        </div>
      </header>

      {!index ? (
        <div className="opts-catalog-missing">
          {loading ? (
            <>
              <Spinner size={12} /> Loading brands, styles and categories…
            </>
          ) : (
            <>
              <span>Brands, styles and categories are not available: {error}</span>
              <button type="button" className="btn btn--sm" onClick={reload}>
                Retry
              </button>
            </>
          )}
        </div>
      ) : null}

      <div className="opts-grid">
        {index ? (
          <Field label="Category" htmlFor={ids.cat}>
            <CategorySelect id={ids.cat} catalog={index.catalog} value={o.category} onChange={(v) => set({ category: v })} />
          </Field>
        ) : null}
        <Field label="Gender">
          <Segmented<"" | Gender>
            label="Gender"
            size="sm"
            value={o.gender ?? ""}
            onChange={(v) => set({ gender: v || undefined })}
            options={[
              ["", "Any"],
              ["men", "Men"],
              ["women", "Women"],
              ["unisex", "Unisex"],
            ]}
          />
        </Field>
        {index ? (
          <Field label="Fit" htmlFor={ids.fit}>
            <NamedSelect id={ids.fit} items={index.catalog.fits} value={o.fit} onChange={(v) => set({ fit: v })} any="Any fit" />
          </Field>
        ) : null}
        <Field label="Season">
          <Segmented<"" | Season>
            label="Season"
            size="sm"
            value={o.season ?? ""}
            onChange={(v) => set({ season: v || undefined })}
            options={[
              ["", "Any"],
              ["spring", "Spring"],
              ["summer", "Summer"],
              ["autumn", "Autumn"],
              ["winter", "Winter"],
            ]}
          />
        </Field>
        <Field label="Size" htmlFor={ids.size}>
          <input
            id={ids.size}
            className="input input--sm"
            value={o.size ?? ""}
            placeholder="L, EU 43, 32x32"
            onChange={(e) => set({ size: e.target.value || undefined })}
          />
        </Field>
        <Field label="Price" htmlFor={ids.min}>
          <div className="opt-price">
            <span className="muted">¥</span>
            <input
              id={ids.min}
              className="price-input"
              type="number"
              min={0}
              inputMode="numeric"
              placeholder="Min"
              aria-label="Minimum price in yuan"
              value={o.price_min ?? ""}
              onChange={(e) => set({ price_min: num(e.target.value) })}
            />
            <span className="muted">–</span>
            <input
              className="price-input"
              type="number"
              min={0}
              inputMode="numeric"
              placeholder="Max"
              aria-label="Maximum price in yuan"
              value={o.price_max ?? ""}
              onChange={(e) => set({ price_max: num(e.target.value) })}
            />
            {cadHint ? <span className="muted opt-cad">{cadHint}</span> : null}
          </div>
        </Field>

        {index ? (
          <>
            <Field label="Colors" wide>
              <ColorSwatches catalog={index.catalog} value={o.colors ?? []} onChange={(v) => set({ colors: v.length ? v : undefined })} />
            </Field>
            <Field label="Materials" wide>
              <ToggleChips
                label="Materials"
                items={index.catalog.materials}
                value={o.materials ?? []}
                onChange={(v) => set({ materials: v.length ? v : undefined })}
              />
            </Field>
            <Field label="Brands" wide>
              <BrandPicker index={index} value={o.brands ?? []} onChange={(v) => set({ brands: v.length ? v : undefined })} />
            </Field>
            <Field label="Styles" wide>
              <StyleChips index={index} value={o.styles ?? []} onChange={(v) => set({ styles: v.length ? v : undefined })} />
            </Field>
          </>
        ) : null}
        <Field label="Notes" wide htmlFor={ids.notes}>
          <input
            id={ids.notes}
            className="input input--sm"
            value={o.notes ?? ""}
            placeholder="Anything else for the AI, e.g. no big logo, with a hood, thick fabric"
            onChange={(e) => set({ notes: e.target.value || undefined })}
          />
        </Field>
      </div>

      <footer className="opts-foot">
        <label className="check">
          <input type="checkbox" checked={!!o.official_only} onChange={(e) => set({ official_only: e.target.checked || undefined })} />
          Official stores only
          <span className="muted">(Tmall flagship and brand stores)</span>
        </label>
        {fromProfile.length ? <span className="muted opts-profile">{fromProfile.join(" and ")} from your profile; the AI also uses your budget and sizes.</span> : null}
      </footer>
    </section>
  );
}
