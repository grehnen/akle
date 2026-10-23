// bun run headers:check (after `vite build`)
// Checks the built static assets against the caching policy in public/_headers: hashed assets
// are immutable and index.html is no-cache.
import { readdir } from "node:fs/promises";
import { cacheViolations } from "./deploy/staticHeaders";

const assetsDirectory = new URL(
  "../.cloudflare/output/v0/workers/default/assets/",
  import.meta.url,
);

const builtFiles = await readdir(assetsDirectory, { recursive: true, withFileTypes: true });
const files = builtFiles
  .filter((entry) => entry.isFile())
  .map((entry) =>
    `${entry.parentPath}/${entry.name}`.slice(decodeURIComponent(assetsDirectory.pathname).length),
  );
const headersFile = Bun.file(new URL("_headers", assetsDirectory));
if (!(await headersFile.exists())) {
  console.error("Static headers check failed: the build has no _headers file. Run `vite build`.");
  process.exit(1);
}
const violations = cacheViolations(await headersFile.text(), files);

if (violations.length > 0) {
  console.error(`Static headers check failed (${violations.length}):`);
  for (const violation of violations) console.error(`- ${violation}`);
  process.exit(1);
}
console.log(`Static headers check passed (${files.length} built files).`);
