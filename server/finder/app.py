"""HTTP API. Run with: uv run finder (from server/)."""

from __future__ import annotations

import asyncio
import json
import logging
from contextlib import asynccontextmanager
from typing import Annotated, Literal
from urllib.parse import urlsplit

from fastapi import FastAPI, File, Form, HTTPException, Request, UploadFile
from fastapi.responses import FileResponse, PlainTextResponse, RedirectResponse, Response
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field, StringConstraints
from sse_starlette.sse import EventSourceResponse

from . import auth, catalog, embed, images, llm, profile, providers, rates, stylist, translate
from .browser import LOGIN_PAGES, browser
from .config import ROOT, settings, update_env
from .pipeline import Job, history
from .secrets import RedactFilter
from .sources import yupoo

log = logging.getLogger(__name__)
JOBS: dict[str, Job] = {}
_running: set[asyncio.Task] = set()


@asynccontextmanager
async def lifespan(_: FastAPI):
    # Load the image model in the background so the first search is fast.
    warm = asyncio.create_task(embed.warm_up())
    yield
    warm.cancel()
    await browser.close()


app = FastAPI(title="finder", lifespan=lifespan)

LOOPBACK = {"localhost", "127.0.0.1", "::1"}
DEV_PORTS = {5173, 4173}  # the Vite dev and preview servers, which proxy /api to this server
MAX_UPLOAD = 15 * 1024 * 1024
KEY_NAMES = {"serper": "SERPER_API_KEY", "serpapi": "SERPAPI_API_KEY", "apify": "APIFY_TOKEN", "qualitly": "QUALITLY_API_KEY"}


def _hostname(netloc: str) -> str:
    try:
        return (urlsplit(f"//{netloc.strip()}").hostname or "").lower()
    except ValueError:
        return ""


def _origin_ok(origin: str, host: str) -> bool:
    """Same origin as the request (scheme default ports), or the local Vite dev server."""
    try:
        o, h = urlsplit(origin), urlsplit(f"//{host.strip()}")
        o_port = o.port or (443 if o.scheme == "https" else 80)
        # Behind a proxy or tunnel (https://finder.example.com) the Host header has no port.
        h_port = h.port or o_port
    except ValueError:
        return False
    if not o.hostname or o.scheme not in ("http", "https"):
        return False
    if (o.hostname.lower(), o_port) == ((h.hostname or "").lower(), h_port):
        return True
    return o.hostname.lower() in LOOPBACK and o_port in DEV_PORTS


def _capped(receive, limit: int):
    """Stop reading a request body that grows past `limit` bytes (no Content-Length needed)."""
    seen = 0

    async def wrapped():
        nonlocal seen
        message = await receive()
        if message["type"] == "http.request":
            seen += len(message.get("body", b""))
            if seen > limit:
                raise HTTPException(413, "The photo is larger than 15 MB.")
        return message

    return wrapped


class LocalOnly:
    """Refuse requests that a web page on another site could send to this local server.

    The Host check stops DNS rebinding; the Origin check stops cross-site POST/PUT requests,
    also from pages of other apps on this computer (localhost with another port).
    The app has no login, so it must only take orders from pages it serves itself.
    """

    def __init__(self, app) -> None:
        self.app = app

    async def __call__(self, scope, receive, send) -> None:
        if scope["type"] == "http":
            headers = {k.decode("latin-1").lower(): v.decode("latin-1") for k, v in scope["headers"]}
            allowed = LOOPBACK | settings.allowed_hosts
            bad = _hostname(headers.get("host", "")) not in allowed
            origin = headers.get("origin")
            if not bad and origin is not None and scope.get("method") not in ("GET", "HEAD", "OPTIONS"):
                bad = not _origin_ok(origin, headers.get("host", ""))
            if bad:
                await PlainTextResponse("This app only accepts requests from its own pages.", 403)(scope, receive, send)
                return
            if scope.get("path") == "/api/upload":
                limit = MAX_UPLOAD + 64 * 1024  # room for the multipart headers
                length = headers.get("content-length", "")
                if length.isdigit() and int(length) > limit:
                    await PlainTextResponse("The photo is larger than 15 MB.", 413)(scope, receive, send)
                    return
                receive = _capped(receive, limit)
        await self.app(scope, receive, send)


