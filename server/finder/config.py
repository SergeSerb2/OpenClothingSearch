"""Settings from the project-root .env file and the environment.

A value in .env wins over the same variable in the shell environment, so changes saved
from the web app's Settings take effect. settings.reload() reads .env again.
"""

from __future__ import annotations

import os
import re
import threading
from pathlib import Path

from dotenv import dotenv_values

from .providers import PRESETS

ROOT = Path(__file__).resolve().parents[2]
DATA_DIR = ROOT / "data"
# FINDER_ENV_FILE puts the settings file elsewhere, for example on a cloud host's disk.
ENV_FILE = Path(os.environ.get("FINDER_ENV_FILE") or ROOT / ".env")
_PROCESS_ENV = dict(os.environ)  # before .env is applied below

# Variables the web app may write to .env.
EDITABLE = {
    "LLM_PROVIDER", "LLM_BASE_URL", "LLM_API_KEY", "LLM_MODEL", "LLM_VISION",
    "SERPER_API_KEY", "SERPAPI_API_KEY", "APIFY_TOKEN", "QUALITLY_API_KEY",
}


_SINGLE = re.compile(r"^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*'", re.M)
_EMPTY = re.compile(r"""^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(?:""|'')\s*$""", re.M)


def _file_values() -> dict[str, str]:
    """Values set in .env. A quoted empty value (NAME="") is kept: it hides the shell's value."""
    if not ENV_FILE.exists():
        return {}
    text = ENV_FILE.read_text(encoding="utf-8")
    expanded = dotenv_values(ENV_FILE, encoding="utf-8")
    literal = dotenv_values(ENV_FILE, encoding="utf-8", interpolate=False)
    # ${VAR} references work as usual, except in single quotes: the app writes keys that way,
    # so a key that contains "$" is kept as typed.
    single = set(_SINGLE.findall(text))
    values = {}
    for name, value in expanded.items():
        value = literal[name] if name in single else value
        if value and value.strip():
            values[name] = value.strip()
    for name in _EMPTY.findall(text):
        values.setdefault(name, "")
    return values


# Other libraries (for example HF_TOKEN for model downloads) read os.environ directly.
for _name, _value in _file_values().items():
    if _value:
        os.environ.setdefault(_name, _value)


class Settings:
    def __init__(self) -> None:
        self.reload()

    def reload(self) -> None:
        self._file = _file_values()
        values = {**{k: v.strip() for k, v in _PROCESS_ENV.items()}, **self._file}

        def get(name: str, default: str = "") -> str:
            return values.get(name) or default

        self.llm_provider = get("LLM_PROVIDER", "custom")
        preset = PRESETS.get(self.llm_provider, PRESETS["custom"])
        self.llm_base_url = get("LLM_BASE_URL", preset["base_url"]).rstrip("/")
        self.llm_api_key = get("LLM_API_KEY")
        self.llm_model = get("LLM_MODEL", preset["model"])
        # "auto": use photos with the AI until the model refuses them; "off": never send photos.
        self.llm_vision = get("LLM_VISION", "auto").lower()
        self.llm_timeout = _number(get("LLM_TIMEOUT"), 1.0)  # multiplier for slow local models
        self.serper_key = get("SERPER_API_KEY")
        self.serpapi_key = get("SERPAPI_API_KEY")
        self.qualitly_key = get("QUALITLY_API_KEY")
        self.apify_token = get("APIFY_TOKEN")
        self.embed_model = get("EMBED_MODEL", "hf-hub:Marqo/marqo-ecommerce-embeddings-B")
        # How the automation browser runs: "minimized" (a real window kept minimized),
        # "visible", or "hidden" (headless). Taobao and 1688 show a slider check to
        # hidden browsers, so minimized is the default.
        mode = get("BROWSER_MODE", "visible" if get("BROWSER_HEADFUL") == "1" else "minimized").lower()
        self.browser_mode = mode if mode in ("minimized", "visible", "hidden") else "minimized"
        # Close the browser after this many idle minutes; it restarts when needed. 0 keeps it open.
        idle = get("FINDER_BROWSER_IDLE_MINUTES", "5").strip()
        self.browser_idle_minutes = 0.0 if idle == "0" else _number(idle, 5)
        self.host = get("FINDER_HOST", "127.0.0.1")
        # Extra host names the app answers to, for example a LAN name when FINDER_HOST=0.0.0.0.
        self.allowed_hosts = {h.strip().lower() for h in get("FINDER_ALLOWED_HOSTS").split(",") if h.strip()}
        # Password for remote access. FINDER_AUTH=all also asks on 127.0.0.1 (for cloud hosts).
        self.password = get("FINDER_PASSWORD")
        self.auth_mode = get("FINDER_AUTH", "remote").lower()
        # Signs login cookies. Set the same value on the app and its gate (see gate.py).
        self.session_secret = get("FINDER_SESSION_SECRET")
        self.port = int(_number(get("FINDER_PORT"), 8790))

    def from_environment(self, name: str) -> bool:
        """True when a variable's value comes from the shell environment, not from .env."""
        return name not in self._file and bool(_PROCESS_ENV.get(name, "").strip())

    @property
    def headful(self) -> bool:
        return self.browser_mode != "hidden"

    @property
    def llm_enabled(self) -> bool:
        # Local servers (Ollama, LM Studio) need no key.
        return bool(self.llm_base_url and self.llm_model)


def _number(value: str, default: float) -> float:
    try:
        number = float(value)
    except ValueError:
        return default
    return number if number > 0 else default


_LINE = re.compile(r"^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=")
_write_lock = threading.Lock()


def update_env(changes: dict[str, str | None]) -> None:
    """Set (or, with None or "", remove) variables in .env, keep the rest of the file, and reload.

    Removing a variable that the shell environment also sets writes NAME="", so the
    shell's value is not used either (it could be a key for another provider).
    """
    for name, value in changes.items():
        if name not in EDITABLE:
            raise ValueError(f"{name} cannot be changed from the app")
        if value and ("\n" in value or "\r" in value):
            raise ValueError(f"{name} has a line break")
    wanted = {
        name: _quote(value) if value else ('""' if _PROCESS_ENV.get(name, "").strip() else None)
        for name, value in changes.items()
    }
    with _write_lock:
        lines = ENV_FILE.read_text(encoding="utf-8").splitlines() if ENV_FILE.exists() else []
        out, done = [], set()
        for line in lines:
            match = _LINE.match(line)
            name = match.group(1) if match else None
            if name in wanted:
                if name not in done and wanted[name] is not None:
                    out.append(f"{name}={wanted[name]}")
                done.add(name)
                continue
            out.append(line)
        for name, value in wanted.items():
            if name not in done and value is not None:
                out.append(f"{name}={value}")
        tmp = ENV_FILE.with_name(f".env.{os.getpid()}.{threading.get_ident()}.tmp")
        tmp.write_text("\n".join(out) + "\n", encoding="utf-8")
        os.chmod(tmp, 0o600)
        tmp.replace(ENV_FILE)
        settings.reload()


def _quote(value: str) -> str:
    value = value.strip()
    if re.fullmatch(r"[A-Za-z0-9_./:@+\-]*", value):
        return value
    if "'" not in value:
        return f"'{value}'"  # single quotes: read without ${VAR} expansion (see _file_values)
    return '"' + value.replace("\\", "\\\\").replace('"', '\\"') + '"'


settings = Settings()
DATA_DIR.mkdir(exist_ok=True)
(DATA_DIR / "cache").mkdir(exist_ok=True)
(DATA_DIR / "uploads").mkdir(exist_ok=True)
