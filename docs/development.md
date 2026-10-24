# Development and operations

Domain terms are in [GLOSSARY.md](../GLOSSARY.md), decisions in [adr/](adr/), and the committed data in [data/README.md](../data/README.md).

## Development

Needs the Bun version in `package.json` and the Node version in `.node-version`: the Cloudflare Vite plugin and the `cf` CLI load `cloudflare.config.ts` with Node, because it can't load on Bun.

```sh
bun install
bun run dev      # Vite dev server
bun run check    # every required check, as CI runs them
```

## Deployment

Åkle is one Cloudflare Worker, `akle`, that serves static assets only. [`cloudflare.config.ts`](../cloudflare.config.ts) configures it, and the [`cf` CLI](https://developers.cloudflare.com/cf/) builds and deploys it. `vite build` writes the Worker's Build Output to `.cloudflare/output/`. [`public/_headers`](../public/_headers) sets the caching: hashed files under `/assets/` (graph version data included) are `immutable`, and `index.html` is `no-cache`. `bun run headers:check` checks the build against it.

[CI](../.github/workflows/ci.yml) runs the required checks on every PR and every push to `main`, then:

- **Production:** a push to `main` deploys the build that passed the checks to `akle.grehn.net`. Production deploys run one at a time, in order, and are never cancelled. A deploy is skipped when `main` has already moved on, so a slow older run can't roll production back.
- **Previews:** every PR from a branch in this repo gets a public Workers Preview named `pr-<number>` on `workers.dev`, linked from the PR as a deployment to the `preview` environment. `workers.dev` sends `X-Robots-Tag: noindex`, and `_headers` adds it too. [Preview cleanup](../.github/workflows/preview-cleanup.yml) deletes the preview when the PR closes.
- **Schedule extension:** a [quarterly workflow](../.github/workflows/schedule-extension.yml), also runnable by hand (with a dry-run option) from the Actions tab, opens or updates the PR that extends the schedule when fewer than 2 years (730 days) of trips are left, and turns on its auto-merge under 1 year (365 days). The required runway check fails under 100 days, blocking other PRs until the extension merges. See [data/README.md](../data/README.md#runway-bun-run-runwaycheck-and-bun-run-scheduleextend).
- **Forks:** PRs from forks run the checks only. They get no preview and no secrets, and no workflow uses `pull_request_target`. Dependabot PRs deliberately get no preview either: they get no environment secrets, and their checks still run.

## Rollback

**By default, revert the commit** (`git revert`, through a PR) and let the pipeline deploy `main` again. This keeps `main` and production the same.

**Instant rollback is for emergencies only**, when production is broken and a revert would take too long. Find the last good version (each deploy is tagged with its short commit SHA), then deploy it:

```sh
bunx cf workers versions list --worker-id akle
bunx cf workers deployments create --worker akle --strategy percentage \
  --versions '[{"version_id":"<VERSION_ID>","percentage":100}]'
```

The Cloudflare dashboard (Workers → `akle` → Deployments) can do the same. Then revert or fix the commit on `main`, because the next push to `main` deploys over the rollback.

**Never roll back across a graph version already in effect.** If a graph version has started (today's trip number has reached its `startsAtTrip`, see [ADR 0004](adr/0004-versioned-graphs-keyed-by-trip-number.md)), never deploy a build from before that version was added: the trips that use it would break. Revert or fix forward instead.
