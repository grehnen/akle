# Kommun boundaries and the neighbor graph come from OpenStreetMap

Both the neighbor graph and the kommun shapes drawn on the map are built from OSM `admin_level=7` boundaries, keyed by their `ref:scb` kommun code. The graph uses OSM's land/water masks (sea and every lake) for the land-border test and OSM roads to detect fixed links. The drawn shapes are the same boundaries with the sea and large lakes (about ≥ 10 km²) cut out, then simplified. We chose OSM over the CC0 SCB boundaries even though it brings ODbL share-alike. SCB's generalisation turns real borders into fake point touches and closes narrow straits, so it can't decide land borders. Detecting fixed links needs OSM roads anyway, which makes the graph an ODbL derivative whatever the boundary source. Using one source for both the graph and the shapes means a border the player sees always agrees with the graph.

## Considered Options

- **SCB Digitala gränser (CC0):** too generalised for the land test (see [What exactly makes two kommuner neighbors?](https://github.com/grehnen/akle/issues/6)); kept only as a cross-check in the build report. The cross-check was dropped on 2026-10-22 for producing only false positives ([ADR 0003](./0003-committed-human-reviewed-neighbor-graph.md)).
- **Lantmäteriet "Kommun, län och rike":** detailed, but needs a Geotorget account and its license is ambiguous (CC0 on the open-data page, CC BY 4.0 in the STAC metadata). It would still need OSM for water and roads, so ODbL would apply anyway.

## Consequences

- The shipped graph and shape files are ODbL and must be offered under that license. The map's attribution control shows "© OpenStreetMap contributors" next to the EOX credit, and the app has a credits note.
- The code's license and the repo's visibility are not affected.