app.add_middleware(auth.RequireLogin)
app.add_middleware(LocalOnly)  # added last, so it runs first


ImageKey = Annotated[str, StringConstraints(pattern=r"^[0-9a-f]{40}$")]


class SearchBody(BaseModel):
    query: str = Field("", max_length=300)
    upload_keys: list[ImageKey] = Field([], max_length=8)
    sources: list[Literal["taobao", "1688", "weidian", "yupoo"]] | None = None
    options: dict = {}


class LookBody(BaseModel):
    upload_key: ImageKey


class SuggestBody(BaseModel):
    anchor: dict | None = None
    styles: list[str] = []
    notes: str = ""
    count: int = 6


class TranslateBody(BaseModel):
    texts: list[str]


class AiBody(BaseModel):
    provider: str
    base_url: str
    model: str = ""
    api_key: str | None = None  # None keeps the saved key, but only for the same base URL
    vision: str = "auto"


class KeysBody(BaseModel):
    # None keeps a key; "" removes it.
    serper: str | None = None
    serpapi: str | None = None
    apify: str | None = None
    qualitly: str | None = None


class RefsBody(BaseModel):
    selected: list[str]


class StoresBody(BaseModel):
    stores: list[str]


def get_job(job_id: str) -> Job:
    job = JOBS.get(job_id) or Job.load(job_id)
    if job is None:
        raise HTTPException(404, "search not found")
    JOBS[job.id] = job
    return job


async def status() -> dict:
    try:
        logins = await browser.logged_in()
    except Exception as exc:  # noqa: BLE001
        log.warning("browser unavailable: %s", exc)
        logins = {site: False for site in LOGIN_PAGES}
    return {
        "llm": settings.llm_enabled,
        "keys": {
            "serper": bool(settings.serper_key),
            "serpapi": bool(settings.serpapi_key),
            "qualitly": bool(settings.qualitly_key),
            "apify": bool(settings.apify_token),
        },
        "ai": {
            "provider": settings.llm_provider,
            "base_url": settings.llm_base_url,
            "model": settings.llm_model,
            "key_set": bool(settings.llm_api_key),
            "key_env": settings.from_environment("LLM_API_KEY"),
            "vision": llm.vision_enabled(),
            "vision_setting": settings.llm_vision,
        },
        "providers": providers.public(),
        "auth": auth.in_session.get(),  # this request needed the password (show Log out)
        # Keys set in the shell environment; removing them in the app has no effect.
        "keys_env": {k: settings.from_environment(name) for k, name in KEY_NAMES.items()},
        "logins": logins,
        "login_open": browser.login_site,
        "yupoo_stores": yupoo.load_stores(),
        "profile": profile.load(),
    }


@app.get("/login")
async def login_form(next: str = "/"):
    if not settings.password:
        return RedirectResponse("/", status_code=303)
    return auth.login_page(auth.safe_next(next))


@app.post("/login")
async def login_submit(request: Request, password: str = Form(""), next: str = Form("/")):
    if not settings.password:
        return RedirectResponse("/", status_code=303)
    headers = {k.lower(): v for k, v in request.headers.items()}
    return await auth.submit(request.scope, headers, password, next)


@app.post("/api/auth/logout")
async def logout():
    return auth.logout_response()


@app.get("/api/status")
async def get_status():
    return await status()


def _check_url(url: str) -> str:
    url = url.strip().rstrip("/")
    try:
        parts = urlsplit(url)
        parts.port  # noqa: B018 - raises for a bad port
    except ValueError:
        parts = None
    if (
        not parts
        or parts.scheme not in ("http", "https")
        or not parts.hostname
        or parts.query
        or parts.fragment
        or any(c.isspace() for c in url)
        or len(url) > 300
    ):
        raise HTTPException(400, "The base URL must look like https://example.com/v1")
    return url


