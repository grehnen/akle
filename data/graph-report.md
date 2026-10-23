# Neighbor graph report: osm-2026-10-01-b

Written by `bun run graph:build` and `bun run graph:review` from the graph version and `data/neighbor-overrides.yaml` (ADR 0003). Don't edit it by hand: `bun run graph:check` fails when it's out of date.

Graph version `osm-2026-10-01-b` starts at puzzle #25. 290 kommuner, 709 neighbor pairs: 695 land, 696 fixed, 3 ferry links.

## Problems

None.

## Flagged pairs

10 flagged pairs, 0 without a verdict.

The pairs are split by what the build decided on its own; a keep verdict leaves that as it is, and the build column says which links it made.

### Neighbors in the build (6)

| Pair | Codes | Flags | Measurements | Map | Build | Verdict |
| --- | --- | --- | --- | --- | --- | --- |
| Enköping–Strängnäs | 0381-0486 | island-border | land border 408 m (0 m mainland, 408 m islands); ways [58916726](https://www.openstreetmap.org/way/58916726) | [map](https://www.openstreetmap.org/?mlat=59.51194&mlon=17.03878#map=17/59.51194/17.03878) | neighbors (fixed) | keep: The OSM boundaries share only 408 m of land border, all on islands in Mälaren and none on the mainland. Riksväg 55 (way 58916726) crosses that border on a Mälaren island of 1 km² or more, which Hjulstabron joins to Enköping's mainland and Strängnäsbron to Strängnäs's; that road link makes them neighbors. |
| Ale–Kungälv | 1440-1482 | river-border | land border 0 m; river border 18695 m | [map](https://www.openstreetmap.org/?mlat=57.90685&mlon=12.04664#map=17/57.90685/12.04664) | neighbors (land) | keep: Their OSM boundaries share no land, only an 18695 m border in Göta älv's river area (relation 56230), so the build makes them land neighbors. |
| Storfors–Degerfors | 1760-1862 | short-border | land border 64 m; ways [1201771779](https://www.openstreetmap.org/way/1201771779) | [map](https://www.openstreetmap.org/?mlat=59.31807&mlon=14.32572#map=17/59.31807/14.32572) | neighbors (land, fixed) | keep: The OSM boundaries share a 64 m land border on the mainland, so they are land neighbors; a qualifying fixed link, way 1201771779, also crosses it. |
| Falun–Hedemora | 2080-2083 | point-touch | touches at one point | [map](https://www.openstreetmap.org/?mlat=60.61031&mlon=16.13649#map=17/60.61031/16.13649) | neighbors (land) | keep: The OSM boundaries meet at a single point on the mainland, the corner where Falun, Hedemora, Säter and Hofors meet, so they are land neighbors. |
| Säter–Hofors | 2082-2104 | point-touch | touches at one point | [map](https://www.openstreetmap.org/?mlat=60.61031&mlon=16.13649#map=17/60.61031/16.13649) | neighbors (land) | keep: The OSM boundaries meet at a single point on the mainland, the corner where Falun, Hedemora, Säter and Hofors meet, so they are land neighbors. |
| Sorsele–Arvidsjaur | 2422-2505 | river-border | land border 0 m; river border 7264 m | [map](https://www.openstreetmap.org/?mlat=65.54777&mlon=18.21663#map=17/65.54777/18.21663) | neighbors (land) | keep: Their OSM boundaries share no land, only a 7264 m border in the river area of relation 2343268, so the build makes them land neighbors. |

### Not neighbors in the build (4)

| Pair | Codes | Flags | Measurements | Map | Build | Verdict |
| --- | --- | --- | --- | --- | --- | --- |
| Håbo–Knivsta | 0305-0330 | non-qualifying-link | land border 0 m; ways [956692672](https://www.openstreetmap.org/way/956692672); not qualifying: [956692672](https://www.openstreetmap.org/way/956692672) service=driveway, an end off the mainland and islands of 1 km² or more | [map](https://www.openstreetmap.org/?mlat=59.73681&mlon=17.6277#map=17/59.73681/17.6277) | not neighbors | keep: Linked only by way 956692672, a short unpaved private driveway bridge to an islet under 1 km²; not a public link to meaningful land, so they aren't neighbors. |
| Strängnäs–Västerås | 0486-1980 | island-border | land border 328 m (0 m mainland, 328 m islands) | [map](https://www.openstreetmap.org/?mlat=59.48324&mlon=16.91903#map=17/59.48324/16.91903) | not neighbors | keep: The OSM boundaries share only 328 m of land border, all on islands in Mälaren and none on the mainland, and no fixed link joins them, so they aren't neighbors. |
| Lilla Edet–Alingsås | 1462-1489 | exclave-border | land border 1003 m; all on an exclave of Lilla Edet | [map](https://www.openstreetmap.org/?mlat=58.05616&mlon=12.41988#map=17/58.05616/12.41988) | not neighbors | keep: Their 1003 m land border lies wholly on an exclave of Lilla Edet, away from its main part, and no fixed link joins them, so they aren't neighbors. |
| Smedjebacken–Borlänge | 2061-2081 | exclave-border | land border 2968 m; all on an exclave of Borlänge | [map](https://www.openstreetmap.org/?mlat=60.27258&mlon=15.40611#map=17/60.27258/15.40611) | not neighbors | keep: Their 2968 m land border lies wholly on an exclave of Borlänge, away from its main part, and no fixed link joins them, so they aren't neighbors. |

## Changes since the previous graph version (osm-2026-10-01)

### Added (0)

None.

### Removed (0)

None.
