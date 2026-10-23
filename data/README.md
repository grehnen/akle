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

| File                | Content                                                                                                                                                                                                                                                                                                                                  |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `fixed-links.csv`   | `a,b,ways,failures`: each detected fixed link and its OSM way ids (space-separated): only the passing ways when the link qualifies, with failures `-`; every crossing way when none passes, with failures `<way id>:<reason>+<reason>` per way                                                                                           |
| `land-borders.csv`  | `a,b,land,mainland,island,river,exclave,at`: each shared OSM border, its length on land in metres, how much of that is on the mainland and on islands, its length in river water (river areas, apart from lakes and the sea), the codes of the kommuner whose exclave holds all of its land (space-separated, or `-`), and a point on it |
| `point-touches.csv` | `a,b,at`: pairs whose OSM boundaries touch only at a point, and that point is on meaningful land                                                                                                                                                                                                                                         |

A kommun whose links are all `ferry` is a **dead end**; this is derived, not stored.

`graphs/fixture/` is a small hand-made version for development. Its borders and shapes are not real. It applies to puzzles #1–#30.

`graphs/osm-2026-10-01/` is built from OpenStreetMap and starts at puzzle #24. It has all 290 kommuner with land, fixed-link and ferry neighbors; Gotland and Öckerö are linked only by ferry, so they are dead ends. Its `version.json` records the extract and the SCB names file it was built from. Borders and shapes © OpenStreetMap contributors, [ODbL 1.0](https://opendatacommons.org/licenses/odbl/1-0/).

### Rebuilding a graph version from OSM

```sh
bun run graph:build
```

Needs Bun and Docker. The command reads `scripts/graph/build-config.json`, which pins:

- the Geofabrik Sweden extract and the SCB kommun names file (`knkopplingar`), both by URL and sha256;
- the version id and the puzzle it starts at;
- the route that closes the mainland coastline, which the extract cuts at the borders with Norway and Finland.

It also reads the hand-kept ferries and overrides from `neighbor-overrides.yaml` ([ADR 0003](../docs/adr/0003-committed-human-reviewed-neighbor-graph.md)).

It downloads these files to `.cache/osm/` (gitignored, about 1 GB with the layers), runs osmium, osmcoastline and GDAL in the pinned image from `scripts/osm/Dockerfile`, and writes `data/graphs/<id>/` and `graph-report.md`. Running it twice gives identical files. CI never rebuilds; it only checks the committed files. After a rebuild, run `bun run schedule --chunks 0` so the unplayed rows match it.

How the graph is built:

- **Kommuner:** OSM `boundary=administrative` + `admin_level=7` relations keyed by `ref:scb`, named from SCB without "kommun". The build fails if the OSM and SCB codes differ, or if two names collide after accent folding (apart from Habo/Håbo).
- **Neighbors:** two kommuner are `land` neighbors when their shared border is longer than 0 m on land, unless that border is only on islands and under 1000 m, or lies wholly on an exclave: the build drops such a pair and flags it `island-border` or `exclave-border`. A pair with no border on land but one in river water is `land` neighbors when that river border is 1000 m or more, and is dropped and flagged `river-border` when it is shorter. A qualifying fixed link still makes a dropped pair `fixed` neighbors, and an `add` can put it back. An island-only border or river border of 1000 m or more is flagged too when it is the pair's only valid link: no corner touch on land and no qualifying fixed link. A corner touch, where the boundaries meet only at a point, makes `land` neighbors when that point is on land, and is flagged `point-touch`; one in water or on an islet is ignored. Land is the OSM coastline's land minus every lake and river area (`natural=water`, except canals, streams and similar channels) and minus every island under 1 km², in the sea, a lake or a river; a border through the sea, through a lake or river or across such a small island doesn't count. The build prints the pairs that share a border only through water.
- **Mainland, islands and exclaves:** the mainland is the largest landmass in the OSM coastline, without the islands of 1 km² or more in its lakes and rivers; every other land is on an island. An exclave is any part of a kommun's OSM boundary, water included, other than its largest part. The build records, per pair, the land border on the mainland and on islands and whose exclave holds all of it, which decide the `island-border` and `exclave-border` drops.
- **Fixed links:** a fixed link is a road, path or railway that crosses two kommuners' shared border, over land or water: a bridge, tunnel or causeway, or an ordinary road across a border on land. The candidates are every `highway=*` or `railway=*` way that crosses a shared border; a way that only touches the border and turns back, with both ends in the same kommun, doesn't cross it. Ways under construction, proposed, abandoned or disused, `tunnel=building_passage`, fords, ferries and ice or winter roads don't count. A fixed link **qualifies**, and makes the pair `fixed` neighbors, when at least one of its crossing ways passes. A way passes when it is:
  - **public:** not `access=private` or `access=no`, not `highway=service` + `service=driveway`, and not `highway=track`;
  - **on meaningful land at both ends:** from each side of the crossing, the way, or the ways joined to it, reaches the mainland or an island of at least 1 km² without crossing any shared border, on land or water, or taking a ferry. The walk follows the crossing ways and the road network around bridges, tunnels and causeways, the ways joined to them three steps out, with land and lakes near the borders or that network as the mask. A bridge to an islet, or a pier that ends in the water, doesn't (`no-land-end`);
  - **in each kommun's main part:** the land reached on each side lies in the main part of that side's kommun, the largest part of its OSM boundary, as for `exclave-border`. A road into an exclave doesn't pass (`exclave-end`).

  Most crossings are on land between pairs that are `land` neighbors anyway; there the link changes nothing. A qualifying link lists only its passing ways. A non-qualifying link, where every way fails, adds no neighbor; when the pair has no land border that makes it neighbors, it is flagged `non-qualifying-link` for review, and an `add` with `link: fixed` can put it back. A pair can be both `land` and `fixed`. The build prints the fixed links of pairs without a land border, with their way ids and, for a link that doesn't qualify, why its ways fail, and counts the rest.