def _key_for(body: AiBody, url: str) -> str:
    if body.api_key is not None:
        return body.api_key.strip()
    # A saved key is only sent to the address it was saved for.
    return settings.llm_api_key if url == settings.llm_base_url else ""


@app.post("/api/ai/test")
async def ai_test(body: AiBody):
    url = _check_url(body.base_url)
    return await llm.test_connection(url, _key_for(body, url), body.model.strip())


@app.put("/api/ai")
async def ai_save(body: AiBody):
    if body.provider not in providers.PRESETS:
        raise HTTPException(400, "unknown provider")
    if body.vision not in ("auto", "off"):
        raise HTTPException(400, "vision must be auto or off")
    url = _check_url(body.base_url)
    changes: dict[str, str | None] = {
        "LLM_PROVIDER": body.provider,
        "LLM_BASE_URL": url,
        "LLM_MODEL": body.model.strip(),
        "LLM_VISION": None if body.vision == "auto" else body.vision,
    }
    if body.api_key is not None or url != settings.llm_base_url:
        changes["LLM_API_KEY"] = _key_for(body, url)
    try:
        await asyncio.to_thread(update_env, changes)
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc
    return await status()


@app.put("/api/keys")
async def put_keys(body: KeysBody):
    changes = {KEY_NAMES[k]: v.strip() for k, v in body.model_dump().items() if v is not None}
    try:
        await asyncio.to_thread(update_env, changes)
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc
    return await status()


@app.post("/api/upload")
async def upload(file: UploadFile = File(...)):
    raw = await file.read(MAX_UPLOAD + 1)
    if len(raw) > MAX_UPLOAD:
        raise HTTPException(413, "The photo is larger than 15 MB.")
    try:
        key = await asyncio.to_thread(images.store_bytes, raw, file.filename or "")
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(400, "This file is not a photo the app can read. Use JPEG, PNG, WebP or HEIC.") from exc
    return {"key": key}


@app.post("/api/search")
async def start_search(body: SearchBody):
    options = catalog.clean_options(body.options)
    if not body.query.strip() and not body.upload_keys and not catalog.has_subject(options):
        raise HTTPException(400, "Type an item name, add a photo, or pick a category, brand or style")
    job = Job(body.query, body.upload_keys, body.sources, options)
    JOBS[job.id] = job
    task = asyncio.create_task(job.run())
    _running.add(task)
    task.add_done_callback(_running.discard)
    return {"id": job.id}


@app.get("/api/search/{job_id}")
async def get_search(job_id: str):
    return get_job(job_id).snapshot()


@app.get("/api/search/{job_id}/events")
async def search_events(job_id: str):
    job = get_job(job_id)

    async def stream():
        # Subscribe inside the generator, so its finally always unsubscribes.
        queue = job.subscribe()
        try:
            while True:
                event, data = await queue.get()
                if event == "end":
                    break
                yield {"event": event, "data": json.dumps(data, ensure_ascii=False)}
        finally:
            job.unsubscribe(queue)

    return EventSourceResponse(stream(), ping=15)


@app.post("/api/search/{job_id}/references")
async def set_references(job_id: str, body: RefsBody):
    job = get_job(job_id)
    if job.status == "running":
        raise HTTPException(409, "wait for the search to finish")
    if not body.selected:
        raise HTTPException(400, "select at least one reference photo")
    if not set(body.selected) <= {r.key for r in job.references}:
        raise HTTPException(400, "unknown reference photo")
    try:
        await job.rescore(body.selected)
    except ValueError as exc:  # no usable photo in the selection
        raise HTTPException(400, str(exc)) from exc
    return job.snapshot()


@app.get("/api/catalog")
async def get_catalog():
    return catalog.load()


