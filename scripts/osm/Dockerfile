# Native OSM tools for the graph build (`bun run graph:build`). Versions are pinned so a rebuild gives the same output.
FROM debian:trixie-slim@sha256:62bd423aeee912639ca8ee681c2b762cb3e25137e0a92b20be455898a9f034ad

RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    osmium-tool=1.18.0-1 \
    osmcoastline=2.4.1-1 \
    gdal-bin=3.10.3+dfsg-1 \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /work
