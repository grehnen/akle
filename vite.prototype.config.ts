// PROTOTYPE (D3): the app's Vite config with its own dep cache, so this dev server never rewrites
// the cache another dev server (sharing node_modules) uses. Never merge to main.
import { mergeConfig } from "vite";
import base from "./vite.config.ts";

export default mergeConfig(base, { cacheDir: ".cache/vite-prototype" });
