# Contributing

Thanks for helping. Bug reports, fixes and new sources are welcome.

## Development setup

```sh
scripts/dev.sh        # backend on :8790 and the Vite dev server on :5173 with hot reload
```

Open http://localhost:5173 (the port must be free: the backend only accepts writes from
pages on ports 5173 and 4173, so Vite will not move to another port). Add `?mock=1` to the
URL to use the built-in fake backend:
it needs no logins, keys or AI, and it replays realistic searches (see `web/src/dev/`).

## Checks

```sh
cd web && pnpm build            # typecheck (tsrs) and production build
cd server && uvx ruff check finder
```

There is no unit-test suite. Test changes end to end: run the real app (or mock mode for
UI work) and try the flows you changed, including an empty or failing case.

## Guidelines

- The backend API contract is `docs/API.md`. Change it when you change a route or a field,
  and keep the mock backend (`web/src/dev/mockApi.ts`) in step.
- Never log or return API keys. Send keys in headers, never in URLs.
- Be gentle with the marketplaces: no tight loops, no parallel hammering. Taobao and 1688
  block accounts that search too fast.
- AI calls go through `server/finder/llm.py`, which handles differences between providers.
  Do not call provider SDKs directly.
- Keep user-facing text short and plain.
