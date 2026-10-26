"""Image embeddings with Marqo's e-commerce CLIP model on Apple's GPU."""

from __future__ import annotations

import asyncio
import hashlib
import logging
import tempfile
import threading
from importlib.metadata import version
from pathlib import Path

import numpy as np

from . import images
from .config import DATA_DIR, settings

log = logging.getLogger(__name__)

_lock = threading.Lock()
_model = None
_preprocess = None
_device = "cpu"
_identity = f"{settings.embed_model}|{version('open-clip-torch')}|rgb-open-clip-transforms-v1"
_cache_dir = DATA_DIR / "cache" / "emb" / hashlib.sha256(_identity.encode()).hexdigest()[:20]
_cache_dir.mkdir(parents=True, exist_ok=True)


def _cached(key: str) -> np.ndarray | None:
    try:
        images.path_for(key)  # cache keys use the same validation as images
    except ValueError:
        return None
    path = _cache_dir / f"{key}.npy"
    try:
        vec = np.load(path, allow_pickle=False)
        if vec.ndim == 1 and vec.size and np.issubdtype(vec.dtype, np.floating) and np.isfinite(vec).all():
            return vec
    except (OSError, ValueError, EOFError):
        pass
    try:
        path.unlink(missing_ok=True)
    except OSError:
        pass
    return None


def _save(key: str, vec: np.ndarray) -> None:
    temp = None
    try:
        with tempfile.NamedTemporaryFile(dir=_cache_dir, suffix=".tmp", delete=False) as tmp:
            temp = Path(tmp.name)
            np.save(tmp, vec, allow_pickle=False)
        temp.replace(_cache_dir / f"{key}.npy")
    finally:
        if temp is not None:
            temp.unlink(missing_ok=True)


def _load():
    global _model, _preprocess, _device
    if _model is not None:
        return
    import open_clip
    import torch

    if torch.cuda.is_available():
        _device = "cuda"
    elif torch.backends.mps.is_available():
        _device = "mps"  # Apple Silicon GPU
    else:
        _device = "cpu"
    model, _, preprocess = open_clip.create_model_and_transforms(settings.embed_model)
    _model = model.to(_device).eval()
    _preprocess = preprocess
    log.info("embedding model %s on %s", settings.embed_model, _device)


def _embed_sync(keys: list[str]) -> dict[str, np.ndarray]:
    import io

    import torch
    from PIL import Image

    out: dict[str, np.ndarray] = {}
    todo: list[str] = []
    for key in keys:
        vec = _cached(key)
        if vec is not None:
            out[key] = vec
        else:
            todo.append(key)
    if not todo:
        return out
    with _lock:
        _load()
        for start in range(0, len(todo), 64):
            batch_keys, tensors = [], []
            for key in todo[start : start + 64]:
                raw = images.read(key)
                if raw is None:
                    continue
                try:
                    tensors.append(_preprocess(Image.open(io.BytesIO(raw)).convert("RGB")))
                    batch_keys.append(key)
                except Exception:  # noqa: BLE001
                    continue
            if not tensors:
                continue
            with torch.no_grad():
                vecs = _model.encode_image(torch.stack(tensors).to(_device))
                vecs = vecs / vecs.norm(dim=-1, keepdim=True)
                arr = vecs.float().cpu().numpy()
            for key, vec in zip(batch_keys, arr):
                try:
                    _save(key, vec)
                except OSError as exc:
                    log.debug("embedding cache write failed: %s", exc)
                out[key] = vec
    return out


def cached(keys: list[str]) -> dict[str, np.ndarray]:
    """Embeddings already on disk; never runs the model."""
    out = {}
    for key in keys:
        vec = _cached(key)
        if vec is not None:
            out[key] = vec
    return out


async def embed(keys: list[str]) -> dict[str, np.ndarray]:
    return await asyncio.to_thread(_embed_sync, list(dict.fromkeys(keys)))


def _load_locked() -> None:
    with _lock:
        _load()


async def warm_up() -> None:
    await asyncio.to_thread(_load_locked)
