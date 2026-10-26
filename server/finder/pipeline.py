"""One search job: queries -> reference photos -> sources -> ranking -> AI check."""

from __future__ import annotations

import asyncio
import json
import logging
import tempfile
import time
import uuid
from pathlib import Path

import numpy as np

from . import catalog, embed, images, llm, profile, ranking, reference
from .browser import browser
from .config import DATA_DIR, settings
from .models import Blocked, Listing, NeedsLogin, RefImage, SourceStatus
from .secrets import redact, safe_error
from .sources import alibaba1688, apify, google, links, qualitly, taobao, weidian, yupoo
from .sources.base import SearchContext, Task

log = logging.getLogger(__name__)
SEARCH_DIR = DATA_DIR / "searches"
SEARCH_DIR.mkdir(exist_ok=True)
TASK_TIMEOUT = 120
VERIFY_TOP = 24
VERIFY_BATCH = 8
VERIFY_ROUNDS = 3
ALBUMS_TO_OPEN = 16
INTERRUPTED = "The server stopped during this search. Search again."
# At most this many searches run at once; the rest wait. A board of several
# items would otherwise hit Taobao with many pages together (slider checks).
SLOTS = asyncio.Semaphore(2)
CODE_ALBUMS_TO_OPEN = 8
SUBSCRIBER_BACKLOG = 32
_running_jobs: dict[str, Job] = {}


