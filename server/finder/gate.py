"""Login gate for a cloud deployment: python -m finder.gate

A small server in front of the app. It shows the login page and checks the password
itself, and it forwards a request to the app (FINDER_UPSTREAM) only with a valid session.
On Fly.io the app then has only a private address: bots and scanners reach the gate, but
they cannot start the large machine that runs the app.

Set the same FINDER_PASSWORD and FINDER_SESSION_SECRET on the gate and on the app, so the
app accepts the gate's cookie too.
"""

from __future__ import annotations

import asyncio
import os
import sys
import time
from urllib.parse import parse_qs, quote

import httpx
import uvicorn
from starlette.requests import Request
from starlette.responses import FileResponse, HTMLResponse, JSONResponse, PlainTextResponse, RedirectResponse, Response, StreamingResponse

from . import auth
from .config import ROOT, settings

UPSTREAM = os.environ.get("FINDER_UPSTREAM", "").rstrip("/")
ICON = next((p for p in (ROOT / "web/dist/icon.svg", ROOT / "web/public/icon.svg") if p.exists()), None)
# Not forwarded: they describe one connection, not the request.
HOP = {"connection", "keep-alive", "proxy-authenticate", "proxy-authorization", "te", "trailer", "trailers", "transfer-encoding", "upgrade"}
WAKE_SECONDS = 60  # a stopped app machine needs a few seconds to start
MAX_FORM = 4096

_client: httpx.AsyncClient | None = None


def client() -> httpx.AsyncClient:
    global _client
    if _client is None:
        # No read timeout: search progress is a long-lived event stream.
        _client = httpx.AsyncClient(timeout=httpx.Timeout(None, connect=10, write=60), follow_redirects=False)
    return _client


def _same_origin(headers: dict[str, str]) -> bool:
    origin = headers.get("origin")
    if origin is None:
        return True
    return origin.split("://", 1)[-1].rstrip("/").lower() == headers.get("host", "").lower()


def starting(api: bool) -> Response:
    if api:
        return JSONResponse({"detail": "The server is starting. Try again in a few seconds."}, status_code=503)
    page = """<!doctype html><html lang="en"><head><meta charset="utf-8"><meta http-equiv="refresh" content="4">
<meta name="viewport" content="width=device-width, initial-scale=1"><title>Starting · OpenClothingSearch</title>
<style>:root{color-scheme:light dark;font-family:ui-sans-serif,system-ui,sans-serif}body{min-height:100vh;margin:0;display:grid;place-items:center}</style>
</head><body><p>Starting the search server. This page reloads by itself.</p></body></html>"""
    return HTMLResponse(page, status_code=503, headers={"Cache-Control": "no-store"})


async def forward(request: Request) -> Response:
    headers = [(k, v) for k, v in request.headers.raw if k.decode("latin-1").lower() not in HOP]
    url = UPSTREAM + request.url.path + (f"?{request.url.query}" if request.url.query else "")
    replayable = request.method in ("GET", "HEAD")
    deadline = time.monotonic() + (WAKE_SECONDS if replayable else 0)
    while True:
        body = None if replayable else request.stream()
        req = client().build_request(request.method, url, headers=headers, content=body)
        try:
            resp = await client().send(req, stream=True)
        except (httpx.ConnectError, httpx.ConnectTimeout, httpx.RemoteProtocolError):
            resp = None
        # Fly's proxy answers 502-504 while the app machine starts. Requests with a body
        # cannot be sent twice, so only GET and HEAD wait.
        if resp is not None and resp.status_code not in (502, 503, 504):
            break
        if resp is not None:
            await resp.aclose()
        if time.monotonic() >= deadline:
            return starting(request.url.path.startswith("/api/"))
        await asyncio.sleep(1.5)

    async def stream():
        try:
            async for chunk in resp.aiter_raw():
                yield chunk
        finally:
            await resp.aclose()

    out = StreamingResponse(stream(), status_code=resp.status_code)
    out.raw_headers = [(k, v) for k, v in resp.headers.raw if k.decode("latin-1").lower() not in HOP]
    return out


async def app(scope, receive, send) -> None:
    if scope["type"] != "http":
        return  # the app uses no websockets
    request = Request(scope, receive)
    headers = {k.lower(): v for k, v in request.headers.items()}
    path = request.url.path
    if request.method not in ("GET", "HEAD", "OPTIONS") and not _same_origin(headers):
        resp: Response = PlainTextResponse("This app only accepts requests from its own pages.", 403)
    elif path in ("/icon.svg", "/favicon.ico") and ICON:
        resp = FileResponse(ICON, media_type="image/svg+xml")
    elif path == "/login" and request.method == "POST":
        raw = await request.body()
        form = parse_qs(raw[:MAX_FORM].decode("utf-8", "replace"))
        resp = await auth.submit(scope, headers, form.get("password", [""])[0], form.get("next", ["/"])[0])
    elif path == "/login":
        resp = auth.login_page(auth.safe_next(request.query_params.get("next")))
    elif path == "/api/auth/logout" and request.method == "POST":
        resp = auth.logout_response()
    elif not auth.session_ok(headers):
        if path.startswith("/api/"):
            resp = JSONResponse({"detail": "Log in first."}, status_code=401)
        else:
            target = path + (f"?{request.url.query}" if request.url.query else "")
            resp = RedirectResponse(f"/login?next={quote(target, safe='')}", status_code=303)
    else:
        resp = await forward(request)
    await resp(scope, receive, send)


def main() -> None:
    if not settings.password or not UPSTREAM:
        sys.exit("The gate needs FINDER_PASSWORD and FINDER_UPSTREAM (the app's private address).")
    if not settings.session_secret:
        print("Warning: without FINDER_SESSION_SECRET, the app asks for the password a second time.", file=sys.stderr)
    port = int(os.environ.get("PORT", "8080"))
    uvicorn.run(app, host=os.environ.get("GATE_HOST", "0.0.0.0"), port=port, proxy_headers=True, forwarded_allow_ips="*", lifespan="off")


if __name__ == "__main__":
    main()
