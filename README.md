# Åkle

A daily puzzle about Swedish kommuner, live at [akle.grehn.net](https://akle.grehn.net). Domain terms are in [GLOSSARY.md](GLOSSARY.md), decisions in [docs/adr/](docs/adr/), and the committed data in [data/README.md](data/README.md).

## Development

Needs the Bun version in `package.json` and the Node version in `.node-version`: the Cloudflare Vite plugin and the `cf` CLI load `cloudflare.config.ts` with Node, because it can't load on Bun.

```sh
bun install
bun run dev      # Vite dev server
bun run check    # every required check, as CI runs them
```

## Deployment

Åkle is one Cloudflare Worker, `akle`, that serves static assets only. [`cloudflare.config.ts`](cloudflare.config.ts) configures it, and the [`cf` CLI](https://developers.cloudflare.com/cf/) builds and deploys it. `vite build` writes the Worker's Build Output to `.cloudflare/output/`. [`public/_headers`](public/_headers) sets the caching: hashed files under `/assets/` (graph version data included) are `immutable`, and `index.html` is `no-cache`. `bun run headers:check` checks the build against it.

[CI](.github/workflows/ci.yml) runs the required checks on every PR and every push to `main`, then:

- **Production:** a push to `main` deploys the build that passed the checks to `akle.grehn.net`. Production deploys run one at a time, in order, and are never cancelled. A deploy is skipped when `main` has already moved on, so a slow older run can't roll production back.
- **Previews:** every PR from a branch in this repo gets a public Workers Preview named `pr-<number>` on `workers.dev`, linked from the PR as a deployment to the `preview` environment. `workers.dev` sends `X-Robots-Tag: noindex`, and `_headers` adds it too. [Preview cleanup](.github/workflows/preview-cleanup.yml) deletes the preview when the PR closes.
- **Schedule extension:** a [quarterly workflow](.github/workflows/schedule-extension.yml), also runnable by hand (with a dry-run option) from the Actions tab, opens or updates the PR that extends the schedule when fewer than 2 years (730 days) of puzzles are left, and turns on its auto-merge under 1 year (365 days). The required runway check fails under 100 days, blocking other PRs until the extension merges. It's only a backstop: launch generates about 27 years of puzzles, so the deployed site keeps working even if nobody touches the repo and GitHub disables the cron for inactivity. See [data/README.md](data/README.md#runway-bun-run-runwaycheck-and-bun-run-scheduleextend).
- **Forks:** PRs from forks run the checks only. They get no preview and no secrets, and no workflow uses `pull_request_target`. Dependabot PRs deliberately get no preview either: they get no environment secrets, and their checks still run.

### One-time setup

Done by hand, never by CI:

1. The **`production`** environment, limited to `main`, holds the `CLOUDFLARE_API_TOKEN` secret and the `CLOUDFLARE_ACCOUNT_ID` variable.
2. Create a **`preview`** environment for the PR previews. The `production` environment only allows `main`, so previews from PR branches can't use its secret. Give it no branch restriction, and add:
   - a `CLOUDFLARE_API_TOKEN` secret: a separate token scoped to _Workers Scripts: Edit_, so it can be revoked on its own;
   - a `CLOUDFLARE_ACCOUNT_ID` variable, the same account ID as `production`.

   This token can edit the production Worker too: the environment keeps forks away from it, but anyone who can push a branch here can use it. This is an accepted risk, recorded with the second token in [ADR 0005](docs/adr/0005-separate-preview-cloudflare-token.md).

3. A GitHub App with _Contents_ and _Pull requests_ read and write, installed on this repo, with its Client ID in the repo variable `SCHEDULE_APP_CLIENT_ID` and its private key in the repo secret `SCHEDULE_APP_PRIVATE_KEY`. The schedule extension pushes and opens its PR with the App's token, because PRs opened with `GITHUB_TOKEN` don't trigger the checks. Auto-merge is enabled in the repo settings.
4. The `akle.grehn.net` custom domain and the `åkle.grehn.net` redirect are set up in the Cloudflare dashboard.

### Rollback

**By default, revert the commit** (`git revert`, through a PR) and let the pipeline deploy `main` again. This keeps `main` and production the same.

**Instant rollback is for emergencies only**, when production is broken and a revert would take too long. Find the last good version (each deploy is tagged with its short commit SHA), then deploy it:

```sh
bunx cf workers versions list --worker-id akle
bunx cf workers deployments create --worker akle --strategy percentage \
  --versions '[{"version_id":"<VERSION_ID>","percentage":100}]'
```

The Cloudflare dashboard (Workers → `akle` → Deployments) can do the same. Then revert or fix the commit on `main`, because the next push to `main` deploys over the rollback.

**Never roll back across a graph version already in effect.** If a graph version has started (today's puzzle number has reached its `startsAtPuzzle`, see [ADR 0004](docs/adr/0004-versioned-graphs-keyed-by-puzzle-number.md)), never deploy a build from before that version was added: the puzzles that use it would break. Revert or fix forward instead.
