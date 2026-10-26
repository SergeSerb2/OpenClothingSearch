import { useCallback, useEffect, useRef, useState } from "react";
import { useApi } from "../api/context";
import type { Profile } from "../api/types";
import { toast } from "../lib/toast";
import { errorMessage } from "./useSearch";

export const EMPTY_PROFILE: Profile = {
  gender: null,
  height_cm: null,
  weight_kg: null,
  sizes: { top: "", bottom: "", shoe: "" },
  budget_cny: null,
  brands: [],
  styles: [],
};

/** Normalizes a profile from the backend (fills missing fields). */
function normalize(p: Partial<Profile> | null | undefined): Profile {
  return {
    ...EMPTY_PROFILE,
    ...p,
    sizes: { ...EMPTY_PROFILE.sizes, ...(p?.sizes ?? {}) },
    brands: p?.brands ?? [],
    styles: p?.styles ?? [],
  };
}

export function useProfile(fromStatus: Profile | undefined) {
  const api = useApi();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);

  const generation = useRef(0);

  useEffect(() => {
    const g = ++generation.current;
    let cancelled = false;
    api
      .profile()
      .then((p) => {
        if (!cancelled && g === generation.current) setProfile(normalize(p));
      })
      .catch((e) => {
        if (!cancelled && g === generation.current) setError(errorMessage(e));
      })
      .finally(() => {
        if (!cancelled && g === generation.current) setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [api]);

  // Status carries the profile too; use it if GET /api/profile is not there.
  useEffect(() => {
    if (fromStatus && !profile) setProfile(normalize(fromStatus));
  }, [fromStatus, profile]);

  const save = useCallback(
    async (p: Profile): Promise<boolean> => {
      generation.current++;
      setSaving(true);
      try {
        setProfile(normalize(await api.putProfile(p)));
        setError(null);
        return true;
      } catch (e) {
        toast(`Couldn't save the profile: ${errorMessage(e)}`, "error");
        return false;
      } finally {
        setLoaded(true);
        setSaving(false);
      }
    },
    [api],
  );

  return { profile, error, loaded, saving, save };
}

export type ProfileApi = ReturnType<typeof useProfile>;
