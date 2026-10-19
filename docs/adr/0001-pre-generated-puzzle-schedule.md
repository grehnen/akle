# Daily puzzles come from a pre-generated, committed schedule

Åkle is a static, client-only app, so unlike Travle there is no server to pick each day's start/destination pair. Instead of deriving the pair in the browser from a date-seeded PRNG, a seeded script generates an append-only schedule from the neighbor graph. Each entry is keyed by puzzle number and records the start, the destination and the shortest-route length N. The schedule is committed, reviewed and bundled with the app. We chose this so the puzzles can be reviewed and curated, and so a change to the neighbor graph can't silently rewrite past or upcoming puzzles. The build fails if the current graph gives a different N for any entry from today onward.

## Consequences

- Anyone reading the bundle can see future puzzles. We accept this, as Kommunle and early Wordle did.
- The schedule has to be extended before it runs out. CI fails when fewer than 90 days remain.
