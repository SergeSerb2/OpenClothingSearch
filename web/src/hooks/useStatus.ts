import { useCallback, useEffect, useRef, useState } from "react";
import { useApi } from "../api/context";
import type { AiConfig, AiTestResult, KeyId, LoginSite, Status } from "../api/types";
import { siteLabel } from "../lib/sources";
import { retryTranslations } from "../lib/translate";
import { toast } from "../lib/toast";
import { errorMessage } from "./useSearch";

export type StatusBusy = `login:${LoginSite}` | "done" | "stores" | "ai" | "keys" | null;

export function useStatus() {
  const api = useApi();
  const [status, setStatus] = useState<Status | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<StatusBusy>(null);
  /** When each site's login finished in this session (ms), to tell "fixed since the search" apart. */
  const [loggedInAt, setLoggedInAt] = useState<Partial<Record<LoginSite, number>>>({});

  const generation = useRef(0);
  const mutating = useRef(0);

  const refresh = useCallback(async () => {
    if (mutating.current) return null;
    const g = ++generation.current;
    try {
      const s = await api.status();
      if (g !== generation.current) return null;
      setStatus(s);
      setError(null);
      return s;
    } catch (e) {
      if (g === generation.current) setError(errorMessage(e));
      return null;
    }
  }, [api]);

  useEffect(() => {
    void refresh();
    const onFocus = () => void refresh();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [refresh]);

  // Poll while a login window is open (it can be closed from the backend side),
  // and slowly while the backend is unreachable.
  const loginOpen = status?.login_open ?? null;
  useEffect(() => {
    if (!loginOpen && !error) return;
    const t = setInterval(() => void refresh(), loginOpen ? 2500 : 5000);
    return () => clearInterval(t);
  }, [loginOpen, error, refresh]);

  const login = useCallback(
    async (site: LoginSite) => {
      generation.current++;
      mutating.current++;
      setBusy(`login:${site}`);
      try {
        setStatus(await api.login(site));
      } catch (e) {
        toast(`Couldn't open the ${siteLabel(site)} login window: ${errorMessage(e)}`, "error");
      } finally {
        generation.current++;
        mutating.current--;
        setBusy(null);
      }
    },
    [api],
  );

  const loginDone = useCallback(async () => {
    const site = status?.login_open;
    generation.current++;
    mutating.current++;
    setBusy("done");
    try {
      const s = await api.loginDone();
      setStatus(s);
      if (site && site in s.logins) {
        const ok = s.logins[site as LoginSite];
        if (ok) setLoggedInAt((m) => ({ ...m, [site]: Date.now() }));
        toast(ok ? `Logged in to ${siteLabel(site)}.` : `${siteLabel(site)} still looks logged out.`, ok ? "info" : "error");
      }
    } catch (e) {
      toast(`Couldn't close the login window: ${errorMessage(e)}`, "error");
    } finally {
      generation.current++;
      mutating.current--;
      setBusy(null);
    }
  }, [api, status?.login_open]);

  const saveStores = useCallback(
    async (stores: string[]): Promise<boolean> => {
      generation.current++;
      mutating.current++;
      setBusy("stores");
      try {
        setStatus(await api.putYupooStores(stores));
        return true;
      } catch (e) {
        toast(`Couldn't save Yupoo stores: ${errorMessage(e)}`, "error");
        return false;
      } finally {
        generation.current++;
        mutating.current--;
        setBusy(null);
      }
    },
    [api],
  );

  const saveAi = useCallback(
    async (config: AiConfig): Promise<boolean> => {
      generation.current++;
      mutating.current++;
      setBusy("ai");
      try {
        setStatus(await api.saveAi(config));
        retryTranslations();
        return true;
      } catch (e) {
        toast(`Couldn't save the AI settings: ${errorMessage(e)}`, "error");
        return false;
      } finally {
        generation.current++;
        mutating.current--;
        setBusy(null);
      }
    },
    [api],
  );

  const testAi = useCallback((config: AiConfig): Promise<AiTestResult> => api.testAi(config), [api]);

  const saveKeys = useCallback(
    async (keys: Partial<Record<KeyId, string>>): Promise<boolean> => {
      generation.current++;
      mutating.current++;
      setBusy("keys");
      try {
        setStatus(await api.saveKeys(keys));
        return true;
      } catch (e) {
        toast(`Couldn't save the key: ${errorMessage(e)}`, "error");
        return false;
      } finally {
        generation.current++;
        mutating.current--;
        setBusy(null);
      }
    },
    [api],
  );

  return { status, error, busy, loggedInAt, refresh, login, loginDone, saveStores, saveAi, testAi, saveKeys };
}

export type StatusApi = ReturnType<typeof useStatus>;
