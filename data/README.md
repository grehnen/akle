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

- `config.json`: `{ "epoch": "YYYY-MM-DD", "seed": "…" }`. The epoch is puzzle #1.
- `0001.csv`, `0002.csv`, …: chunks of 1,000 puzzles with the header `puzzle,start,destination,n` ([ADR 0001](../docs/adr/0001-pre-generated-puzzle-schedule.md)).

The current `0001.csv` is a fixture of 90 rows on the fixture graph version.
