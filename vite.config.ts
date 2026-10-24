import { cloudflare } from "@cloudflare/vite-plugin";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react(), cloudflare()],
  // MapLibre ships a prebuilt bundle with its own web worker; pre-bundling it breaks the worker.
  optimizeDeps: { exclude: ["maplibre-gl"] },
  // MapLibre (~1.1 MB) is code-split and loaded only when the map mounts.
  build: {
    chunkSizeWarningLimit: 1200,
    // Each page is built for real, so /fri never relies on a fallback to index.html.
    rollupOptions: { input: ["index.html", "fri.html"] },
  },
});
