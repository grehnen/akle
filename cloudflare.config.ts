import { defineConfig } from "cf/config";
import { SITE_URL } from "./src/siteUrl.ts";

// One assets-only Worker: production on SITE_URL, one Preview per same-repo PR on workers.dev.
export default defineConfig({
  worker: {
    name: "akle",
    compatibilityDate: "2026-10-23",
    domains: [new URL(SITE_URL).hostname],
  },
});
