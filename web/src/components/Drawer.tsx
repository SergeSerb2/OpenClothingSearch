import { useEffect, useRef, type ReactNode } from "react";
import { IconX } from "./Icons";

interface Props {
  title: string;
  onClose: () => void;
  children: ReactNode;
  side?: "left" | "right";
}

export function Drawer({ title, onClose, children, side = "right" }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const returnTo = document.activeElement as HTMLElement | null;
    ref.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
      if (e.key === "Tab" && ref.current) {
        // Keep focus inside the drawer.
        const focusable = [...ref.current.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]',
        )].filter((el) => el.tabIndex >= 0 && !el.matches(":disabled") && el.getClientRects().length > 0);
        if (focusable.length === 0) { e.preventDefault(); ref.current.focus(); return; }
        const outside = !ref.current.contains(document.activeElement) || document.activeElement === ref.current;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey && (outside || document.activeElement === first)) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && (outside || document.activeElement === last)) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      returnTo?.focus?.();
    };
  }, [onClose]);

  return (
    <div className="drawer-layer">
      <div className="drawer-backdrop" onClick={onClose} />
      <div ref={ref} className={`drawer drawer--${side}`} role="dialog" aria-modal="true" aria-label={title} tabIndex={-1}>
        <header className="drawer-head">
          <h2>{title}</h2>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close">
            <IconX />
          </button>
        </header>
        <div className="drawer-body">{children}</div>
      </div>
    </div>
  );
}
