"""Optional password for remote access (FINDER_PASSWORD).

With a password set, requests that come from another computer (through a tunnel, a
reverse proxy or a cloud host) need a session cookie, which the login page gives out.
Requests to 127.0.0.1/localhost on this computer stay open, unless FINDER_AUTH=all
(use that on a cloud host, where anyone can send any Host header).
"""

from __future__ import annotations

import asyncio
import hashlib
import hmac
import html
import secrets
import time
from contextvars import ContextVar
from http.cookies import SimpleCookie
from urllib.parse import quote, urlsplit

from starlette.responses import HTMLResponse, JSONResponse, RedirectResponse, Response

from .config import DATA_DIR, settings

COOKIE = "finder_session"
SESSION_DAYS = 30
LOOPBACK = {"localhost", "127.0.0.1", "::1"}
PUBLIC = {"/login", "/icon.svg", "/favicon.ico"}
KEY_FILE = DATA_DIR / "session.key"
MAX_FAILS = 10  # per client in 10 minutes, then a lockout
WINDOW = 600

_fails: dict[str, list[float]] = {}
# Whether the current request went through the login check (for the Log out button).
in_session: ContextVar[bool] = ContextVar("in_session", default=False)


def _server_key() -> bytes:
    """A random key kept in data/, so sessions survive restarts but cannot be forged.

    FINDER_SESSION_SECRET replaces it, so a gate (gate.py) and the app accept the same cookie.
    """
    if settings.session_secret:
        return settings.session_secret.encode()
    try:
        key = KEY_FILE.read_bytes()
        if len(key) >= 32:
            return key
    except OSError:
        pass
    key = secrets.token_bytes(32)
    KEY_FILE.write_bytes(key)
    KEY_FILE.chmod(0o600)
    return key


def _signing_key() -> bytes:
    # A new password makes every old session invalid.
    return hashlib.sha256(_server_key() + settings.password.encode()).digest()


def make_token(now: float | None = None) -> str:
    expiry = str(int((now or time.time()) + SESSION_DAYS * 86400))
    return f"{expiry}.{hmac.new(_signing_key(), expiry.encode(), hashlib.sha256).hexdigest()}"


def valid_token(token: str | None) -> bool:
    if not token or "." not in token:
        return False
    expiry, sig = token.split(".", 1)
    good = hmac.new(_signing_key(), expiry.encode(), hashlib.sha256).hexdigest()
    return hmac.compare_digest(sig, good) and expiry.isdigit() and int(expiry) > time.time()


def password_ok(candidate: str) -> bool:
    a = hashlib.sha256(candidate.encode()).digest()
    b = hashlib.sha256(settings.password.encode()).digest()
    return bool(settings.password) and hmac.compare_digest(a, b)


def _hostname(host: str) -> str:
    try:
        return (urlsplit(f"//{host.strip()}").hostname or "").lower()
    except ValueError:
        return ""


def required(headers: dict[str, str]) -> bool:
    """Does this request need a session?"""
    if not settings.password:
        return False
    return settings.auth_mode == "all" or _hostname(headers.get("host", "")) not in LOOPBACK


def session_ok(headers: dict[str, str]) -> bool:
    cookie = SimpleCookie()
    try:
        cookie.load(headers.get("cookie", ""))
    except Exception:  # noqa: BLE001 - a bad cookie header is just "no session"
        return False
    morsel = cookie.get(COOKIE)
    return valid_token(morsel.value if morsel else None)


def client_id(scope, headers: dict[str, str]) -> str:
    # Behind Cloudflare the real client is in CF-Connecting-IP; uvicorn already applied X-Forwarded-For.
    return headers.get("cf-connecting-ip") or (scope.get("client") or ("?",))[0]


def locked(client: str) -> bool:
    now = time.time()
    recent = [t for t in _fails.get(client, []) if now - t < WINDOW]
    _fails[client] = recent
    return len(recent) >= MAX_FAILS


def failed(client: str) -> None:
    _fails.setdefault(client, []).append(time.time())


