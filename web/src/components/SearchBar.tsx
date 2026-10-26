import { forwardRef, useRef, type ClipboardEvent, type FormEvent } from "react";
import { useApi } from "../api/context";
import { isPhoto } from "../lib/photos";
import type { Mode } from "../api/types";
import type { UploadsApi } from "../hooks/useUploads";
import { MAX_UPLOADS } from "../hooks/useUploads";
import { IconCamera, IconRefresh, IconSearch, IconSliders, IconX, Spinner } from "./Icons";
import { ModePicker } from "./ModePicker";

interface Props {
  query: string;
  onQuery: (q: string) => void;
  uploads: UploadsApi;
  onSubmit: () => void;
  busy: boolean;
  waitingForUploads: boolean;
  mode: Mode;
  onMode: (m: Mode) => void;
  optionsCount: number;
  optionsOpen: boolean;
  onToggleOptions: () => void;
  /** Why Search cannot run yet (null when it can). */
  missing: string | null;
  hint: string | null;
  onOpenOptions: () => void;
}

export function imageFiles(data: DataTransfer | null): File[] {
  if (!data) return [];
  const files = [...data.files].filter(isPhoto);
  if (files.length) return files;
  return [...data.items]
    .filter((i) => i.kind === "file")
    .map((i) => i.getAsFile())
    .filter((f): f is File => f != null && isPhoto(f));
}

export const SearchBar = forwardRef<HTMLInputElement, Props>(function SearchBar(
  { query, onQuery, uploads, onSubmit, busy, waitingForUploads, mode, onMode, optionsCount, optionsOpen, onToggleOptions, missing, hint, onOpenOptions },
  inputRef,
) {
  const fileRef = useRef<HTMLInputElement>(null);
  const api = useApi();

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!busy) onSubmit();
  };

  const onPaste = (e: ClipboardEvent<HTMLInputElement>) => {
    const files = imageFiles(e.clipboardData);
    if (files.length) {
      e.preventDefault();
      e.stopPropagation();
      uploads.add(files);
    }
  };

  return (
    <form className="searchbar" role="search" onSubmit={submit}>
      <ModePicker value={mode} onChange={onMode} />
      <IconSearch className="searchbar-icon" />
      {uploads.items.length > 0 ? (
        <div className="searchbar-photos">
          {uploads.items.map((u) => (
            <span key={u.id} className={`photo photo--${u.state}`} title={u.error ?? u.file.name}>
              <img src={u.key ? api.imgUrl(u.key) : u.preview} alt="" />
              {u.state === "uploading" ? (
                <span className="photo-overlay">
                  <Spinner size={12} />
                </span>
              ) : u.state === "error" ? (
                <button type="button" className="photo-overlay photo-retry" onClick={() => uploads.retry(u.id)} aria-label="Retry upload">
                  <IconRefresh size={12} />
                </button>
              ) : null}
              <button type="button" className="photo-remove" onClick={() => uploads.remove(u.id)} aria-label="Remove photo">
                <IconX size={10} />
              </button>
            </span>
          ))}
        </div>
      ) : null}
      <input
        ref={inputRef}
        className="searchbar-input"
        type="search"
        value={query}
        onChange={(e) => onQuery(e.target.value)}
        onPaste={onPaste}
        placeholder={uploads.items.length ? "Add a name (optional)" : optionsCount ? "Item name (optional with options)" : "Item name, or paste a photo"}
        aria-label="Item name"
        autoComplete="off"
        spellCheck={false}
        enterKeyHint="search"
      />
      <kbd className="searchbar-kbd" aria-hidden="true">
        /
      </kbd>
      <button
        type="button"
        className={`opts-toggle ${optionsOpen ? "is-open" : ""}`}
        onClick={onToggleOptions}
        aria-expanded={optionsOpen}
        aria-label={optionsCount ? `Options (${optionsCount} set)` : "Options"}
        title="Category, colors, brands, styles, price and more"
      >
        <IconSliders size={14} />
        <span className="hide-sm">Options</span>
        {optionsCount ? <span className="opts-count">{optionsCount}</span> : null}
      </button>
      <button
        type="button"
        className="icon-btn"
        onClick={() => fileRef.current?.click()}
        disabled={uploads.items.length >= MAX_UPLOADS}
        title="Add a photo (or drop / paste one)"
        aria-label="Add a photo"
      >
        <IconCamera />
      </button>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={(e) => {
          if (e.target.files?.length) uploads.add(e.target.files);
          e.target.value = "";
        }}
      />
      <button
        type="submit"
        className={`btn btn--primary searchbar-go ${missing ? "is-missing" : ""}`}
        disabled={busy}
        title={missing ?? undefined}
        aria-describedby={hint ? "search-hint" : undefined}
      >
        {busy || waitingForUploads ? <Spinner size={12} /> : null}
        {waitingForUploads ? "Uploading" : "Search"}
      </button>
      {hint ? (
        <div className="search-hint" id="search-hint" role="status">
          {hint}
          <button type="button" className="link-btn" onClick={onOpenOptions}>
            Open options
          </button>
        </div>
      ) : null}
    </form>
  );
});
