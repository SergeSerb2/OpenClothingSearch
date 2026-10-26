"""One shared, persistent Chrome profile for every site that needs a browser.

Logins (Taobao, 1688, Google) are saved in data/browser-profile, so the
user logs in once in a visible window, and later searches reuse the
cookies. Searches run in a real Chrome window that stays minimized:
Taobao and 1688 show a slider check to headless browsers.
"""

from __future__ import annotations

import asyncio
import logging
import os
import sys
import time
from contextlib import asynccontextmanager

from fastapi import HTTPException
from patchright.async_api import BrowserContext, Page, async_playwright

from .config import DATA_DIR, settings

log = logging.getLogger(__name__)
PROFILE = DATA_DIR / "browser-profile"
PAGES = 4  # search tabs open at once
DISPLAY_ERROR = "Login needs a visible browser window. Start the app in a desktop session with a display, then try Log in again."

LOGIN_PAGES = {
    "taobao": "https://login.taobao.com/",
    "1688": "https://login.1688.com/",
    "weidian": "https://sso.weidian.com/login/index.php",
    "google": "https://accounts.google.com/",
}

# Cookie names that only exist after a successful login.
LOGIN_COOKIES = {
    "taobao": ("taobao.com", {"unb", "lgc", "tracknick"}),
    "1688": ("1688.com", {"__cn_logon__", "unb"}),
    "weidian": ("weidian.com", {"wduss", "is_login"}),
    "google": ("google.com", {"SID", "__Secure-1PSID"}),
}