class Job:
    def __init__(
        self, query: str, upload_keys: list[str], sources: list[str] | None, options: dict | None = None
    ) -> None:
        self.id = uuid.uuid4().hex[:10]
        self.query = query.strip()
        self.upload_keys = upload_keys
        self.options = catalog.clean_options(options)
        self.mode = self.options["mode"]
        # Yupoo stores list branded products, so they only help for an exact product
        # or a picked brand; generic and "alternatives" searches skip them unless asked.
        yupoo_useful = self.mode == "exact" or bool(self.options.get("brands"))
        default = ["taobao", "1688", "weidian"] + (["yupoo"] if yupoo_useful else [])
        self.wanted = set(sources or default)
        self.ref_query = self.query  # what the reference photos and the AI check look for
        self.created = int(time.time())
        self.status = "running"
        self.stage = "queries"
        self.error: str | None = None
        self.queries: dict | None = None
        self.ref_provider: str | None = None
        self.references: list[RefImage] = []
        self.sources: list[SourceStatus] = []
        self.listings: dict[str, Listing] = {}
        self.groups: list[dict] = []
        self._subscribers: list[asyncio.Queue] = []
        self._pending: list[Listing] = []
        self._new = asyncio.Event()
        self._dirty = False
        self._searching = True
        self._ref_vecs: np.ndarray | None = None
        self._rescore_lock = asyncio.Lock()
        self._verdicts: dict[frozenset, dict[str, tuple]] = {}  # AI verdicts per reference selection
        self._started = time.monotonic()

    # ---------- events ----------

    def snapshot(self) -> dict:
        listings = sorted(self.listings.values(), key=lambda l: -l.score)
        return {
            "id": self.id,
            "query": self.query,
            "created": self.created,
            "status": self.status,
            "stage": self.stage,
            "error": self.error,
            "queries": self.queries,
            "ref_provider": self.ref_provider,
            "references": [r.to_json() for r in self.references],
            "sources": [s.to_json() for s in self.sources],
            "listings": [l.to_json() for l in listings if ranking.photo_key(l)],
            "groups": self.groups,
            "upload_keys": self.upload_keys,
            "options": self.options,
        }

    def subscribe(self) -> asyncio.Queue:
        queue: asyncio.Queue = asyncio.Queue(maxsize=SUBSCRIBER_BACKLOG)
        queue.put_nowait(("snapshot", self.snapshot()))
        if self.status != "running":
            queue.put_nowait(("end", None))
        else:
            self._subscribers.append(queue)
        return queue

    def unsubscribe(self, queue: asyncio.Queue) -> None:
        if queue in self._subscribers:
            self._subscribers.remove(queue)

    def publish(self, event: str, data) -> None:
        for queue in self._subscribers[:]:
            if queue.full():
                while not queue.empty():
                    queue.get_nowait()
                queue.put_nowait(("snapshot", self.snapshot()))
                if event == "end":
                    queue.put_nowait((event, data))
                continue
            queue.put_nowait((event, data))
        if event == "end":
            self._subscribers.clear()

    def set_stage(self, stage: str, message: str = "") -> None:
        self.stage = stage
        self.publish("stage", {"stage": stage, "message": message})

    def update_source(self, status: SourceStatus) -> None:
        self.publish("source", status.to_json())

    def publish_results(self) -> None:
        snap = self.snapshot()
        self.publish("results", {"listings": snap["listings"], "groups": snap["groups"]})
        self._dirty = False

    # ---------- run ----------

    async def run(self) -> None:
        _running_jobs[self.id] = self
        try:
            self.save()  # so the search shows in the history while it runs
            if SLOTS.locked():
                self.set_stage("queries", "Waiting for other searches to finish")
            async with SLOTS:
                self._started = time.monotonic()
                await self._run()
            self.status = "done"
            self.set_stage("done")
            self.save()
            self.publish("done", {"elapsed_ms": int((time.monotonic() - self._started) * 1000)})
        except asyncio.CancelledError:
            self.status, self.error = "error", INTERRUPTED
            self.publish("error", {"message": self.error})
            raise
        except Exception as exc:  # noqa: BLE001
            log.exception("search %s failed", self.id)  # the log filter removes keys from tracebacks
            self.status = "error"
            self.error = safe_error(exc)
            self.publish("error", {"message": self.error})
        finally:
            try:
                if self.status == "error":
                    self.save()
            except Exception as exc:  # noqa: BLE001
                log.error("saving search %s failed: %s", self.id, safe_error(exc))
            finally:
                self.publish("end", None)
                _running_jobs.pop(self.id, None)

    def _set_query(self, query: str) -> None:
        if query != self.query:
            self.query = query
            self.publish("snapshot", self.snapshot())

    async def _run(self) -> None:
        uploads = [RefImage(key=k, url="upload", title="Your photo") for k in self.upload_keys if images.read(k)]
        if not self.query and uploads:
            self.set_stage("queries", "Identifying the product in your photo")
            self.ref_query = await llm.identify_product(images.read(uploads[0].key) or b"")
            self._set_query(self.ref_query)
        if not self.query and not uploads and not catalog.has_subject(self.options):
            raise RuntimeError("Type an item name, add a photo, or pick a category, brand or style")

        self.set_stage("queries", "Writing seller search terms")
        options_text = catalog.describe_options({k: v for k, v in self.options.items() if k != "mode"})
        expand = None
        if self.query or options_text:
            expand = asyncio.create_task(
                llm.expand_query(self.query, self.mode, options_text, profile.describe(profile.load()))
            )
        empty = {"zh": [], "en": [], "codes": [], "category": "", "summary": "", "avoid": [], "size_tip": ""}
        if options_text and expand and not (self.mode == "alternatives" and self.query):
            # The options change what the item looks like, so the reference photos
            # wait for the AI's image query (it merges the name and the options).
            # "Alternatives" with a name keeps the photos of the original item: its look is the goal.
            self.queries = await expand
            self.ref_query = (self.queries["en"] or [self.query or catalog.image_query(self.options)])[0]
            # A short title such as "grey hoodie"; the AI's summary line is in queries.summary.
            self._set_query(self.query or catalog.image_query(self.options) or self.ref_query)
            self.publish("queries", self.queries)
            await self._find_references(uploads)
        else:
            refs_task = asyncio.create_task(self._find_references(uploads))
            self.queries = await expand if expand else empty
            self.publish("queries", self.queries)
            await refs_task
        if self.mode == "alternatives":
            # Copies of the branded item look the most similar; rank them below real alternatives.
            extra = catalog.brand_words(self.query, self.options.get("brands")) + catalog.COPY_MARKERS
            self.queries["avoid"] = list(dict.fromkeys(self.queries.get("avoid", []) + extra))
            self.publish("queries", self.queries)
        if not self.query and not uploads:
            raise RuntimeError("Type an item name, add a photo, or pick a category, brand or style")
        if not any(r.selected for r in self.references):
            raise RuntimeError("No usable reference photo was found. Add a photo of the item.")

        self.set_stage("searching", "Searching marketplaces")
        ctx = SearchContext(
            query=self.query,
            zh=self.queries["zh"],
            en=self.queries["en"],
            codes=self.queries["codes"],
            refs=[r for r in self.references if r.selected],
            wanted=self.wanted,
        )
        # The AI could not name the photo: search by photo only, under a display name.
        self._set_query(self.query or "Photo search")
        tasks = await self._tasks(ctx)
        self.sources = [t.status for t in tasks]
        for status in self.sources:
            self.update_source(status)
        scorer = asyncio.create_task(self._scorer())
        await asyncio.gather(*(self._run_task(t, ctx) for t in tasks if t.run))
        self._searching = False
        self._new.set()
        await scorer

        self.set_stage("ranking", "Opening the best Yupoo albums")
        await self._open_albums()
        await self._drain()
        self._rank()
        self.publish_results()

        self.set_stage("verifying", "AI is checking the top matches")
        await self._verify()
        self._rank()
        self.publish_results()

    async def _find_references(self, uploads: list[RefImage]) -> None:
        self.set_stage("references", "Finding reference photos")
        web: list[RefImage] = []
        if self.ref_query:
            try:
                web, self.ref_provider = await reference.find_references(self.ref_query)
            except Exception as exc:  # noqa: BLE001
                log.warning("reference search failed: %s", safe_error(exc))
        if web and not uploads:
            keep = await llm.filter_references(self.ref_query, [images.read(r.key) or b"" for r in web], self.mode)
            # When the AI rejects every photo, keep the photos' own agreement instead.
            if keep is not None and len(keep) == len(web) and any(keep):
                for ref, ok in zip(web, keep):
                    ref.selected = ok
        if uploads:
            # The user's photo is the ground truth; web photos only help if they match it.
            vecs = await embed.embed([r.key for r in uploads + web])
            usable = [r for r in uploads if r.key in vecs]
            if not usable:
                raise RuntimeError("Your uploaded photos could not be used. Add another photo of the item.")
            uploads = usable
            up = np.stack([vecs[r.key] for r in uploads])
            for ref in web:
                sim = float((up @ vecs[ref.key]).max()) if ref.key in vecs else 0.0
                ref.consensus = round(sim, 3)
                ref.selected = sim >= 0.86
            for ref in uploads:
                ref.consensus = 1.0
        self.references = uploads + sorted(web, key=lambda r: (not r.selected, -r.consensus))
        self.publish("references", {"provider": self.ref_provider or "upload", "references": [r.to_json() for r in self.references]})
        await self._load_ref_vecs()

    async def _load_ref_vecs(self) -> None:
        selected = [r.key for r in self.references if r.selected]
        vecs = await embed.embed(selected)
        self._ref_vecs = np.stack([vecs[k] for k in selected if k in vecs]) if vecs else None

    async def _tasks(self, ctx: SearchContext) -> list[Task]:
        try:
            logins = await browser.logged_in()
        except Exception as exc:  # noqa: BLE001
            log.warning("browser unavailable: %s", safe_error(exc))
            logins = {}
        tasks: list[Task] = []
        photo = bool(settings.apify_token)
        if "taobao" in self.wanted:
            tasks += taobao.tasks(ctx, logins.get("taobao", False))
        if "1688" in self.wanted:
            tasks += alibaba1688.tasks(ctx, logins.get("1688", False) or logins.get("taobao", False), photo)
        # 1688 photo search (about $0.015 per search, capped at $0.05).
        tasks += apify.tasks(ctx, self.wanted)
        if "weidian" in self.wanted:
            tasks += qualitly.tasks(ctx)
        if "yupoo" in self.wanted:
            tasks += yupoo.tasks(ctx)
        if self.wanted & {"yupoo", "weidian"}:
            tasks += google.tasks(ctx)  # Lens and site: search find Yupoo and Weidian pages
        return tasks

    async def _run_task(self, task: Task, ctx: SearchContext) -> None:
        status = task.status
        status.state = "running"
        self.update_source(status)

        async def emit(found: list[Listing]) -> None:
            added = self.add(found)
            status.count += added
            self.update_source(status)

        try:
            assert task.run is not None
            await asyncio.wait_for(task.run(ctx, emit), TASK_TIMEOUT)
            status.state = "done"
            if not status.count and not status.message:
                status.message = "No results"
        except NeedsLogin as exc:
            status.state = "needs_login"
            status.message = safe_error(exc)
        except Blocked as exc:
            # A slider check: the user solves it in the login window, like a login.
            status.state = "needs_login"
            status.message = safe_error(exc)
        except asyncio.TimeoutError:
            status.state = "error" if not status.count else "done"
            status.message = "Timed out"
        except Exception as exc:  # noqa: BLE001
            log.warning("%s/%s/%s failed: %s", status.source, status.method, status.provider, safe_error(exc))
            status.state = "error"
            status.message = safe_error(exc)[:160]
        self.update_source(status)

    # ---------- listings ----------

    def add(self, found: list[Listing]) -> int:
        added = 0
        for item in found:
            if not item.image_url and not item.image_key and not item.extra_keys:
                continue
            if item.source not in self.wanted:
                continue  # for example Google found a Yupoo page, but Yupoo is not selected
            existing = self.listings.get(item.id)
            if existing:
                photos = (existing.image_url, existing.image_key, tuple(existing._image_urls), tuple(existing.extra_keys))
                title = existing.title
                existing.merge(item)
                existing.official = ranking.is_official(existing)
                changed = photos != (existing.image_url, existing.image_key, tuple(existing._image_urls), tuple(existing.extra_keys))
                if title != existing.title:
                    self._text_signals(existing)
                if changed or title != existing.title:
                    existing.verdict, existing.verdict_note, existing.branded = None, "", False
                if changed and existing not in self._pending:
                    self._pending.append(existing)
                    self._new.set()
                self._dirty = True
                continue
            item.official = ranking.is_official(item)
            self.listings[item.id] = item
            self._pending.append(item)
            added += 1
        if added:
            self._new.set()
        return added

    async def _scorer(self) -> None:
        """Download, embed and score new listings in batches while sources run."""
        last_publish = 0.0
        while self._searching or self._pending:
            await self._new.wait()
            self._new.clear()
            if self._searching:
                await asyncio.sleep(0.3)  # let a burst of results arrive together
            await self._score_pending()
            if time.monotonic() - last_publish > 1.0 or not self._pending:
                self._rank()
                self.publish_results()
                last_publish = time.monotonic()

    async def _drain(self) -> None:
        while self._pending:
            await self._score_pending()

    async def _score_pending(self) -> None:
        batch, self._pending = self._pending, []
        if not batch:
            return
        async def download(listing: Listing) -> None:
            urls = list(dict.fromkeys(u for u in [listing.image_url, *listing._image_urls] if u))
            keys = [k for k in await asyncio.gather(*(images.fetch(u) for u in urls)) if k]
            listing.image_key = listing.image_key or (keys[0] if keys else None)
            listing.extra_keys += [k for k in dict.fromkeys(keys) if k != listing.image_key and k not in listing.extra_keys]

        await asyncio.gather(*(download(l) for l in batch))
        await self._score(batch)

    def _text_signals(self, listing: Listing) -> None:
        q = self.queries or {}
        queries = list(q.get("zh", [])) + list(q.get("en", [])) + [self.query]
        listing.text_score = ranking.text_score(listing.title, queries, q.get("codes", []))
        listing.avoid_hit = ranking.avoid_hit(listing.title, q.get("avoid", []))

    async def _score(self, batch: list[Listing]) -> None:
        if self._ref_vecs is None or not len(self._ref_vecs):
            return
        keys = [k for l in batch for k in [l.image_key, *l.extra_keys] if k]
        vecs = await embed.embed(keys)
        for listing in batch:
            self._text_signals(listing)
            own = [k for k in [listing.image_key, *listing.extra_keys] if k and k in vecs]
            if not own:
                continue
            per_photo = ranking.image_scores(np.stack([vecs[k] for k in own]), self._ref_vecs)
            best = int(per_photo.argmax())
            listing.image_score = round(float(per_photo[best]), 4)
            listing.match_key = own[best]
            listing.image_key = listing.image_key or listing.match_key
        self._dirty = True

    def _rank(self) -> None:
        for listing in self.listings.values():
            listing.score = ranking.score(listing)
            listing.tier = ranking.tier(listing.image_score, listing.verdict, self.mode)
        if self.mode == "alternatives":
            ranking.price_bonus(list(self.listings.values()))
        live = [l for l in self.listings.values() if ranking.photo_key(l)]
        vecs = embed.cached([ranking.photo_key(l) for l in live])
        self.groups = ranking.group(live, vecs)

    async def _open_albums(self) -> None:
        """Read the best Yupoo albums: more photos, and the seller's buy links."""
        yupoo_albums = [l for l in self.listings.values() if l.source == "yupoo"]
        albums = sorted(
            (l for l in yupoo_albums if ranking.tier(l.image_score, l.verdict, self.mode) != "weak"), key=lambda l: -l.image_score
        )[:ALBUMS_TO_OPEN]
        # The title names the style code but the cover photo is poor (box, size chart).
        albums += sorted(
            (l for l in yupoo_albums if l.text_score >= 1.0 and l not in albums), key=lambda l: -l.image_score
        )[:CODE_ALBUMS_TO_OPEN]
        if not albums:
            return

        async def one(album: Listing) -> None:
            try:
                photos, outbound = await yupoo.fetch_album(album)
            except Exception as exc:  # noqa: BLE001
                log.debug("album %s failed: %s", redact(album.url), safe_error(exc))
                return
            keys = await asyncio.gather(*(images.fetch(p) for p in photos[:6]))
            # Keep photos that other sources found for this album too.
            album.extra_keys = [k for k in dict.fromkeys([*album.extra_keys, *keys]) if k and k != album.image_key]
            classified = [c for url in outbound if (c := links.classify(url))]
            linked = await weidian.resolve_links(
                [url for source, _, url in classified if source == "weidian"],
                "store", "yupoo-link", album.image_url, album.title,
            )
            for source, native_id, url in classified:
                if source in {"taobao", "1688"}:
                    linked.append(Listing(
                        source=source, native_id=native_id, url=url, title=album.title,
                        image_url=album.image_url, found_by={"store"}, via={"yupoo-link"},
                    ))
            album_photos = [k for k in [album.image_key, *album.extra_keys] if k]
            for item in linked:
                item.shop = item.shop or album.shop
                if not item.title:
                    item.title = album.title
                # Score the buy link with the album photos: it often shows a generic photo.
                item.extra_keys = [k for k in album_photos if k != item.image_key]
                item.albums = [album.id]
            self.add(linked)

        await asyncio.gather(*(one(a) for a in albums))
        await self._score(albums)

    async def _verify(self) -> None:
        refs = [images.read(r.key) for r in self.references if r.selected][:2]
        refs = [r for r in refs if r]
        if not refs:
            return

        async def run(batch: list[Listing]) -> dict:
            items = [(l.id, images.read(l.match_key or l.image_key or "") or b"", l.title) for l in batch]
            subject = self.ref_query or "the item in the reference photos"
            return await llm.verify_matches(subject, refs, [i for i in items if i[1]], self.mode)

        # A "variant" verdict moves a listing down, so unchecked listings move up
        # into the top groups. Check again until the top groups all have a verdict.
        for _ in range(VERIFY_ROUNDS):
            # One listing per group, best first: the AI check then covers more products.
            top = []
            eligible = [g for g in self.groups if self.listings[g["best_id"]].tier != "weak"]
            for grp in eligible[:VERIFY_TOP]:
                listing = self.listings.get(grp["best_id"])
                if self.mode == "alternatives":
                    # Branding can differ per seller (logo, title): check a few members of each group.
                    members = sorted(
                        (self.listings[i] for i in grp["listing_ids"] if self.listings[i].verdict is None and self.listings[i].tier != "weak"),
                        key=lambda l: -l.score,
                    )
                    top.extend(members[:3])
                elif listing and listing.verdict is None:
                    top.append(listing)
            top = top[:VERIFY_TOP]
            if not top:
                return
            batches = [top[i : i + VERIFY_BATCH] for i in range(0, len(top), VERIFY_BATCH)]
            checked = 0
            for result in await asyncio.gather(*(run(b) for b in batches)):
                for listing_id, verdict in result.items():
                    listing = self.listings[listing_id]
                    listing.verdict = verdict["verdict"]
                    listing.verdict_note = verdict["note"]
                    listing.branded = verdict.get("branded", False)
                    checked += 1
                    self._share_verdict(listing)
            self._rank()
            self.publish_results()
            if not checked:
                return  # the AI is unavailable or failed; do not retry the same batch

    def _share_verdict(self, checked: Listing) -> None:
        """Copy a verdict to group members whose best photo is nearly the same picture.

        Members that joined by style code or as a buy link may show another
        colorway, so they keep their own (unchecked) state.
        """
        if self.mode == "alternatives":
            return  # branding may come from a title: verify each member independently
        key = checked.match_key or checked.image_key
        others = [l for l in self.listings.values() if l.group == checked.group and l.verdict is None]
        vecs = embed.cached([k for k in [key, *(o.match_key or o.image_key for o in others)] if k])
        if key not in vecs:
            return
        for other in others:
            other_key = other.match_key or other.image_key
            if other_key in vecs and float(vecs[key] @ vecs[other_key]) >= ranking.GROUP_SIM:
                other.verdict = checked.verdict
                other.verdict_note = checked.verdict_note

    async def rescore(self, selected: list[str]) -> None:
        async with self._rescore_lock:
            chosen = set(selected)
            if not chosen or chosen - {r.key for r in self.references}:
                raise ValueError("select known reference photos")
            vecs = await embed.embed([r.key for r in self.references if r.key in chosen])
            usable = [vecs[r.key] for r in self.references if r.key in chosen and r.key in vecs]
            if not usable:
                raise ValueError("select at least one usable reference photo")
            self._ref_vecs = np.stack(usable)
            before = frozenset(r.key for r in self.references if r.selected)
            if chosen == before:
                return
            for ref in self.references:
                ref.selected = ref.key in chosen
            # The AI checked against the old photos; those verdicts no longer apply. Keep them,
            # so going back to that selection (a photo off, then on again) restores them.
            self._verdicts[before] = {
                l.id: (l.verdict, l.verdict_note, l.branded) for l in self.listings.values() if l.verdict
            }
            saved = self._verdicts.get(frozenset(chosen), {})
            for listing in self.listings.values():
                listing.verdict, listing.verdict_note, listing.branded = saved.get(listing.id, (None, "", False))
            await self._score(list(self.listings.values()))
            self._rank()
            self.save()

    # ---------- storage ----------

    def save(self) -> None:
        data = self.snapshot()
        data["listings"] = [l.to_json() for l in self.listings.values()]
        temp = None
        try:
            with tempfile.NamedTemporaryFile(mode="w", encoding="utf-8", dir=SEARCH_DIR, suffix=".tmp", delete=False) as tmp:
                temp = Path(tmp.name)
                tmp.write(json.dumps(data, ensure_ascii=False))
            temp.replace(SEARCH_DIR / f"{self.id}.json")
        finally:
            if temp is not None:
                temp.unlink(missing_ok=True)

    @classmethod
    def load(cls, job_id: str) -> "Job | None":
        path = SEARCH_DIR / f"{job_id}.json"
        if not job_id.isalnum():
            return None
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
            job = cls(data["query"], data.get("upload_keys", []), None, data.get("options"))
            job.id = data["id"]
            job.created = data["created"]
            job.status = data["status"]
            job.stage = data["stage"]
            job.error = data.get("error")
            if job.status == "running":  # the server stopped during the search
                job.status, job.error = "error", INTERRUPTED
            job.queries = data.get("queries")
            job.ref_provider = data.get("ref_provider")
            job.references = [RefImage(**r) for r in data.get("references", [])]
            job.sources = [SourceStatus(**s) for s in data.get("sources", [])]
            fields = set(Listing.__dataclass_fields__)
            for row in data.get("listings", []):
                row = {k: v for k, v in row.items() if k in fields}
                row["found_by"] = set(row.get("found_by", []))
                row["via"] = set(row.get("via", []))
                listing = Listing(**row)
                job.listings[listing.id] = listing
            job.groups = data.get("groups", [])
            return job
        except (OSError, ValueError, KeyError, TypeError, AttributeError):
            return None


