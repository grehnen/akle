# Daily puzzles come from a pre-generated, committed schedule

Åkle is a static, client-only app, so unlike Travle there is no server to pick each day's start/destination pair. Instead of deriving the pair in the browser from a date-seeded PRNG, a seeded script generates an append-only schedule from the neighbor graph. Each entry is keyed by puzzle number and records the start, the destination and the shortest-route length N. The schedule is committed, reviewed and bundled with the app. We chose this so the puzzles can be reviewed and curated, and so a change to the neighbor graph can't silently rewrite past or upcoming puzzles. The build fails if the graph gives a different N for any entry from today onward. Each entry is checked against the graph version for its puzzle number ([ADR 0004](./0004-versioned-graphs-keyed-by-puzzle-number.md)).

The schedule is stored in chunks of 1,000 puzzles (`data/schedule/0001.csv`, `0002.csv`, …), and each generation run appends one chunk. It is append-only per row, not per file: a puzzle that has been played never changes, while unplayed rows may still be reconciled against a new graph version (redrawn when they break any schedule rule, see [ADR 0004](./0004-versioned-graphs-keyed-by-puzzle-number.md)) or curated by hand. A pair repeats only once every pair with the same N has been used (least-used first), so the schedule never runs out of pairs.

## Consequences

- Anyone reading the bundle can see future puzzles. We accept this, as Kommunle and early Wordle did.
- The schedule has to be extended before it runs out. A monthly job opens an extension PR when fewer than 90 days remain and turns on auto-merge when fewer than 40 remain. CI fails when fewer than 40 remain, the same point where auto-merge turns on. (This was originally 30; it was raised to 40 so the runway check and auto-merge share one threshold.)
- The app fetches only the chunk holding today's puzzle, so the download doesn't grow as the schedule does.