def safe_next(target: str | None) -> str:
    """Only paths on this site: no "//evil.example" or "https://..." redirects."""
    if not target or not target.startswith("/") or target.startswith("//") or "\\" in target:
        return "/"
    return target


def login_page(next_path: str, error: str = "", status: int = 200) -> HTMLResponse:
    message = f'<p class="error" role="alert">{html.escape(error)}</p>' if error else ""
    body = f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Log in · OpenClothingSearch</title>
<link rel="icon" href="/icon.svg">
<style>
  :root {{ color-scheme: light dark; font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif; }}
  body {{ margin: 0; min-height: 100vh; display: grid; place-items: center; background: Canvas; color: CanvasText; }}
  form {{ width: min(340px, calc(100vw - 48px)); display: grid; gap: 12px; padding: 28px; border: 1px solid #8884; border-radius: 12px; }}
  h1 {{ margin: 0; font-size: 18px; display: flex; align-items: center; gap: 10px; }}
  h1 img {{ border-radius: 6px; }}
  p {{ margin: 0; font-size: 13px; opacity: 0.75; line-height: 1.5; }}
  input {{ font: inherit; font-size: 15px; padding: 9px 11px; border: 1px solid #8886; border-radius: 8px; background: transparent; color: inherit; }}
  button {{ font: inherit; font-size: 14px; font-weight: 600; padding: 9px; border: 0; border-radius: 8px; background: #2563eb; color: white; cursor: pointer; }}
  .error {{ color: #dc2626; opacity: 1; }}
</style>
</head>
<body>
<form method="post" action="/login">
  <h1><img src="/icon.svg" width="28" height="28" alt="">OpenClothingSearch</h1>
  <p>Enter the password to use this finder.</p>
  {message}
  <input type="password" name="password" aria-label="Password" placeholder="Password" autocomplete="current-password" autofocus required>
  <input type="hidden" name="next" value="{html.escape(next_path)}">
  <button type="submit">Log in</button>
</form>
</body>
</html>"""
    return HTMLResponse(body, status_code=status, headers={"Cache-Control": "no-store"})


def login_response(scope, next_path: str) -> RedirectResponse:
    resp = RedirectResponse(safe_next(next_path), status_code=303)
    resp.set_cookie(
        COOKIE,
        make_token(),
        max_age=SESSION_DAYS * 86400,
        httponly=True,
        secure=scope.get("scheme") == "https",
        samesite="lax",
        path="/",
    )
    return resp


async def submit(scope, headers: dict[str, str], password: str, next_path: str) -> Response:
    """Check a password from the login form: a session cookie, or the form again."""
    client = client_id(scope, headers)
    if locked(client):
        return login_page(next_path, "Too many wrong passwords. Wait 10 minutes and try again.", 429)
    if not password_ok(password):
        failed(client)
        await asyncio.sleep(0.6)  # slows down guessing
        return login_page(next_path, "Wrong password.", 401)
    return login_response(scope, next_path)


def logout_response() -> JSONResponse:
    resp = JSONResponse({"ok": True})
    resp.delete_cookie(COOKIE, path="/")
    return resp


class RequireLogin:
    """ASGI middleware: no session, no access (except the login page)."""

    def __init__(self, app) -> None:
        self.app = app

    async def __call__(self, scope, receive, send) -> None:
        if scope["type"] == "http":
            headers = {k.decode("latin-1").lower(): v.decode("latin-1") for k, v in scope["headers"]}
            path = scope.get("path", "")
            needed = required(headers)
            in_session.set(needed)
            if needed and path not in PUBLIC and not session_ok(headers):
                if path.startswith("/api/"):
                    resp = JSONResponse({"detail": "Log in first."}, status_code=401)
                else:
                    query = scope.get("query_string", b"").decode("latin-1")
                    target = path + (f"?{query}" if query else "")
                    resp = RedirectResponse(f"/login?next={quote(target, safe='')}", status_code=303)
                await resp(scope, receive, send)
                return
        await self.app(scope, receive, send)
