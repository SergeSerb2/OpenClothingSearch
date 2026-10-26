import type { CSSProperties } from "react";
import { useApi } from "../api/context";
import type { Box } from "../api/types";
import { Img } from "./Img";

/**
 * Shows an item's own crop when the backend made one; otherwise crops the outfit photo with CSS.
 * `photoAspect` (width / height of the photo) keeps the CSS crop undistorted.
 */
export function Crop({
  cropKey,
  photoKey,
  box,
  photoAspect,
  className = "",
}: {
  cropKey: string | null | undefined;
  photoKey?: string;
  box?: Box;
  photoAspect?: number;
  className?: string;
}) {
  const api = useApi();
  if (cropKey || !photoKey || !box) return <Img imgKey={cropKey ?? null} className={`crop ${className}`} />;
  const [x0, y0, x1, y1] = box;
  const w = Math.max(0.01, x1 - x0);
  const h = Math.max(0.01, y1 - y0);
  const style: CSSProperties = {
    backgroundImage: `url("${api.imgUrl(photoKey)}")`,
    backgroundSize: `${100 / w}% ${100 / h}%`,
    backgroundPosition: `${w < 1 ? (x0 / (1 - w)) * 100 : 0}% ${h < 1 ? (y0 / (1 - h)) * 100 : 0}%`,
  };
  const aspect = photoAspect ? (w * photoAspect) / h : 1;
  return (
    <span className={`crop crop--css ${className}`}>
      <span className="crop-inner" style={{ ...style, width: `${Math.min(1, aspect) * 100}%`, height: `${Math.min(1, 1 / aspect) * 100}%` }} />
    </span>
  );
}
