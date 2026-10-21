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

A version built from OSM also holds the **build evidence**: what the build measured, before the overrides. The app doesn't read these files; `bun run graph:check` reviews them (see below). `at` is a point as `lon lat`.

| File                | Content                                                                                |
| ------------------- | -------------------------------------------------------------------------------------- |
| `fixed-links.csv`   | `a,b,ways`: the OSM way ids (space-separated) of each detected fixed link              |
| `land-borders.csv`  | `a,b,land,at`: each shared OSM border, its length on land in metres, and a point on it |
| `point-touches.csv` | `a,b,at`: pairs whose OSM boundaries touch only at a point, and that point is on land  |
| `scb-pairs.csv`     | `a,b,at`: pairs whose boundaries share a point in SCB's kommun map, the cross-check    |

A kommun whose links are all `ferry` is a **dead end**; this is derived, not stored.

`graphs/fixture/` is a small hand-made version for development. Its borders and shapes are not real. It applies to puzzles #1–#30.

`graphs/osm-2026-10-01/` is built from OpenStreetMap and starts at puzzle #31. It has all 290 kommuner with land, fixed-link and ferry neighbors; Gotland and Öckerö are linked only by ferry, so they are dead ends. Its `version.json` records the extract, the SCB names file and the SCB boundaries it was built from. Borders and shapes © OpenStreetMap contributors, [ODbL 1.0](https://opendatacommons.org/licenses/odbl/1-0/).

### Rebuilding a graph version from OSM

```sh
bun run graph:build
```

Needs Bun and Docker. The command reads `scripts/graph/build-config.json`, which pins:

- the Geofabrik Sweden extract, the SCB kommun names file (`knkopplingar`) and SCB's kommun boundaries (`shape_svenska`), all by URL and sha256;
- the version id and the puzzle it starts at;
- the route that closes the mainland coastline, which the extract cuts at the borders with Norway and Finland.

It also reads the hand-kept ferries and overrides from `neighbor-overrides.yaml` ([ADR 0003](../docs/adr/0003-committed-human-reviewed-neighbor-graph.md)).

It downloads these files to `.cache/osm/` (gitignored, about 1 GB with the layers), runs osmium, osmcoastline and GDAL in the pinned image from `scripts/osm/Dockerfile`, and writes `data/graphs/<id>/` and `graph-report.md`. Running it twice gives identical files. CI never rebuilds; it only checks the committed files. After a rebuild, run `bun run schedule --chunks 0` so the unplayed rows match it.

How the graph is built:

- **Kommuner:** OSM `boundary=administrative` + `admin_level=7` relations keyed by `ref:scb`, named from SCB without "kommun". The build fails if the OSM and SCB codes differ, or if two names collide after accent folding (apart from Habo/Håbo).
- **Neighbors:** two kommuner are `land` neighbors when their shared border is longer than 0 m on land. Land is the OSM coastline's land minus every lake (`natural=water`, except rivers, canals and similar); a border through the sea or a lake doesn't count. Borders shared with river water count as land. The build prints the pairs that share a border only through water.
- **Fixed links:** two kommuner are `fixed` neighbors when a road, path or railway crosses their shared border where the border runs through water, so on a bridge, in a tunnel or over a causeway. The candidates are every `highway=*` or `railway=*` way tagged `bridge`, `tunnel`, `causeway`, `man_made=causeway` or `embankment`, plus the ways joined to them, since the way crossing the border isn't always tagged. Ways under construction, proposed, abandoned or disused, `access=private|no`, `tunnel=building_passage`, fords and ice or winter roads don't count. A pair can be both `land` and `fixed`. The build prints every fixed link with its way ids.
- **Ferries:** the `ferries` in `neighbor-overrides.yaml`, keyed by SCB codes with names that must match: Gotland–Nynäshamn, Gotland–Oskarshamn and Öckerö–Göteborg.
- **Overrides:** the `overrides` in `neighbor-overrides.yaml` add or remove a pair after review (see below).
- **Shapes:** the boundaries clipped to land, with lakes of 10 km² or more cut out, simplified (Visvalingam, 250 m) and with islands under 1 km² dropped.

### Reviewing flagged pairs

The build can't trust every pair on its own, so it **flags** them for a human ([ADR 0003](../docs/adr/0003-committed-human-reviewed-neighbor-graph.md)). A pair can have several flags:

| Flag           | When                                                                                              |
| -------------- | ------------------------------------------------------------------------------------------------- |
| `scb-mismatch` | SCB's kommun map and the generated land and fixed links disagree: the pair is in only one of them |
| `short-border` | the pair is a `land` neighbor with less than 100 m of border on land                              |
| `point-touch`  | the OSM boundaries touch only at a point, on land; the pair is not a neighbor                     |
| `fixed-only`   | the pair is linked only by a fixed link, with no land border                                      |

Every flagged pair needs a **verdict** in `neighbor-overrides.yaml`. Each entry is keyed by its pair of SCB codes, under `add`, `remove` or `keep`, with `names` that must match, and needs a `reason`. A pair appears at most once in the file.

```yaml
overrides: # change the generated graph
  - remove: ["0114", "0139"] # or add: ["<code>", "<code>"] with link: land | fixed
    names: [Upplands Väsby, Upplands-Bro]
    reason: Why the generated graph is wrong.
    evidence: https://example.org/evidence # required, http(s)
reviewed: # keep what the build decided
  - keep: ["0123", "0139"]
    names: [Järfälla, Upplands-Bro]
    kinds: [fixed-only] # the flags that were reviewed
    reason: Why the generated graph is right.
```

