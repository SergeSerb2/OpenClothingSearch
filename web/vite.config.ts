import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const BACKEND = "http://127.0.0.1:8790";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true, // the backend only accepts writes from this port (see LocalOnly in app.py)
    proxy: {
      // SSE goes through this proxy too; Vite's proxy streams responses as they arrive.
      "/api": { target: BACKEND, changeOrigin: true },
    },
  },
  preview: {
    port: 4173,
    strictPort: true,
    proxy: {
      "/api": { target: BACKEND, changeOrigin: true },
    },
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
});
