import { tipOf, useEn } from "../lib/translate";

/** Inline text shown in English when it is Chinese. Hover shows the original. */
export function En({ text, className, tip }: { text: string | null | undefined; className?: string; tip?: string }) {
  const s = useEn(text);
  const cls = [className, s.pending ? "is-translating" : null].filter(Boolean).join(" ") || undefined;
  return (
    <span className={cls} lang={s.lang} title={s.original || tip ? tipOf(s, tip) : undefined}>
      {s.text}
    </span>
  );
}