@app.get("/api/profile")
async def get_profile():
    return profile.load()


@app.put("/api/profile")
async def put_profile(body: dict):
    return profile.save(body)


@app.post("/api/look")
async def find_look(body: LookBody):
    if not body.upload_key.isalnum():
        raise HTTPException(400, "bad photo key")
    try:
        result = await stylist.look(body.upload_key)
    except LookupError as exc:
        raise HTTPException(404, str(exc)) from exc
    except llm.ProviderError as exc:
        raise HTTPException(502, str(exc)) from exc
    except Exception as exc:  # noqa: BLE001
        log.warning("look failed: %s", exc)
        raise HTTPException(502, "The AI could not read the outfit in this photo. Try another photo.") from exc
    return result  # items is [] when the photo shows no clothing


@app.post("/api/suggest")
async def post_suggest(body: SuggestBody):
    anchor = ""
    if body.anchor:
        if body.anchor.get("search_id"):
            job = get_job(str(body.anchor["search_id"]))
            summary = (job.queries or {}).get("summary") or ""
            anchor = f"{job.query}" + (f" ({summary})" if summary and summary != job.query else "")
        else:
            anchor = str(body.anchor.get("query") or "").strip()[:200]
    try:
        return await stylist.suggest(body.model_dump(), anchor)
    except llm.ProviderError as exc:
        raise HTTPException(502, str(exc)) from exc
    except Exception as exc:  # noqa: BLE001
        log.warning("suggest failed: %s", exc)
        raise HTTPException(502, "The AI stylist did not answer. Try again.") from exc


@app.post("/api/translate")
async def post_translate(body: TranslateBody):
    if len(body.texts) > 100:
        raise HTTPException(400, "send at most 100 texts at a time")
    return {"translations": await translate.english(body.texts)}


@app.get("/api/rates")
async def get_rates():
    return await rates.get()


@app.get("/api/history")
async def get_history():
    return history({job.id for job in JOBS.values() if job.status == "running"})


@app.get("/api/img/{key}")
async def get_image(key: str):
    if not key.isalnum():
        raise HTTPException(400)
    data = images.read(key)
    if data is None:
        raise HTTPException(404)
    return Response(data, media_type="image/jpeg", headers={"Cache-Control": "public, max-age=31536000, immutable"})


@app.post("/api/login/done")
async def login_done():
    await browser.finish_login()
    return await status()


@app.post("/api/login/{site}")
async def login(site: str):
    if site not in LOGIN_PAGES:
        raise HTTPException(404, "unknown site")
    await browser.open_login(site)
    return await status()


@app.put("/api/yupoo-stores")
async def put_stores(body: StoresBody):
    yupoo.save_stores(body.stores)
    return await status()


# Serve the built web app when it exists (pnpm --dir web build).
DIST = ROOT / "web" / "dist"
if DIST.exists():
    app.mount("/assets", StaticFiles(directory=DIST / "assets"), name="assets")

    @app.get("/{path:path}")
    async def spa(path: str):
        if path == "api" or path.startswith("api/"):
            raise HTTPException(404, "unknown API route")
        target = DIST / path
        if path and target.is_file() and DIST in target.resolve().parents:
            return FileResponse(target)
        return FileResponse(DIST / "index.html")


def main() -> None:
    import uvicorn

    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
    for handler in logging.getLogger().handlers:
        handler.addFilter(RedactFilter())  # no API keys in the log
    for noisy in ("httpx", "huggingface_hub", "root"):
        logging.getLogger(noisy).setLevel(logging.WARNING)
    if settings.host not in LOOPBACK and not settings.password:
        log.warning("FINDER_HOST=%s with no FINDER_PASSWORD: anyone who can reach this address can use the app", settings.host)
    log.info("open http://127.0.0.1:%d in your browser", settings.port)
    uvicorn.run("finder.app:app", host=settings.host, port=settings.port, log_level="info")