_history_rows: dict[Path, tuple[float, dict]] = {}  # file -> (mtime, row): parse each file once


def _history_row(data: dict) -> dict:
    refs = [r for r in data.get("references", []) if r.get("selected")]
    return {
        "id": data["id"],
        "query": data["query"],
        "summary": (data.get("queries") or {}).get("summary") or "",
        "options": data.get("options") or {},
        "created": float(data["created"]),
        "status": data["status"],
        # Like the snapshot: only listings with a photo are shown.
        "count": sum(1 for l in data.get("listings", []) if l.get("match_key") or l.get("image_key")),
        "thumb_key": refs[0]["key"] if refs else None,
    }


def history(running: set[str], limit: int = 50) -> list[dict]:
    """Saved searches, newest first. running: ids of searches that are still running."""
    rows: dict[str, dict] = {}
    paths = set(SEARCH_DIR.glob("*.json"))
    for path in list(_history_rows):
        if path not in paths:
            del _history_rows[path]
    for path in paths:
        try:
            mtime = path.stat().st_mtime
            cached = _history_rows.get(path)
            if not cached or cached[0] != mtime:
                cached = _history_rows[path] = (mtime, _history_row(json.loads(path.read_text(encoding="utf-8"))))
            rows[cached[1]["id"]] = dict(cached[1])
        except (OSError, ValueError, KeyError, TypeError, AttributeError):
            continue
    for job_id, job in _running_jobs.items():
        if job_id in running:
            rows[job_id] = _history_row(job.snapshot())
    for row in rows.values():
        if row["status"] == "running" and row["id"] not in running:
            row["status"] = "error"  # the server stopped during the search
    return sorted(rows.values(), key=lambda row: -row["created"])[:limit]
