import { describe, expect, test } from "bun:test";
import { fileURLToPath } from "node:url";
import { build, type Rollup } from "vite";

// MapLibre finds its worker at runtime, next to its own module. Bundled, that module is a hashed
// chunk in assets/, so unless the app hands MapLibre the worker's URL, the map never loads.
describe("the production build", () => {
  test("ships MapLibre's worker and points MapLibre at it", async () => {
    const result = await build({
      root: fileURLToPath(new URL("../..", import.meta.url)),
      logLevel: "silent",
      build: { write: false },
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
