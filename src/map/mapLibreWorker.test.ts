import { describe, expect, test } from "bun:test";
import { fileURLToPath } from "node:url";
import { build, loadConfigFromFile, type PluginOption, type Rollup } from "vite";

// The Cloudflare plugin loads cloudflare.config.ts, which only works on Node, so this Bun test
// builds with the rest of vite.config.ts. The plugin doesn't change the client bundle.
function withoutCloudflarePlugin(plugins: PluginOption[]): PluginOption[] {
  return plugins.map((plugin) => {
    if (Array.isArray(plugin)) return withoutCloudflarePlugin(plugin);
    const isCloudflare =
      typeof plugin === "object" &&
      plugin !== null &&
      "name" in plugin &&
      plugin.name.startsWith("vite-plugin-cloudflare");
    return isCloudflare ? false : plugin;
  });
}

// MapLibre finds its worker at runtime, next to its own module. Bundled, that module is a hashed
// chunk in assets/, so unless the app hands MapLibre the worker's URL, the map never loads.
describe("the production build", () => {
  test("ships MapLibre's worker and points MapLibre at it", async () => {
    const root = fileURLToPath(new URL("../..", import.meta.url));
    const { config } = (await loadConfigFromFile(
      { command: "build", mode: "production" },
      undefined,
      root,
    ))!;
    const result = await build({
      ...config,
      configFile: false,
      root,
      logLevel: "silent",
      plugins: withoutCloudflarePlugin(config.plugins ?? []),
      build: { ...config.build, write: false },
    });
    const output = (Array.isArray(result) ? result : [result]).flatMap(
      (bundle) => (bundle as Rollup.RollupOutput).output,
    );

    const worker = output.find((file) => /maplibre-gl-worker.*\.mjs$/.test(file.fileName));
    expect(worker?.fileName).toBeDefined();
    const referencesWorker = output.some(
      (file) => file.type === "chunk" && file.code.includes(worker!.fileName.split("/").pop()!),
    );
    expect(referencesWorker).toBe(true);
  }, 60_000);
});