`data/graph-report.md` lists the flags, measurements, map links and verdicts of the newest graph version, the problems left, and the pairs added or removed since the previous version. After editing the overrides, run

```sh
bun run graph:review
```

It rereads the build evidence of the newest version, so it needs no OSM, and rewrites its `neighbors.csv` and the report. `bun run graph:check`, part of `bun run check` and CI, does the same without writing and fails when:

- a flagged pair has no verdict, or a `reviewed` entry misses one of its flags;
- an entry is stale: a `reviewed` pair or flag is no longer flagged, a `remove` names a pair the build didn't link, or an `add` names a pair already linked;
- a kommun has no neighbors, can't be reached from the rest, or its code differs between OSM, SCB's names and SCB's boundaries; no verdict accepts these;
- `neighbors.csv` or the report is out of date.

### Adding a graph version

Every change to the kommuner, their names, neighbors or shapes, whether a kommun merger, a new bridge or ferry, or an error fix, goes into a **new graph version** that starts at a future puzzle number ([ADR 0004](../docs/adr/0004-versioned-graphs-keyed-by-puzzle-number.md)). It can be reviewed and merged well ahead of time: no deploy needs to be timed, and games in progress are never rescored.

A version is **frozen** once a puzzle has used it, that is once its `startsAtPuzzle` is played (today's puzzle number in UTC+14, the earliest time zone). Frozen versions are never edited, rebuilt or rechecked; a known error stays in the puzzles that already used it. Until its first puzzle is played, the newest version may still be rebuilt in place.

1. Pick the starting puzzle number: the first puzzle that should use the change. It must be after every played puzzle; leave time for review. For a merger on 1 January, it is the puzzle number of 1 January.
2. In `scripts/graph/build-config.json`, set a new `id` (for example `osm-YYYY-MM-DD` after the extract date) and `startsAtPuzzle`, and pin a newer extract or SCB names file if needed. The overrides in `neighbor-overrides.yaml` apply to the new version only; an older version's overrides live only in git history.
3. Run `bun run graph:build`. It writes `data/graphs/<new id>/` and leaves the older directories alone.
4. Review the flagged pairs in `graph-report.md` as in [Reviewing flagged pairs](#reviewing-flagged-pairs). Only the newest version goes through these checks.
5. Run `bun run schedule --chunks 0`. It reconciles every unplayed row from the new start onward against the new version, updating N or redrawing the pair when needed. Paste its report in the PR. The schedule must cover the new start: the version boundary test loads the puzzles on each side of it.
6. Run `bun run check`.

A **rename** is data only: the new version's `kommuner.csv` has the new name, and there is no alias for the old one.

The app picks the version by puzzle number, never by the clock, and fetches only that version's files, on demand.

### Checking: `bun run graph-versions:check [--base <git revision>]`

The required frozen graph versions check, run in CI against the PR's base (`HEAD` by default): every version a played puzzle has used is byte for byte unchanged from the base, keeps its `startsAtPuzzle` and isn't removed, and no new or moved version starts at a played puzzle.

## Schedule: `schedule/`

- `config.json`: `{ "epoch": "YYYY-MM-DD", "seed": "…", "cooldownDays": 30, "cooldownDaysByGraphVersion": { "<id>": <days> } }`. The epoch is puzzle #1. Each row's endpoint cooldown comes from its graph version: its entry in `cooldownDaysByGraphVersion`, else `cooldownDays`, which defaults to 30. The fixture graph version gets 3, because a 30-day cooldown can't be met with its 21 kommuner.
- `0001.csv`, `0002.csv`, …: chunks of 1,000 puzzles with the header `puzzle,start,destination,n` ([ADR 0001](../docs/adr/0001-pre-generated-puzzle-schedule.md)).

The current `0001.csv` is a fixture of 90 rows: #1–#30 on the fixture graph version, the rest on `osm-2026-10-01`.

### Generating: `bun run schedule [--chunks k] [--now <ISO date>]`

Reconciles every unplayed row against the graph version for its puzzle number (updating N, or redrawing the pair when N leaves 3–8, an endpoint is gone or a rule is broken), then completes or adds `k` chunks (default 1; `0` only reconciles). It prints the Markdown report for the PR body. The same committed files, seed and date always give byte-identical chunks.

- Each row's draws come from sha256 of `seed:puzzle:attempt`. N is drawn uniformly from 3–8, then a pair uniformly among the least-used pairs with that N whose endpoints are outside the cooldown of the row's graph version; when none qualifies, the next attempt redraws.
- **Played** rows (puzzle number up to today's in UTC+14, the earliest time zone) are never changed.
- Rows may be curated by hand; a rerun keeps any unplayed row that still follows the rules.

### Checking: `bun run schedule:check [--base <git revision>]`

The required schedule rules check, run in CI against the PR's base: N matches the row's graph version, N is 3–8, no pair repeats before every pair with its N is used as often, no endpoint repeats within the cooldown of the row's graph version, puzzle numbers run 1, 2, 3, … and each row sits in its own chunk, and played rows are unchanged from the base (`HEAD` by default). Rows that were already played are exempt from the other rules.
