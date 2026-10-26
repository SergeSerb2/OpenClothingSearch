import type { LoginSite, SourceStatus, Status } from "../api/types";
import { METHOD_LABEL, SITE_LABEL, SOURCE_LABEL, loginSiteFor } from "../lib/sources";
import type { StatusBusy } from "../hooks/useStatus";
import { IconAlert, IconCheck, IconKey, IconLock, Spinner } from "./Icons";

export interface BlockerActions {
  status: Status | null;
  busy: StatusBusy;
  /** Logins finished in this session (ms) and when the search started (ms). */
  loggedInAt: Partial<Record<LoginSite, number>>;
  since: number;
  onLogin: (site: LoginSite) => void;
  onSearchAgain?: () => void;
  onOpenSettings: () => void;
}

interface Line {
  key: string;
  kind: "login" | "key" | "error";
  label: string;
  message: string;
  site: LoginSite | null;
}

function methods(list: SourceStatus[]): string {
  return [...new Set(list.map((s) => METHOD_LABEL[s.method]))].join(", ");
}

/** One short line per thing that kept a source from running, with the fix next to it. */
export function blockerLines(sources: SourceStatus[]): Line[] {
  const lines: Line[] = [];
  const logins = new Map<string, SourceStatus[]>();
  const keys = new Map<string, SourceStatus[]>();
  for (const s of sources) {
    if (s.state === "needs_login") {
      const k = loginSiteFor(s.source) ?? s.source;
      logins.set(k, [...(logins.get(k) ?? []), s]);
    } else if (s.state === "needs_key") {
      const k = s.message || `${s.source}:${s.provider}`;
      keys.set(k, [...(keys.get(k) ?? []), s]);
    }
  }
  for (const [site, list] of logins) {
    lines.push({
      key: `login:${site}`,
      kind: "login",
      label: `${SOURCE_LABEL[list[0].source]} · ${methods(list)}`,
      message: list[0].message || `Log in to ${SOURCE_LABEL[list[0].source]} to search it.`,
      site: loginSiteFor(list[0].source),
    });
  }
  for (const [msg, list] of keys) {
    const names = [...new Set(list.map((s) => SOURCE_LABEL[s.source]))].join(", ");
    lines.push({
      key: `key:${msg}`,
      kind: "key",
      label: `${names} · ${methods(list)}`,
      message: list[0].message || `Needs an API key (${list[0].provider}).`,
      site: null,
    });
  }
  for (const s of sources) {
    if (s.state !== "error") continue;
    // Fallback for older backends that report a slider check as an error: offer the login window.
    const wantsLogin = /log ?in|slider|captcha|verif|验证/i.test(s.message);
    lines.push({
      key: `error:${s.source}:${s.method}:${s.provider}`,
      kind: "error",
      label: `${SOURCE_LABEL[s.source]} · ${METHOD_LABEL[s.method]}`,
      message: s.message || "Failed.",
      site: wantsLogin ? loginSiteFor(s.source) : null,
    });
  }
  return lines;
}

export function Blockers({
  sources,
  actions,
  showSearchAgain = true,
}: {
  sources: SourceStatus[];
  actions: BlockerActions;
  showSearchAgain?: boolean;
}) {
  const lines = blockerLines(sources);
  if (lines.length === 0) return null;
  const { status, busy, onLogin, onSearchAgain, onOpenSettings, loggedInAt, since } = actions;
  const loginOpen = status?.login_open ?? null;
  // Fixed only if a login finished after the search started. A site that was already logged in
  // can still need the login window (slider check), so "logged in" alone is not enough.
  const fixedSince = (l: Line) => l.kind === "login" && l.site != null && (loggedInAt[l.site] ?? 0) > since;
  const resolved = lines.filter(fixedSince);
  return (
    <ul className="blockers">
      {lines.map((line) => {
        const loggedInNow = fixedSince(line);
        const alreadyIn = line.site != null && status?.logins[line.site] === true;
        return (
          <li key={line.key} className={`blocker blocker--${line.kind} ${loggedInNow ? "is-resolved" : ""}`}>
            <span className="blocker-icon">
              {loggedInNow ? (
                <IconCheck size={13} />
              ) : line.kind === "login" ? (
                <IconLock size={13} />
              ) : line.kind === "key" ? (
                <IconKey size={13} />
              ) : (
                <IconAlert size={13} />
              )}
            </span>
            <span className="blocker-label">{line.label}</span>
            <span className="blocker-msg">{loggedInNow ? `Logged in to ${SITE_LABEL[line.site!]} now.` : line.message}</span>
            <span className="blocker-action">
              {line.kind === "login" && line.site ? (
                loggedInNow ? null : (
                  <button
                    type="button"
                    className="btn btn--sm"
                    disabled={loginOpen != null || busy === `login:${line.site}`}
                    onClick={() => onLogin(line.site!)}
                  >
                    {busy === `login:${line.site}` ? <Spinner size={11} /> : null}
                    {loginOpen === line.site ? "Window open" : alreadyIn ? "Open login window" : "Log in"}
                  </button>
                )
              ) : line.kind === "key" ? (
                <button type="button" className="btn btn--sm btn--ghost" onClick={onOpenSettings}>
                  Settings
                </button>
              ) : line.kind === "error" && line.site ? (
                <button
                  type="button"
                  className="btn btn--sm"
                  disabled={loginOpen != null || busy === `login:${line.site}`}
                  onClick={() => onLogin(line.site!)}
                >
                  {busy === `login:${line.site}` ? <Spinner size={11} /> : null}
                  {loginOpen === line.site ? "Window open" : "Open login window"}
                </button>
              ) : null}
            </span>
          </li>
        );
      })}
      {showSearchAgain && resolved.length > 0 && onSearchAgain ? (
        <li className="blocker blocker--footer">
          <span />
          <span className="blocker-msg">Search again to include the {resolved.length === 1 ? "source" : "sources"} you logged in to.</span>
          <span className="blocker-action">
            <button type="button" className="btn btn--sm btn--primary" onClick={onSearchAgain}>
              Search again
            </button>
          </span>
        </li>
      ) : null}
    </ul>
  );
}
