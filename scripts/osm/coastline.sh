#!/bin/sh
# Assembles land polygons from the coastline, after the build has written the ways to drop
# (coastline-dropped.txt) and the way closing the mainland (coastline-closure.opl).
# Usage: coastline.sh <directory written by extract.sh>
set -eu

out="$1"
osmium removeid --overwrite -i "$out/coastline-dropped.txt" "$out/coastline.pbf" \
  -o "$out/coastline-kept.pbf"
osmium sort --overwrite "$out/coastline-kept.pbf" "$out/coastline-closure.opl" \
  -o "$out/coastline-closed.pbf"

# Exit code 1 means warnings only. --max-points=0 keeps each landmass one polygon, so the build
# can tell a small island by its area.
status=0
osmcoastline --overwrite --close-distance=0 --max-points=0 --output-polygons=land \
  --output-database="$out/coastline.db" "$out/coastline-closed.pbf" \
  > "$out/osmcoastline.log" 2>&1 || status=$?
if [ "$status" -gt 1 ]; then
  cat "$out/osmcoastline.log"
  exit "$status"
fi
rm -f "$out/land.geojsonseq"
ogr2ogr -f GeoJSONSeq "$out/land.geojsonseq" "$out/coastline.db" land_polygons
