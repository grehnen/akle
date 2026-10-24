# The neighbor graph is committed, and every flagged pair needs a human verdict

The neighbor graph is built from a pinned OSM extract by a local script, then committed to the repo along with a build report. CI checks the committed graph but never rebuilds it from OSM. The build flags pairs it can't trust on its own:

- SCB mismatches
- land borders under about 100 m
- single-point touches on land
- pairs linked only by a fixed link
- problems across the whole graph: a kommun with no neighbors, a kommun the graph can't reach, or a kommun code missing or extra

Every flagged pair needs a recorded human verdict in one hand-kept file, `data/neighbor-overrides.yaml`. The file also holds the ferry list. A verdict is either a keep or an add/remove override, keyed by the pair's SCB kommun codes and backed by a reason (overrides also need an evidence link). The build fails on an unreviewed flag, a new flag kind on an already-reviewed pair, or a stale entry. A graph change ships only through a PR the owner approves.

We chose this over rebuilding from Geofabrik in CI. A fresh OSM extract can silently add or drop neighbors and change every trip's N. With a committed graph, every change shows up as a reviewed diff, and the build is reproducible offline.

## Consequences

- Generated files (the graph, `data/graph-report.md`) live in the repo, and changing them means rerunning the script locally.
- The first review pass covers about 90 SCB disagreements plus the other flags, and it blocks v1 launch. An agent may draft verdicts, but the owner signs them off.
- The OSM extract is refreshed only when needed. Each refresh produces a new graph version, and only the newest version is checked ([ADR 0004](./0004-versioned-graphs-keyed-by-trip-number.md)).

## Amendment (2026-10-22)

The SCB cross-check is dropped: the build no longer compares its pairs with SCB's kommun map or flags SCB mismatches, and keeps no SCB pair evidence. Every SCB mismatch reviewed was a false positive, from SCB's generalised map missing fixed links and short or island borders. SCB's kommun list still has to match the OSM boundaries.
