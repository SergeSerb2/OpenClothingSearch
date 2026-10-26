import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import type { Api } from "./api/client";
import { realApi } from "./api/client";
import { ApiContext } from "./api/context";
import "./styles.css";

async function boot() {
  const mock = new URLSearchParams(location.search).get("mock") === "1";
  // The mock and its fixture are only loaded with ?mock=1.
  const api: Api = mock ? (await import("./dev/mockApi")).mockApi : realApi;
  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <ApiContext.Provider value={api}>
        <App />
      </ApiContext.Provider>
    </StrictMode>,
  );
}

void boot();
