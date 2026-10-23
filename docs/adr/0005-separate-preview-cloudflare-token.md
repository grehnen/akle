# PR previews deploy with a second Cloudflare token, in a `preview` environment

Decision [#17](https://github.com/grehnen/akle/issues/17) settled on one Cloudflare API token, scoped to _Workers Scripts: Edit_ and stored in a GitHub `production` environment limited to `main`. This amends it. A preview per same-repo PR has to deploy from the PR's branch, which the `production` environment won't hand its secret to, so previews get their own `preview` environment with no branch restriction and a second token with the same scope. We chose a second token over lifting `production`'s branch limit, so production deploys still only happen from `main`, and so the preview token can be revoked on its own.

## Consequences

- _Workers Scripts: Edit_ covers every Worker on the account, so the preview token can edit the production Worker too. We accept this risk: the environment keeps forks away from it (PR workflows run on `pull_request`, never `pull_request_target`), but anyone who can push a branch to the repo can use it.
- Dependabot PRs get no environment secrets, so they get no preview. This is deliberate: their checks still run, and we don't hand Dependabot a token that can edit production.
- There are two tokens to rotate instead of one.
