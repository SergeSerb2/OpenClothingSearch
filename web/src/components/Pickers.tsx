import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import type { Brand, Catalog } from "../api/types";
import { GROUP_LABEL, GROUP_ORDER, PRICE_TIER, inkFor, searchBrands, zhName, type CatalogIndex } from "../lib/catalog";
import { useEnglishOnly } from "../lib/translate";
import { IconCheck, IconX } from "./Icons";

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
  size = "md",
}: {
  value: T;
  options: [T, string, string?][];
  onChange: (v: T) => void;
  label: string;
  size?: "md" | "sm";
}) {
  return (
    <div className={`seg seg--${size}`} role="group" aria-label={label}>
      {options.map(([v, text, title]) => (
        <button key={v} type="button" className="seg-btn" aria-pressed={value === v} onClick={() => onChange(v)} title={title}>
          {text}
        </button>
      ))}
    </div>
  );
}

export function ColorSwatches({
  catalog,
  value,
  onChange,
}: {
  catalog: Catalog;
  value: string[];
  onChange: (v: string[]) => void;
}) {
  const english = useEnglishOnly();
  return (
    <div className="swatches" role="group" aria-label="Colors">
      {catalog.colors.map((c) => {
        const on = value.includes(c.id);
        return (
          <button
            key={c.id}
            type="button"
            className="swatch"
            style={{ background: c.hex, color: inkFor(c.hex) }}
            aria-pressed={on}
            aria-label={c.name}
            title={english ? c.name : `${c.name} · ${c.zh}`}
            onClick={() => onChange(on ? value.filter((x) => x !== c.id) : [...value, c.id])}
          >
            {on ? <IconCheck size={12} /> : null}
          </button>
        );
      })}
    </div>
  );
}

export function CategorySelect({
  catalog,
  value,
  onChange,
  id,
}: {
  catalog: Catalog;
  value: string | undefined;
  onChange: (v: string | undefined) => void;
  id?: string;
}) {
  const english = useEnglishOnly();
  return (
    <select id={id} className="select select--full" value={value ?? ""} onChange={(e) => onChange(e.target.value || undefined)}>
      <option value="">Any category</option>
      {GROUP_ORDER.map((g) => {
        const items = catalog.categories.filter((c) => c.group === g);
        if (!items.length) return null;
        return (
          <optgroup key={g} label={GROUP_LABEL[g]}>
            {items.map((c) => (
              <option key={c.id} value={c.id}>
                {english ? c.name : `${c.name} · ${c.zh}`}
              </option>
            ))}
          </optgroup>
        );
      })}
    </select>
  );
}

export function NamedSelect({
  items,
  value,
  onChange,
  any,
  id,
}: {
  items: { id: string; name: string; zh: string }[];
  value: string | undefined;
  onChange: (v: string | undefined) => void;
  any: string;
  id?: string;
}) {
  const english = useEnglishOnly();
  return (
    <select id={id} className="select select--full" value={value ?? ""} onChange={(e) => onChange(e.target.value || undefined)}>
      <option value="">{any}</option>
      {items.map((x) => (
        <option key={x.id} value={x.id}>
          {english ? x.name : `${x.name} · ${x.zh}`}
        </option>
      ))}
    </select>
  );
}