- **Ferries:** the `ferries` in `neighbor-overrides.yaml`, keyed by SCB codes with names that must match: Gotland–Nynäshamn, Gotland–Oskarshamn and Öckerö–Göteborg.
- **Overrides:** the `overrides` in `neighbor-overrides.yaml` add or remove a pair after review (see below).
- **Shapes:** the boundaries clipped to land, with lakes and river areas of 10 km² or more cut out, simplified (Visvalingam, 250 m) and with islands under 1 km² dropped.

### Reviewing flagged pairs

The build can't trust every pair on its own, so it **flags** them for a human ([ADR 0003](../docs/adr/0003-committed-human-reviewed-neighbor-graph.md)). A pair can have several flags:

| Flag                  | When                                                                                                                                                                                                                                                                                                                   |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `short-border`        | the pair has less than 100 m of border on land                                                                                                                                                                                                                                                                         |
| `point-touch`         | the OSM boundaries touch only at a point, on land; the build makes the pair `land` neighbors                                                                                                                                                                                                                           |
| `non-qualifying-link` | the pair has no land border that makes it neighbors and a fixed link that doesn't qualify, so the build drops it; the report lists the failing ways and why                                                                                                                                                            |
| `island-border`       | the pair has a land border, none of it on the mainland, and either less than 1000 m on islands, so the build drops the pair unless a qualifying fixed link, such as a road across that island border, keeps it, or 1000 m or more with no other valid link, so the island border alone makes the pair `land` neighbors |
| `river-border`        | the pair has no border on land but one in river water, and either less than 1000 m of it, so the build drops the pair unless a qualifying fixed link keeps it, or 1000 m or more with no other valid link, so the river border alone makes the pair `land` neighbors                                                   |
| `exclave-border`      | the pair's whole land border, at any length, lies on an exclave of either kommun; the report names whose, and the build drops the pair unless a qualifying fixed link keeps it                                                                                                                                         |

A dropped pair stays flagged, and the report lists it under the pairs the build made neighbors or not; an `add` puts it back.

Every flagged pair needs a **verdict** in `neighbor-overrides.yaml`. Each entry is keyed by its pair of SCB codes, under `add`, `remove` or `keep`, with `names` that must match, and needs a `reason`. A pair appears at most once in the file.

```yaml
overrides: # change the generated graph
  - remove: ["0114", "0139"] # or add: ["<code>", "<code>"] with link: land | fixed
    names: [Upplands Väsby, Upplands-Bro]
    reason: Why the generated graph is wrong.
    evidence: https://example.org/evidence # required, http(s)
reviewed: # keep what the build decided, whether neighbors or not
  - keep: ["0305", "0330"]
    names: [Håbo, Knivsta]
    kinds: [non-qualifying-link] # the flags that were reviewed
    reason: Why the generated graph is right.
```

`data/graph-report.md` lists the flags, measurements, map links, what the build decided and the verdicts of the newest graph version, the problems left, and the pairs added or removed since the previous version. After editing the overrides, run

```sh
bun run graph:review
```

It rereads the build evidence of the newest version, so it needs no OSM, and rewrites its `neighbors.csv` and the report. `bun run graph:check`, part of `bun run check` and CI, does the same without writing and fails when:

- a flagged pair has no verdict, or a `reviewed` entry misses one of its flags;
- an entry is stale: a `reviewed` pair or flag is no longer flagged, a `remove` names a pair the build didn't link, or an `add` names a pair already linked;
- a kommun has no neighbors, can't be reached from the rest, or its code differs between OSM and SCB's names; no verdict accepts these;
- `neighbors.csv` or the report is out of date.

### Adding a graph version

Every change to the kommuner, their names, neighbors or shapes, whether a kommun merger, a new bridge or ferry, or an error fix, goes into a **new graph version** that starts at a future puzzle number ([ADR 0004](../docs/adr/0004-versioned-graphs-keyed-by-puzzle-number.md)). It can be reviewed and merged well ahead of time: no deploy needs to be timed, and games in progress are never rescored.

