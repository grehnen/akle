#!/bin/sh
# Cuts the layers the graph build needs out of a Sweden extract. Runs inside the tools image
# (scripts/osm/Dockerfile) with the cache directory mounted at /work.
# Usage: extract.sh <extract.osm.pbf> <output directory>
set -eu

extract="$1"
out="$2"
mkdir -p "$out"

osmium fileinfo --json "$extract" > "$out/fileinfo.json"

# Kommun boundaries: admin_level=7 relations with their member ways and nodes.
osmium tags-filter --overwrite "$extract" r/boundary=administrative -o "$out/administrative.pbf"
osmium tags-filter --overwrite "$out/administrative.pbf" r/admin_level=7 -o "$out/kommuner.pbf"
osmium export --overwrite "$out/kommuner.pbf" --geometry-types=polygon --attributes=type,id \
  -f geojsonseq -o "$out/kommuner.geojsonseq"

# Inland water areas; the build keeps lakes and leaves out rivers and canals.
osmium tags-filter --overwrite "$extract" wr/natural=water -o "$out/water.pbf"
osmium export --overwrite "$out/water.pbf" --geometry-types=polygon --attributes=type,id \
  -f geojsonseq -o "$out/water.geojsonseq"

# Coastline ways and nodes, for closing the mainland coastline (see coastline.sh).
osmium tags-filter --overwrite "$extract" w/natural=coastline -o "$out/coastline.pbf"
osmium cat --overwrite "$out/coastline.pbf" -t way -f opl -o "$out/coastline-ways.opl"
osmium cat --overwrite "$out/coastline.pbf" -t node -f opl -o "$out/coastline-nodes.opl"
