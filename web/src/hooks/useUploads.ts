import { useCallback, useEffect, useRef, useState } from "react";
import { useApi } from "../api/context";
import { isPhoto } from "../lib/photos";
import { toast } from "../lib/toast";
import { errorMessage } from "./useSearch";

export interface UploadItem {
  id: number;
  file: File;
  preview: string;
  key: string | null;
  state: "uploading" | "done" | "error";
  error: string | null;
}

export const MAX_UPLOADS = 4;

export function useUploads() {
  const api = useApi();
  const [items, setItems] = useState<UploadItem[]>([]);
  const nextId = useRef(1);
  const itemsRef = useRef(items);
  itemsRef.current = items;

  useEffect(() => () => itemsRef.current.forEach((i) => URL.revokeObjectURL(i.preview)), []);

  const send = useCallback(
    (item: UploadItem) => {
      api
        .upload(item.file)
        .then(({ key }) =>
          setItems((list) => list.map((i) => (i.id === item.id ? { ...i, key, state: "done", error: null } : i))),
        )
        .catch((e) =>
          setItems((list) =>
            list.map((i) => (i.id === item.id ? { ...i, state: "error", error: errorMessage(e) } : i)),
          ),
        );
    },
    [api],
  );

  const add = useCallback(
    (files: Iterable<File>) => {
      const images = [...files].filter(isPhoto);
      if (images.length === 0) {
        toast("Only image files can be used.", "error");
        return;
      }
      const room = MAX_UPLOADS - itemsRef.current.length;
      if (room <= 0) {
        toast(`Up to ${MAX_UPLOADS} photos per search.`, "error");
        return;
      }
      if (images.length > room) toast(`Up to ${MAX_UPLOADS} photos per search. Added the first ${room}.`, "error");
      const added = images.slice(0, room).map(
        (file): UploadItem => ({
          id: nextId.current++,
          file,
          preview: URL.createObjectURL(file),
          key: null,
          state: "uploading",
          error: null,
        }),
      );
      setItems((list) => [...list, ...added]);
      added.forEach(send);
    },
    [send],
  );

  const remove = useCallback((id: number) => {
    setItems((list) => {
      const item = list.find((i) => i.id === id);
      if (item) URL.revokeObjectURL(item.preview);
      return list.filter((i) => i.id !== id);
    });
  }, []);

  const retry = useCallback(
    (id: number) => {
      const item = itemsRef.current.find((i) => i.id === id);
      if (!item) return;
      setItems((list) => list.map((i) => (i.id === id ? { ...i, state: "uploading", error: null } : i)));
      send(item);
    },
    [send],
  );

  const clear = useCallback(() => {
    itemsRef.current.forEach((i) => URL.revokeObjectURL(i.preview));
    setItems([]);
  }, []);

  const pending = items.some((i) => i.state === "uploading");
  const keys = items.filter((i) => i.state === "done" && i.key).map((i) => i.key!);
  return { items, add, remove, retry, clear, pending, keys };
}

export type UploadsApi = ReturnType<typeof useUploads>;