class BrowserManager:
    def __init__(self) -> None:
        self._pw = None
        self._ctx: BrowserContext | None = None
        self._mode = ""
        self._lock = asyncio.Lock()
        self._login_lock = asyncio.Lock()
        self._pages = asyncio.Semaphore(PAGES)
        self.login_site: str | None = None
        self._active = 0  # tabs in use
        self._last_used = time.monotonic()
        self._idle_task: asyncio.Task | None = None

    async def _launch(self, mode: str, *, interactive: bool = False) -> BrowserContext:
        """mode: "minimized", "visible" or "hidden" (see Settings.browser_mode)."""
        if mode != "hidden" and sys.platform.startswith("linux") and not (os.environ.get("DISPLAY") or os.environ.get("WAYLAND_DISPLAY")):
            if interactive:
                raise HTTPException(400, DISPLAY_ERROR)
            log.warning("no screen for a browser window; searching with a hidden browser (Taobao may block it)")
            mode = "hidden"
        if self._pw is None:
            self._pw = await async_playwright().start()
        headful = mode != "hidden"
        args = ["--disable-blink-features=AutomationControlled"]
        if mode == "minimized":
            # Chrome slows down windows it thinks nobody sees; keep full speed.
            args += [
                "--disable-backgrounding-occluded-windows",
                "--disable-renderer-backgrounding",
                "--disable-background-timer-throttling",
                "--window-size=1366,900",
            ]
        options = dict(
            headless=not headful,
            no_viewport=headful,
            viewport=None if headful else {"width": 1366, "height": 900},
            locale="zh-CN",
            args=args,
        )
        # Google Chrome passes the sites' bot checks best.
        for channel in ("chrome", None):
            try:
                ctx = await self._pw.chromium.launch_persistent_context(str(PROFILE), channel=channel, **options)
            except Exception as exc:  # noqa: BLE001
                text = str(exc)
                if headful and ("DISPLAY" in text or "X server" in text):
                    if interactive:
                        raise HTTPException(400, DISPLAY_ERROR) from None
                    log.warning("no screen for a browser window; searching with a hidden browser (Taobao may block it)")
                    return await self._launch("hidden")
                if "not found" not in text and "doesn't exist" not in text:
                    raise
                if channel == "chrome":
                    log.warning("Google Chrome is not installed; trying the bundled Chromium")
                    continue
                raise RuntimeError(
                    "No browser for Taobao and 1688 searches. Install Google Chrome, "
                    "or run: cd server && uv run patchright install chromium"
                ) from exc
            break
        self._mode = mode
        ctx.on("close", lambda _: self._context_closed(ctx))
        for page in ctx.pages:
            await self._minimize(ctx, page)
        self._watch_idle()
        return ctx

    def _watch_idle(self) -> None:
        if settings.browser_idle_minutes > 0 and (self._idle_task is None or self._idle_task.done()):
            self._idle_task = asyncio.create_task(self._close_when_idle())

    def _idle(self, limit: float) -> bool:
        return (
            self._ctx is not None
            and not self._active
            and self.login_site is None
            and time.monotonic() - self._last_used >= limit
        )

    async def _close_when_idle(self) -> None:
        """Close Chrome after a quiet period. The next search or status check starts it again.

        A running Chrome keeps calling Google services in the background. Hosts that put
        idle apps to sleep (for example Railway) count that traffic, so the app never sleeps.
        """
        limit = settings.browser_idle_minutes * 60
        while True:
            await asyncio.sleep(min(30.0, limit))
            if not self._idle(limit):
                continue
            async with self._lock:
                if not self._idle(limit):
                    continue
                ctx, self._ctx = self._ctx, None
                self._mode = ""
            log.info("closing the browser after %g idle minutes", settings.browser_idle_minutes)
            try:
                await ctx.close()
            except Exception:  # noqa: BLE001 - it may already be gone
                pass

    def _context_closed(self, ctx: BrowserContext) -> None:
        if self._ctx is ctx:
            self._ctx = None
            self._mode = ""
            self.login_site = None

    async def _minimize(self, ctx: BrowserContext, page: Page) -> None:
        if self._mode != "minimized":
            return
        try:
            cdp = await ctx.new_cdp_session(page)
            window = await cdp.send("Browser.getWindowForTarget")
            await cdp.send("Browser.setWindowBounds", {"windowId": window["windowId"], "bounds": {"windowState": "minimized"}})
            await cdp.detach()
        except Exception as exc:  # noqa: BLE001 - a visible window still works
            log.debug("could not minimize the browser window: %s", exc)

    async def context(self) -> BrowserContext:
        async with self._lock:
            self._last_used = time.monotonic()
            if self._ctx is None:
                self._ctx = await self._launch(settings.browser_mode)
            return self._ctx

    @asynccontextmanager
    async def page(self):
        """A fresh tab in the shared profile. Closed on exit."""
        async with self._pages:
            ctx = await self.context()
            self._active += 1  # no await since context(): the idle closer cannot run in between
            try:
                page: Page = await ctx.new_page()
                try:
                    await self._minimize(ctx, page)  # a new tab can bring the window back
                    yield page
                finally:
                    await page.close()
            finally:
                self._active -= 1
                self._last_used = time.monotonic()

    async def _restart(self, mode: str, *, interactive: bool = False) -> BrowserContext:
        # Let running search tabs finish (up to 30 s) and keep new ones out while restarting.
        held = 0
        try:
            try:
                async with asyncio.timeout(30):
                    while held < PAGES:
                        await self._pages.acquire()
                        held += 1
            except TimeoutError:
                log.info("restarting the browser while %d search tabs are still open", PAGES - held)
            return await self._relaunch(mode, interactive=interactive)
        finally:
            for _ in range(held):
                self._pages.release()

    async def _relaunch(self, mode: str, *, interactive: bool = False) -> BrowserContext:
        async with self._lock:
            old, self._ctx = self._ctx, None
            self.login_site = None
            if old is not None:
                try:
                    await old.close()
                except Exception:  # noqa: BLE001
                    pass
            self._ctx = await self._launch(mode, interactive=interactive)
            return self._ctx

    async def open_login(self, site: str) -> None:
        """Reopen the profile in a visible window on the site's login page."""
        async with self._login_lock:
            if sys.platform.startswith("linux") and not (os.environ.get("DISPLAY") or os.environ.get("WAYLAND_DISPLAY")):
                raise HTTPException(400, DISPLAY_ERROR)
            ctx = await self._restart("visible", interactive=True)
            # Set first: if the page loads slowly, the window is still open and needs a Done button.
            self.login_site = site
            page = ctx.pages[0] if ctx.pages else await ctx.new_page()
            try:
                await page.goto(LOGIN_PAGES[site])
            except Exception as exc:  # noqa: BLE001 - the user can still log in in the open window
                log.warning("login page for %s loaded slowly: %s", site, exc)

    async def finish_login(self) -> None:
        """Close the visible window and go back to the normal (minimized) mode."""
        async with self._login_lock:
            self.login_site = None
            await self._restart(settings.browser_mode)

    async def logged_in(self) -> dict[str, bool]:
        ctx = await self.context()
        cookies = await ctx.cookies()
        status = {}
        for site, (domain, names) in LOGIN_COOKIES.items():
            status[site] = any(
                c["name"] in names and c["domain"].lstrip(".").endswith(domain) and c["value"]
                for c in cookies
            )
        return status

    async def close(self) -> None:
        if self._idle_task is not None:
            self._idle_task.cancel()
            self._idle_task = None
        ctx, self._ctx = self._ctx, None
        self.login_site = None
        if ctx is not None:
            await ctx.close()
        if self._pw is not None:
            await self._pw.stop()
            self._pw = None


browser = BrowserManager()
