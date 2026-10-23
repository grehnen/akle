import { defineConfig } from "cf/config";

// One assets-only Worker: production on akle.grehn.net, one Preview per same-repo PR on workers.dev.
export default defineConfig({
  worker: {
    name: "akle",
    compatibilityDate: "2026-10-23",
    domains: ["akle.grehn.net"],
  },
});
