import { useState } from "react";
import { useApi } from "../api/context";
import { IconImage } from "./Icons";

interface Props {
  imgKey: string | null;
  alt?: string;
  className?: string;
  /** Use a local URL (blob: or data:) instead of /api/img. */
  src?: string;
  eager?: boolean;
}

/** Images always go through /api/img/{key}; marketplace CDNs block hotlinking. */
export function Img({ imgKey, alt = "", className = "", src, eager }: Props) {
  const api = useApi();
  const url = src ?? (imgKey ? api.imgUrl(imgKey) : null);
  // State is keyed by URL so a cached image that loads before React re-renders is not missed.
  const [loadedUrl, setLoadedUrl] = useState<string | null>(null);
  const [failedUrl, setFailedUrl] = useState<string | null>(null);

  if (!url || failedUrl === url) {
    return (
      <span className={`img img--empty ${className}`} role={alt ? "img" : undefined} aria-label={alt || undefined}>
        <IconImage size={20} />
      </span>
    );
  }
  return (
    <span className={`img ${loadedUrl === url ? "img--loaded" : ""} ${className}`}>
      <img
        key={url}
        ref={(el) => {
          if (el?.complete && el.naturalWidth > 0) setLoadedUrl(url);
        }}
        src={url}
        alt={alt}
        loading={eager ? "eager" : "lazy"}
        decoding="async"
        draggable={false}
        onLoad={() => setLoadedUrl(url)}
        onError={() => setFailedUrl(url)}
      />
    </span>
  );
}
