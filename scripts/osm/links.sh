#!/bin/sh
# Cuts the candidate fixed links out of a Sweden extract: roads, paths and railways that are
# bridges, tunnels or causeways, plus the ways joined to them (a bridge's crossing way isn't
# always tagged). Runs inside the tools image with the cache directory mounted at /work.
# Usage: links.sh <extract.osm.pbf> <output directory>
set -eu

extract="$1"
out="$2"
mkdir -p "$out"

osmium tags-filter --overwrite "$extract" w/highway w/railway -o "$out/ways.pbf"
osmium tags-filter --overwrite "$out/ways.pbf" \
  w/bridge w/tunnel w/causeway w/man_made=causeway w/embankment -o "$out/structures.pbf"
osmium cat --overwrite "$out/structures.pbf" -t node -f opl -o "$out/structure-nodes.opl"
osmium getparents --overwrite "$out/ways.pbf" -i "$out/structure-nodes.opl" -f opl \
  -o "$out/link-ways.opl"
osmium getid --overwrite --add-referenced "$out/ways.pbf" -i "$out/link-ways.opl" \
  -o "$out/links.pbf"
osmium export --overwrite "$out/links.pbf" --geometry-types=linestring --attributes=type,id \
  -f geojsonseq -o "$out/links.geojsonseq"
rm "$out/ways.pbf" "$out/structures.pbf" "$out/structure-nodes.opl" "$out/link-ways.opl" \
  "$out/links.pbf"