export function ToggleChips({
  items,
  value,
  onChange,
  label,
}: {
  items: { id: string; name: string; zh?: string; title?: string }[];
  value: string[];
  onChange: (v: string[]) => void;
  label: string;
}) {
  const english = useEnglishOnly();
  return (
    <div className="tchips" role="group" aria-label={label}>
      {items.map((x) => {
        const on = value.includes(x.id);
        return (
          <button
            key={x.id}
            type="button"
            className="tchip"
            aria-pressed={on}
            title={x.title}
            onClick={() => onChange(on ? value.filter((v) => v !== x.id) : [...value, x.id])}
          >
            {x.name}
            {x.zh && !english ? (
              <span className="tchip-zh" lang="zh">
                {x.zh}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

export function StyleChips({ index, value, onChange }: { index: CatalogIndex; value: string[]; onChange: (v: string[]) => void }) {
  return (
    <ToggleChips
      label="Styles"
      value={value}
      onChange={onChange}
      items={index.catalog.styles.map((s) => ({ id: s.id, name: s.name, zh: s.zh[0], title: s.description }))}
    />
  );
}

function BrandName({ b }: { b: Brand }) {
  const english = useEnglishOnly();
  const zh = english ? undefined : zhName(b);
  return (
    <>
      <span className="bp-name">{b.name}</span>
      {zh ? (
        <span className="bp-zh" lang="zh">
          {zh}
        </span>
      ) : null}
    </>
  );
}

/** Searchable brand picker: matches Latin names, aliases and Chinese names; filter by tag. */
export function BrandPicker({ index, value, onChange }: { index: CatalogIndex; value: string[]; onChange: (v: string[]) => void }) {
  const [query, setQuery] = useState("");
  const [tag, setTag] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();

  const matches = useMemo(
    () => searchBrands(index.catalog.brands, query, tag, value).slice(0, tag || query ? 30 : 12),
    [index, query, tag, value],
  );
  const add = (id: string) => {
    onChange([...value, id]);
    setQuery("");
    setActive(0);
    inputRef.current?.focus();
  };

  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      setActive((a) => Math.max(0, Math.min(a + 1, matches.length - 1)));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === "Enter") {
      // Never submit the surrounding form (the profile, or a search) from the brand search.
      e.preventDefault();
      if (open && matches[active]) add(matches[active].id);
    } else if (e.key === "Escape") {
      if (open) {
        e.preventDefault();
        e.stopPropagation();
        setOpen(false);
      }
    } else if (e.key === "Backspace" && !query && value.length) {
      onChange(value.slice(0, -1));
    }
  };

  const showList = open && (matches.length > 0 || query.length > 0);
  const activeId = matches[active]?.id;
  useEffect(() => {
    if (showList && activeId) document.getElementById(`${listId}-${activeId}`)?.scrollIntoView({ block: "nearest" });
  }, [showList, activeId, listId]);

  return (
    <div className="bp">
      <div className="bp-tags" role="group" aria-label="Filter brands by tag">
        {index.tags.map((t) => (
          <button
            key={t}
            type="button"
            className="bp-tag"
            aria-pressed={tag === t}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              setTag(tag === t ? null : t);
              setActive(0);
              setOpen(true);
              inputRef.current?.focus();
            }}
          >
            {t}
          </button>
        ))}
      </div>
      <div className="bp-anchor">
        <div className="bp-field" onClick={() => inputRef.current?.focus()}>
          {value.map((id) => {
            const b = index.brand.get(id);
            return (
              <span key={id} className="bp-chip">
                {b ? <BrandName b={b} /> : id}
                <button
                  type="button"
                  className="bp-chip-x"
                  aria-label={`Remove ${b?.name ?? id}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    onChange(value.filter((x) => x !== id));
                  }}
                >
                  <IconX size={9} />
                </button>
              </span>
            );
          })}
          <input
            ref={inputRef}
            className="bp-input"
            value={query}
            placeholder={value.length ? "Add brand" : "Search brands: name, alias or 中文"}
            onChange={(e) => {
              setQuery(e.target.value);
              setActive(0);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            onBlur={() => setTimeout(() => setOpen(false), 120)}
            onKeyDown={onKey}
            role="combobox"
            aria-expanded={showList}
            aria-controls={listId}
            aria-activedescendant={showList && matches[active] ? `${listId}-${matches[active].id}` : undefined}
            aria-label="Search brands"
            spellCheck={false}
          />
        </div>
        {showList ? (
          <ul className="bp-list" id={listId} role="listbox" aria-label="Brands">
            {matches.length === 0 ? (
              <li className="bp-empty">No brand matches “{query}”{tag ? ` in ${tag}` : ""}.</li>
            ) : (
              matches.map((b, i) => (
                <li
                  key={b.id}
                  id={`${listId}-${b.id}`}
                  role="option"
                  aria-selected={i === active}
                  className={`bp-option ${i === active ? "is-active" : ""}`}
                  onMouseDown={(e) => e.preventDefault()}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => add(b.id)}
                >
                  <BrandName b={b} />
                  <span className="bp-meta">
                    {b.tags.slice(0, 2).join(" · ")} · {PRICE_TIER[b.price_tier]}
                  </span>
                </li>
              ))
            )}
          </ul>
        ) : null}
      </div>
    </div>
  );
}