A version is **frozen** once a puzzle has used it, that is once its `startsAtPuzzle` is [played](#played-puzzles). Frozen versions are never edited, rebuilt or rechecked; a known error stays in the puzzles that already used it. Until its first puzzle is played, the newest version may still be rebuilt in place.

1. Pick the starting puzzle number: the first puzzle that should use the change. It must be after every played puzzle; leave time for review. For a merger on 1 January, it is the puzzle number of 1 January.
2. In `scripts/graph/build-config.json`, set a new `id` (for example `osm-YYYY-MM-DD` after the extract date) and `startsAtPuzzle`, and pin a newer extract or SCB names file if needed. The overrides in `neighbor-overrides.yaml` apply to the new version only; an older version's overrides live only in git history.
3. Run `bun run graph:build`. It writes `data/graphs/<new id>/` and leaves the older directories alone.
4. Review the flagged pairs in `graph-report.md` as in [Reviewing flagged pairs](#reviewing-flagged-pairs). Only the newest version goes through these checks.
5. Run `bun run schedule --chunks 0`. It reconciles every unplayed row from the new start onward against the new version, updating N or redrawing the pair when needed. Paste its report in the PR. The schedule must cover the new start: the version boundary test loads the puzzles on each side of it.
6. Run `bun run check`.

A **rename** is data only: the new version's `kommuner.csv` has the new name, and there is no alias for the old one.

The app picks the version by puzzle number, never by the clock, and fetches only that version's files, on demand.

### Checking: `bun run graph-versions:check [--base <git revision>]`

The required frozen graph versions check, run in CI against the PR's base (`HEAD` by default): every version a played puzzle has used is byte for byte unchanged from the base, keeps its `startsAtPuzzle` and isn't removed, and no new or moved version starts at a [played](#played-puzzles) puzzle, counted against the base.

## Schedule: `schedule/`

- `config.json`: `{ "epoch": "YYYY-MM-DD", "seed": "…", "cooldownDays": 30, "cooldownDaysByGraphVersion": { "<id>": <days> } }`. The epoch is puzzle #1. Each row's endpoint cooldown comes from its graph version: its entry in `cooldownDaysByGraphVersion`, else `cooldownDays`, which defaults to 30. Every id in `cooldownDaysByGraphVersion` must be a graph version under `data/graphs/`; the schedule scripts reject the config otherwise. The fixture graph version gets 3, because a 30-day cooldown can't be met with its 21 kommuner.
- `0001.csv`, `0002.csv`, …: chunks of 1,000 puzzles with the header `puzzle,start,destination,n` ([ADR 0001](../docs/adr/0001-pre-generated-puzzle-schedule.md)).

### Played puzzles

A puzzle is **played** when its number is at most today's puzzle number in UTC+14, the earliest time zone, and the base revision scheduled it. The base is the `--base` revision for the checks and `HEAD` for the generator. So a base with no schedule (bootstrapping the data) has nothing played, and nothing frozen. The generator, `schedule:check` and `graph-versions:check` all use this one rule (`scripts/playedThrough.ts`).

### Generating: `bun run schedule [--chunks k] [--now <ISO date>]`

Reconciles every unplayed row against the graph version for its puzzle number (updating N, or redrawing the pair when N leaves 3–8, an endpoint is gone or a rule is broken), then completes or adds `k` chunks (default 1; `0` only reconciles). It prints the Markdown report for the PR body. The same committed files, seed and date always give byte-identical chunks.

- Each row's draws come from sha256 of `seed:puzzle:attempt`. N is drawn uniformly from 3–8, then a pair uniformly among the least-used pairs with that N whose endpoints are outside the cooldown of the row's graph version; when none qualifies, the next attempt redraws.
- [Played](#played-puzzles) rows are never changed; the generator counts them against `HEAD`.
- Rows may be curated by hand; a rerun keeps any unplayed row that still follows the rules.

### Checking: `bun run schedule:check [--base <git revision>]`

The required schedule rules check, run in CI against the PR's base: N matches the row's graph version, N is 3–8, no pair repeats before every pair with its N is used as often, no endpoint repeats within the cooldown of the row's graph version, puzzle numbers run 1, 2, 3, … and each row sits in its own chunk, and [played](#played-puzzles) rows, counted against the base (`HEAD` by default), are unchanged from it. Played rows are exempt from the other rules.

### Runway: `bun run runway:check` and `bun run schedule:extend`

The **runway** is the days of puzzles left: the scheduled puzzles after today's puzzle number in UTC+14 (`src/schedule/runway.ts`). Both commands take `--now <ISO date>` to try another day.

- `bun run runway:check` is the required runway check. It fails when fewer than 100 days are left.
- `bun run schedule:extend` is what the quarterly [Schedule extension](../.github/workflows/schedule-extension.yml) workflow runs on `main`. Under 730 days left, it runs `bun run schedule` on the `schedule/extend` branch, force-pushes it and opens the extension PR with the report as its body, or updates its own open one, so reruns never open a second PR. Its own PR is one from this repo opened by the GitHub App it runs as (`APP_SLUG`); any other PR from a `schedule/extend` branch is ignored. Once anyone else has committed to its PR, the cron never regenerates or force-pushes it again: it only comments that the schedule needs extending, so hand curation is kept. Under 365 days left, it also turns on auto-merge, so the PR merges once the checks pass. `--dry-run` only looks up the open PR (needs `gh` and `APP_SLUG`) and prints what it would do.
