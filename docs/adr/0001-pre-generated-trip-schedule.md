# Daily trips come from a pre-generated, committed schedule

Åkle is a static, client-only app, so unlike Travle there is no server to pick each day's start/destination pair. Instead of deriving the pair in the browser from a date-seeded PRNG, a seeded script generates an append-only schedule from the neighbor graph. Each entry is keyed by trip number and records the start, the destination and the shortest-route length N. The schedule is committed, reviewed and bundled with the app. We chose this so the trips can be reviewed and curated, and so a change to the neighbor graph can't silently rewrite past or upcoming trips. The build fails if the graph gives a different N for any entry from today onward. Each entry is checked against the graph version for its trip number ([ADR 0004](./0004-versioned-graphs-keyed-by-trip-number.md)).

The schedule is stored in chunks of 1,000 trips (`data/schedule/0001.csv`, `0002.csv`, …), and each generation run appends one chunk. It is append-only per row, not per file: a played trip never changes, while unplayed rows may be reconciled against a new graph version ([ADR 0004](./0004-versioned-graphs-keyed-by-trip-number.md)) or curated by hand. Pairs repeat least-used first within each N, so the schedule never runs out of pairs.

## Consequences

- Anyone reading the bundle can see future trips. We accept this, as Kommunle and early Wordle did.
- The schedule has to be extended before it runs out. It holds 10 chunks (about 27 years), so the deployed site keeps serving trips even if nobody touches the repo and every automation breaks: GitHub disables scheduled workflows after 60 days without activity in a public repo, and pinned actions, the Cloudflare tooling and tokens can all rot. A quarterly job is a backstop: it opens an extension PR when fewer than 730 days remain and turns on auto-merge when fewer than 365 remain. CI fails when fewer than 100 remain.
- The app fetches only the chunk holding today's trip, so the download doesn't grow as the schedule does.
- The epoch, trip #1, is fixed: the schedule rules check fails when it differs from the base revision's.
