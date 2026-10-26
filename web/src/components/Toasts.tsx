import { dismiss, useToasts } from "../lib/toast";
import { IconX } from "./Icons";

export function Toasts() {
  const toasts = useToasts();
  return (
    <div className="toasts" role="status" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`toast toast--${t.tone}`}>
          <span>{t.text}</span>
          <button type="button" className="toast-x" onClick={() => dismiss(t.id)} aria-label="Dismiss">
            <IconX size={11} />
          </button>
        </div>
      ))}
    </div>
  );
}
