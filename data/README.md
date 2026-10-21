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

`graphs/fixture/` is a small hand-made version for development. Its borders and shapes are not real.

## Schedule: `schedule/`

- `config.json`: `{ "epoch": "YYYY-MM-DD", "seed": "…", "cooldownDays": 30 }`. The epoch is puzzle #1. `cooldownDays` defaults to 30; the fixture sets 3 because a 30-day cooldown can't be met with its 21 kommuner.
- `0001.csv`, `0002.csv`, …: chunks of 1,000 puzzles with the header `puzzle,start,destination,n` ([ADR 0001](../docs/adr/0001-pre-generated-puzzle-schedule.md)).

The current `0001.csv` is a fixture of 90 rows on the fixture graph version.

### Generating: `bun run schedule [--chunks k] [--now <ISO date>]`

Reconciles every unplayed row against the graph version for its puzzle number (updating N, or redrawing the pair when N leaves 3–8, an endpoint is gone or a rule is broken), then completes or adds `k` chunks (default 1; `0` only reconciles). It prints the Markdown report for the PR body. The same committed files, seed and date always give byte-identical chunks.

- Each row's draws come from sha256 of `seed:puzzle:attempt`. N is drawn uniformly from 3–8, then a pair uniformly among the least-used pairs with that N whose endpoints are outside the cooldown; when none qualifies, the next attempt redraws.
- **Played** rows (puzzle number up to today's in UTC+14, the earliest time zone) are never changed.
- Rows may be curated by hand; a rerun keeps any unplayed row that still follows the rules.

### Checking: `bun run schedule:check [--base <git revision>]`

The required schedule rules check, run in CI against the PR's base: N matches the row's graph version, N is 3–8, no pair repeats before every pair with its N is used as often, no endpoint repeats within the cooldown, puzzle numbers run 1, 2, 3, … and each row sits in its own chunk, and played rows are unchanged from the base (`HEAD` by default). Rows that were already played are exempt from the other rules.
