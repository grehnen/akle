# Åkle data

Committed data the app bundles and fetches on demand. Parsers live in `src/graph/graphVersionFiles.ts` and `src/schedule/schedule.ts`.

## Graph versions: `graphs/<id>/`

One directory per **graph version** ([ADR 0004](../docs/adr/0004-versioned-graphs-keyed-by-puzzle-number.md)), loaded as one unit:

| File             | Content                                                                                     |
| ---------------- | ------------------------------------------------------------------------------------------- |
| `version.json`   | `{ "id": "<id>", "startsAtPuzzle": <puzzle number> }`; the id must match the directory name |
| `kommuner.csv`   | `code,name`: SCB kommun code and official name without "kommun"                             |
| `neighbors.csv`  | `a,b,link`: one neighbor pair per row; `link` is `land`, `fixed` or `ferry`                 |
| `shapes.geojson` | A FeatureCollection with one feature per kommun, `properties.code` set to its SCB code      |

A kommun whose links are all `ferry` is a **dead end**; this is derived, not stored.

`graphs/fixture/` is a small hand-made version for development. Its borders and shapes are not real. It applies to puzzles #1–#30.

`graphs/osm-2026-10-01/` is built from OpenStreetMap and starts at puzzle #31. It has all 290 kommuner, but only **land** neighbors so far: fixed links and ferries come later, so Gotland, Lidingö, Tjörn and Öckerö have no neighbors yet. Its `version.json` records the extract and the SCB names file it was built from. Borders and shapes © OpenStreetMap contributors, [ODbL 1.0](https://opendatacommons.org/licenses/odbl/1-0/).

### Rebuilding a graph version from OSM

```sh
bun run graph:build
```

Needs Bun and Docker. The command reads `scripts/graph/build-config.json`, which pins:

- the Geofabrik Sweden extract and the SCB kommun names file (`knkopplingar`), both by URL and sha256;
- the version id and the puzzle it starts at;
- the route that closes the mainland coastline, which the extract cuts at the borders with Norway and Finland.

It downloads both files to `.cache/osm/` (gitignored, about 1 GB with the layers), runs osmium, osmcoastline and GDAL in the pinned image from `scripts/osm/Dockerfile`, and writes `data/graphs/<id>/`. Running it twice gives identical files. CI never rebuilds; it only checks the committed files. After a rebuild, run `bun run schedule --chunks 0` so the unplayed rows match it.

How the graph is built:

- **Kommuner:** OSM `boundary=administrative` + `admin_level=7` relations keyed by `ref:scb`, named from SCB without "kommun". The build fails if the OSM and SCB codes differ, or if two names collide after accent folding (apart from Habo/Håbo).
- **Neighbors:** two kommuner are `land` neighbors when their shared border is longer than 0 m on land. Land is the OSM coastline's land minus every lake (`natural=water`, except rivers, canals and similar); a border through the sea or a lake doesn't count. Borders shared with river water count as land. The build prints the pairs that share a border only through water.
- **Shapes:** the boundaries clipped to land, with lakes of 10 km² or more cut out, simplified (Visvalingam, 250 m) and with islands under 1 km² dropped.

Some land borders are very short and may be data noise, for example Ekerö–Stockholm (42 m, across Hässelby holme) and Orust–Uddevalla (38 m). They stay in the graph until the review of flagged pairs decides on them.

### Adding a graph version

Every change to the kommuner, their names, neighbors or shapes, whether a kommun merger, a new bridge or ferry, or an error fix, goes into a **new graph version** that starts at a future puzzle number ([ADR 0004](../docs/adr/0004-versioned-graphs-keyed-by-puzzle-number.md)). It can be reviewed and merged well ahead of time: no deploy needs to be timed, and games in progress are never rescored.

A version is **frozen** once a puzzle has used it, that is once its `startsAtPuzzle` is played (today's puzzle number in UTC+14, the earliest time zone). Frozen versions are never edited, rebuilt or rechecked; a known error stays in the puzzles that already used it. Until its first puzzle is played, the newest version may still be rebuilt in place.

1. Pick the starting puzzle number: the first puzzle that should use the change. It must be after every played puzzle; leave time for review. For a merger on 1 January, it is the puzzle number of 1 January.
2. In `scripts/graph/build-config.json`, set a new `id` (for example `osm-YYYY-MM-DD` after the extract date) and `startsAtPuzzle`, and pin a newer extract or SCB names file if needed. The overrides in the config apply to the new version only; an older version's overrides live only in git history.
3. Run `bun run graph:build`. It writes `data/graphs/<new id>/` and leaves the older directories alone.
4. Review the new version as in [ADR 0003](../docs/adr/0003-committed-human-reviewed-neighbor-graph.md). Only the newest version goes through these checks.
5. Run `bun run schedule --chunks 0`. It reconciles every unplayed row from the new start onward against the new version, updating N or redrawing the pair when needed. Paste its report in the PR. The schedule must cover the new start: the version boundary test loads the puzzles on each side of it.
6. Run `bun run check`.

A **rename** is data only: the new version's `kommuner.csv` has the new name, and there is no alias for the old one.

The app picks the version by puzzle number, never by the clock, and fetches only that version's files, on demand.

### Checking: `bun run graph-versions:check [--base <git revision>]`

The required frozen graph versions check, run in CI against the PR's base (`HEAD` by default): every version a played puzzle has used is byte for byte unchanged from the base, keeps its `startsAtPuzzle` and isn't removed, and no new or moved version starts at a played puzzle.

## Schedule: `schedule/`

- `config.json`: `{ "epoch": "YYYY-MM-DD", "seed": "…", "cooldownDays": 30 }`. The epoch is puzzle #1. `cooldownDays` defaults to 30; the fixture sets 3 because a 30-day cooldown can't be met with its 21 kommuner.
- `0001.csv`, `0002.csv`, …: chunks of 1,000 puzzles with the header `puzzle,start,destination,n` ([ADR 0001](../docs/adr/0001-pre-generated-puzzle-schedule.md)).

The current `0001.csv` is a fixture of 90 rows: #1–#30 on the fixture graph version, the rest on `osm-2026-10-01`.

### Generating: `bun run schedule [--chunks k] [--now <ISO date>]`

Reconciles every unplayed row against the graph version for its puzzle number (updating N, or redrawing the pair when N leaves 3–8, an endpoint is gone or a rule is broken), then completes or adds `k` chunks (default 1; `0` only reconciles). It prints the Markdown report for the PR body. The same committed files, seed and date always give byte-identical chunks.

- Each row's draws come from sha256 of `seed:puzzle:attempt`. N is drawn uniformly from 3–8, then a pair uniformly among the least-used pairs with that N whose endpoints are outside the cooldown; when none qualifies, the next attempt redraws.
- **Played** rows (puzzle number up to today's in UTC+14, the earliest time zone) are never changed.
- Rows may be curated by hand; a rerun keeps any unplayed row that still follows the rules.

### Checking: `bun run schedule:check [--base <git revision>]`

The required schedule rules check, run in CI against the PR's base: N matches the row's graph version, N is 3–8, no pair repeats before every pair with its N is used as often, no endpoint repeats within the cooldown, puzzle numbers run 1, 2, 3, … and each row sits in its own chunk, and played rows are unchanged from the base (`HEAD` by default). Rows that were already played are exempt from the other rules.
