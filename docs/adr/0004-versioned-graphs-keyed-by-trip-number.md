# Kommun data is versioned, and each version starts at a trip number

The neighbor graph, kommun names, kommun shapes and the ferry list change rarely: kommun merges and splits take effect on 1 January, a new bridge opens, or an error gets fixed. Instead of keeping only the latest data and deploying on the day a change takes effect, the repo and app keep every **graph version**. Each version starts at a trip number, and every daily trip is played and checked against the version that applies to its trip number. A version is chosen by trip number, never by the clock, so everyone playing the same trip gets the same version even though the day resets at each player's local midnight. We chose this so a change can be reviewed and merged ahead of time with no timed deploy, an unfinished game is never rescored against new data, and past trips stay replayable if an archive is ever added.

- A version is **never edited** once any trip has used it. Every change, error fixes included, becomes a new version starting at a future trip number. A known error therefore stays in the trips that already used the old version.
- Only the **newest** version is rebuilt from OSM and goes through the review checks in [ADR 0003](./0003-committed-human-reviewed-neighbor-graph.md). Older versions are frozen outputs. Their overrides live only in git history.
- When a new version arrives, the schedule generator reconciles every unplayed trip against its own version: it updates N, then redraws the pair if the row breaks **any** schedule rule, not just a missing endpoint or N out of range. A graph change can move a kept pair into an N group whose pairs are already used, and a redrawn row can put a later row's endpoint in cooldown.
- Each version is loaded as one unit (graph, names, shapes, ferries, dead ends), so data from two versions is never mixed. The app loads only the version it needs, on demand, so old shapes don't grow the initial download.

## Considered Options

- **Latest data only, deployed on the date a change takes effect:** less code, but it needs timed deploys, rescores unfinished games against new data, and can't replay past trips.

## Consequences

- Every version is shipped data and must be offered under ODbL ([ADR 0002](./0002-osm-boundaries-and-neighbor-graph.md)).
- Version boundaries need tests: a trip on each side of a boundary must load its own version.
