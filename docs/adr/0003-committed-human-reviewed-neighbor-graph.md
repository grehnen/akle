# The neighbor graph is committed, and every flagged pair needs a human verdict

The neighbor graph is built from a pinned OSM extract by a local script, then committed to the repo along with a build report. CI checks the committed graph but never rebuilds it from OSM. The build flags pairs it can't trust on its own:

- SCB mismatches
- land borders under about 100 m
- single-point touches on land
- pairs linked only by a fixed link
- problems across the whole graph: a kommun with no neighbors, a kommun the graph can't reach, or a kommun code missing or extra

Every flagged pair needs a recorded human verdict in one hand-kept file, `data/neighbor-overrides.yaml`. The file also holds the ferry list. A verdict is either a keep or an add/remove override, keyed by the pair's SCB kommun codes and backed by a reason (overrides also need an evidence link). The build fails on an unreviewed flag, a new flag kind on an already-reviewed pair, or a stale entry. A graph change ships only through a PR the owner approves.

We chose this over rebuilding from Geofabrik in CI. A fresh OSM extract can silently add or drop neighbors and change every puzzle's N. With a committed graph, every change shows up as a reviewed diff, and the build is reproducible offline.

## Consequences

- Generated files (the graph, `data/graph-report.md`) live in the repo, and changing them means rerunning the script locally.
- The first review pass covers about 90 SCB disagreements plus the other flags, and it blocks v1 launch. An agent may draft verdicts, but the owner signs them off.
- How often the OSM extract is refreshed is left to the "Updating data" fog.
