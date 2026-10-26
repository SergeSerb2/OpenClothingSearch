import { useState } from "react";
import type { Style } from "../api/types";
import type { CatalogIndex } from "../lib/catalog";
import { useEnglishOnly } from "../lib/translate";
import { IconCheck, Spinner } from "./Icons";

interface Props {
  index: CatalogIndex;
  selected: string[];
  onUse: (id: string) => void;
  onStarter: (id: string) => void;
  busy: string | null;
  /** The user's favorite styles (profile) come first. */
  favorites: string[];
}

const COLLAPSED = 8;

export function StyleGallery({ index, selected, onUse, onStarter, busy, favorites }: Props) {
  const [all, setAll] = useState(false);
  const styles = [...index.catalog.styles].sort((a, b) => Number(favorites.includes(b.id)) - Number(favorites.includes(a.id)));
  const shown = all ? styles : styles.slice(0, COLLAPSED);
  return (
    <>
      <div className="styles-grid">
        {shown.map((s) => (
          <StyleCard
            key={s.id}
            style={s}
            index={index}
            on={selected.includes(s.id)}
            onUse={() => onUse(s.id)}
            onStarter={() => onStarter(s.id)}
            busy={busy === s.id}
            disabled={busy != null}
            favorite={favorites.includes(s.id)}
          />
        ))}
      </div>
      {styles.length > COLLAPSED ? (
        <button type="button" className="btn btn--ghost btn--sm styles-more" onClick={() => setAll((v) => !v)} aria-expanded={all}>
          {all ? "Show fewer styles" : `Show all ${styles.length} styles`}
        </button>
      ) : null}
    </>
  );
}

function StyleCard({
  style: s,
  index,
  on,
  onUse,
  onStarter,
  busy,
  disabled,
  favorite,
}: {
  style: Style;
  index: CatalogIndex;
  on: boolean;
  onUse: () => void;
  onStarter: () => void;
  busy: boolean;
  disabled: boolean;
  favorite: boolean;
}) {
  const english = useEnglishOnly();
  const colors = s.colors.map((c) => index.color.get(c)).filter((c) => !!c);
  const brands = s.brands.map((b) => index.brand.get(b)?.name).filter(Boolean);
  return (
    <article className={`style-card ${on ? "is-on" : ""}`}>
      <div className="style-palette" aria-hidden="true">
        {colors.map((c) => (
          <span key={c!.id} style={{ background: c!.hex }} />
        ))}
      </div>
      <div className="style-body">
        <h3>
          {s.name}
          {english ? null : (
            <span className="style-zh" lang="zh">
              {s.zh.slice(0, 3).join(" · ")}
            </span>
          )}
          {favorite ? <span className="style-fav">Yours</span> : null}
        </h3>
        <p className="style-desc">{s.description}</p>
        {brands.length ? <p className="style-brands">{brands.slice(0, 4).join(", ")}</p> : null}
        <div className="style-colors" aria-label="Typical colors">
          {colors.map((c) => (
            <span key={c!.id} className="ochip-swatch" style={{ background: c!.hex }} title={english ? c!.name : `${c!.name} · ${c!.zh}`} />
          ))}
        </div>
      </div>
      <div className="style-actions">
        <button type="button" className={`btn btn--sm ${on ? "btn--on" : ""}`} onClick={onUse} aria-pressed={on}>
          {on ? <IconCheck size={11} /> : null}
          {on ? "In options" : "Use style"}
        </button>
        <button
          type="button"
          className="btn btn--sm btn--ghost"
          onClick={onStarter}
          disabled={disabled}
          title="Ask the AI for the key pieces of this style"
        >
          {busy ? <Spinner size={11} /> : null}
          Starter kit
        </button>
      </div>
    </article>
  );
}
