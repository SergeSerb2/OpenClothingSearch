import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import type { Gender, Profile } from "../api/types";
import { EMPTY_PROFILE, type ProfileApi } from "../hooks/useProfile";
import { useCatalog } from "../lib/catalog";
import { useMoney } from "../lib/money";
import { IconCheck, Spinner } from "./Icons";
import { BrandPicker, Segmented, StyleChips } from "./Pickers";

function num(v: string): number | null {
  if (v.trim() === "") return null;
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function ProfileForm({ pf }: { pf: ProfileApi }) {
  const { index } = useCatalog();
  const [draft, setDraft] = useState<Profile>(pf.profile ?? EMPTY_PROFILE);
  const money = useMoney();
  const [saved, setSaved] = useState(false);
  const ids = { h: useId(), w: useId(), top: useId(), bottom: useId(), shoe: useId(), budget: useId() };
  const revision = useRef(0);
  const submitted = useRef<number | null>(null);
  const savedJson = JSON.stringify(pf.profile ?? EMPTY_PROFILE);

  useEffect(() => {
    if (submitted.current == null || submitted.current === revision.current) setDraft(JSON.parse(savedJson) as Profile);
    submitted.current = null;
  }, [savedJson]);

  const dirty = JSON.stringify(draft) !== savedJson;
  const set = (patch: Partial<Profile>) => { revision.current++; setDraft((d) => ({ ...d, ...patch })); };
  const setSize = (k: keyof Profile["sizes"], v: string) => { revision.current++; setDraft((d) => ({ ...d, sizes: { ...d.sizes, [k]: v } })); };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    submitted.current = revision.current;
    if (await pf.save(draft)) {
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    }
  };

  if (!pf.loaded && !pf.profile) {
    return (
      <div className="panel-empty">
        <Spinner /> Loading profile…
      </div>
    );
  }

  return (
    <form className="profile" onSubmit={submit}>
      {pf.error && !pf.profile ? <p className="set-error">Couldn't load the saved profile: {pf.error}</p> : null}
      <div className="pf-row">
        <span className="pf-label">Gender</span>
        <Segmented<"" | Gender>
          label="Gender"
          size="sm"
          value={draft.gender ?? ""}
          onChange={(v) => set({ gender: v || null })}
          options={[
            ["", "Not set"],
            ["men", "Men"],
            ["women", "Women"],
            ["unisex", "Unisex"],
          ]}
        />
      </div>
      <div className="pf-grid">
        <label className="pf-field" htmlFor={ids.h}>
          <span className="pf-label">Height</span>
          <span className="pf-input">
            <input id={ids.h} className="input input--sm" type="number" min={0} value={draft.height_cm ?? ""} onChange={(e) => set({ height_cm: num(e.target.value) })} />
            <span className="muted">cm</span>
          </span>
        </label>
        <label className="pf-field" htmlFor={ids.w}>
          <span className="pf-label">Weight</span>
          <span className="pf-input">
            <input id={ids.w} className="input input--sm" type="number" min={0} value={draft.weight_kg ?? ""} onChange={(e) => set({ weight_kg: num(e.target.value) })} />
            <span className="muted">kg</span>
          </span>
        </label>
        <label className="pf-field" htmlFor={ids.top}>
          <span className="pf-label">Top size</span>
          <input id={ids.top} className="input input--sm" placeholder="M, L, 50" value={draft.sizes.top} onChange={(e) => setSize("top", e.target.value)} />
        </label>
        <label className="pf-field" htmlFor={ids.bottom}>
          <span className="pf-label">Bottom size</span>
          <input id={ids.bottom} className="input input--sm" placeholder="32, 32x32, M" value={draft.sizes.bottom} onChange={(e) => setSize("bottom", e.target.value)} />
        </label>
        <label className="pf-field" htmlFor={ids.shoe}>
          <span className="pf-label">Shoe size</span>
          <input id={ids.shoe} className="input input--sm" placeholder="EU 43, US 9.5" value={draft.sizes.shoe} onChange={(e) => setSize("shoe", e.target.value)} />
        </label>
        <label className="pf-field" htmlFor={ids.budget}>
          <span className="pf-label">Budget per item</span>
          <span className="pf-input">
            <span className="muted">¥</span>
            <input id={ids.budget} className="input input--sm" type="number" min={0} value={draft.budget_cny ?? ""} onChange={(e) => set({ budget_cny: num(e.target.value) })} />
            {draft.budget_cny ? <span className="muted">{money.local(draft.budget_cny)}</span> : null}
          </span>
        </label>
      </div>
      {index ? (
        <>
          <div className="pf-block">
            <span className="pf-label">Favorite brands</span>
            <BrandPicker index={index} value={draft.brands} onChange={(v) => set({ brands: v })} />
          </div>
          <div className="pf-block">
            <span className="pf-label">Favorite styles</span>
            <StyleChips index={index} value={draft.styles} onChange={(v) => set({ styles: v })} />
          </div>
        </>
      ) : (
        <p className="set-help">Brand and style pickers need the catalog, which is not available.</p>
      )}
      <p className="set-help">The AI uses this for size advice, suggestions, search plans and your budget. Gender prefills the search options.</p>
      <div className="store-actions">
        <button type="submit" className="btn btn--primary" disabled={!dirty || pf.saving}>
          {pf.saving ? <Spinner size={11} /> : null}
          Save profile
        </button>
        {dirty ? (
          <button type="button" className="btn btn--ghost" onClick={() => { revision.current++; setDraft(JSON.parse(savedJson) as Profile); }}>
            Revert
          </button>
        ) : saved ? (
          <span className="state state--ok">
            <IconCheck size={12} /> Saved
          </span>
        ) : null}
      </div>
    </form>
  );
}
