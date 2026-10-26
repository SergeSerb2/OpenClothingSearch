"""AI provider presets. Every provider is reached through its OpenAI-compatible API.

Model names change often. The Settings page lists the models the provider reports,
so these defaults are only a starting point.
"""

from __future__ import annotations

PRESETS: dict[str, dict] = {
    "openai": {
        "name": "OpenAI",
        "base_url": "https://api.openai.com/v1",
        "model": "gpt-5-mini",
        "needs_key": True,
        "key_url": "https://platform.openai.com/api-keys",
        "note": "Paid, pay per use. Good at photos and Chinese.",
    },
    "gemini": {
        "name": "Google Gemini",
        "base_url": "https://generativelanguage.googleapis.com/v1beta/openai",
        "model": "gemini-flash-latest",
        "needs_key": True,
        "key_url": "https://aistudio.google.com/apikey",
        "note": "Has a free tier. Good at photos and Chinese.",
    },
    "anthropic": {
        "name": "Anthropic Claude",
        "base_url": "https://api.anthropic.com/v1",
        "model": "claude-haiku-5-5",
        "needs_key": True,
        "key_url": "https://console.anthropic.com/settings/keys",
        "note": "Paid, pay per use. Good at photos and Chinese.",
    },
    "openrouter": {
        "name": "OpenRouter",
        "base_url": "https://openrouter.ai/api/v1",
        "model": "google/gemini-2.5-flash",
        "needs_key": True,
        "key_url": "https://openrouter.ai/keys",
        "note": "One key for models from many companies.",
    },
    "ollama": {
        "name": "Ollama (on this computer)",
        "base_url": "http://localhost:11434/v1",
        "model": "qwen2.5vl:7b",
        "needs_key": False,
        "key_url": "https://ollama.com/download",
        "note": "Free and private. Install Ollama, then run: ollama pull qwen2.5vl:7b",
    },
    "lmstudio": {
        "name": "LM Studio (on this computer)",
        "base_url": "http://localhost:1234/v1",
        "model": "",
        "needs_key": False,
        "key_url": "https://lmstudio.ai",
        "note": "Free and private. Load a vision model and start the local server.",
    },
    "deepseek": {
        "name": "DeepSeek",
        "base_url": "https://api.deepseek.com/v1",
        "model": "deepseek-chat",
        "needs_key": True,
        "key_url": "https://platform.deepseek.com/api_keys",
        "note": "Cheap and very good at Chinese, but cannot read photos.",
    },
    "custom": {
        "name": "Other (OpenAI-compatible)",
        "base_url": "",
        "model": "",
        "needs_key": False,
        "key_url": "",
        "note": "Any OpenAI-compatible endpoint: LiteLLM, vLLM, Groq, Together, Azure, CLIProxyAPI…",
    },
}


def public() -> list[dict]:
    return [{"id": pid, **preset} for pid, preset in PRESETS.items()]
