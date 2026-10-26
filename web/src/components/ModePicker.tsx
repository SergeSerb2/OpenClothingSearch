import { useEffect, useId, useRef, useState } from "react";
import type { Mode } from "../api/types";
import { MODES } from "../lib/options";
import { IconCheck, IconChevron } from "./Icons";

/** Search mode menu inside the search bar: exact product / similar style / cheaper alternatives. */
export function ModePicker({ value, onChange }: { value: Mode; onChange: (m: Mode) => void }) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuId = useId();
  const current = MODES.find((m) => m.id === value) ?? MODES[0];

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, [open]);

  const choose = (m: Mode) => {
    onChange(m);
    setOpen(false);
    btnRef.current?.focus();
  };

  return (
    <div className="mode" ref={ref}>
      <button
        ref={btnRef}
        type="button"
        className={`mode-btn mode-btn--${value}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={menuId}
        title={`${current.label}: ${current.help}`}
        onClick={() => {
          setActive(MODES.findIndex((m) => m.id === value));
          setOpen((o) => !o);
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown" || e.key === "ArrowUp") {
            e.preventDefault();
            setActive(MODES.findIndex((m) => m.id === value));
            setOpen(true);
          }
        }}
      >
        {current.short}
        <IconChevron size={12} />
      </button>
      {open ? (
        <ul
          className="mode-menu"
          id={menuId}
          role="listbox"
          aria-label="Search mode"
          aria-activedescendant={`${menuId}-${MODES[active].id}`}
          tabIndex={-1}
          ref={(el) => el?.focus()}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setActive((a) => (a + 1) % MODES.length);
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActive((a) => (a + MODES.length - 1) % MODES.length);
            } else if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              choose(MODES[active].id);
            } else if (e.key === "Escape" || e.key === "Tab") {
              e.preventDefault();
              e.stopPropagation();
              setOpen(false);
              btnRef.current?.focus();
            }
          }}
        >
          {MODES.map((m, i) => (
            <li
              key={m.id}
              id={`${menuId}-${m.id}`}
              role="option"
              aria-selected={m.id === value}
              className={`mode-item ${i === active ? "is-active" : ""}`}
              onMouseEnter={() => setActive(i)}
              onClick={() => choose(m.id)}
            >
              <span className="mode-check">{m.id === value ? <IconCheck size={12} /> : null}</span>
              <span>
                <span className="mode-label">{m.label}</span>
                <span className="mode-help">{m.help}</span>
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
