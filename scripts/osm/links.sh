#!/bin/sh
# Cuts every road, path and railway out of a Sweden extract, the candidate fixed links, which the
# build narrows to the ways that cross a kommun border. Also cuts the road network around bridges,
# tunnels and causeways, the ways joined to them three steps out, which the build follows to see
# that each end of a link over water reaches meaningful land.
# Runs inside the tools image with the cache directory mounted at /work.
# Usage: links.sh <extract.osm.pbf> <output directory>
set -eu

extract="$1"
out="$2"
mkdir -p "$out"

osmium tags-filter --overwrite "$extract" w/highway w/railway -o "$out/ways.pbf"
osmium tags-filter --overwrite "$out/ways.pbf" \
  w/bridge w/tunnel w/causeway w/man_made=causeway w/embankment -o "$out/joined.pbf"

# Adds to joined.pbf every way that shares a node with it.
join_ways() {
  osmium cat --overwrite "$out/joined.pbf" -t node -f opl -o "$out/joined-nodes.opl"
  osmium getparents --overwrite "$out/ways.pbf" -i "$out/joined-nodes.opl" -f opl \
    -o "$out/joined-ways.opl"
  osmium getid --overwrite --add-referenced "$out/ways.pbf" -i "$out/joined-ways.opl" \
    -o "$out/joined.pbf"
}

osmium export --overwrite "$out/ways.pbf" --geometry-types=linestring \
  --config=/scripts/ways-export.json -f geojsonseq -o "$out/ways.geojsonseq"
join_ways
join_ways
join_ways
osmium export --overwrite "$out/joined.pbf" --geometry-types=linestring \
  --config=/scripts/roads-export.json -f geojsonseq -o "$out/roads.geojsonseq"
rm "$out/ways.pbf" "$out/joined.pbf" "$out/joined-nodes.opl" "$out/joined-ways.opl"
