# Kommun boundaries and satellite imagery for Åkle: sources and terms

Research for [#3](https://github.com/grehnen/akle/issues/3). Researched 2026-10-18.

**Question:** Which sources can supply (a) boundary shapes for all Swedish kommuner and (b) a satellite-image background of Sweden for a static, client-only React app on Cloudflare Workers? For each source: license and attribution, cost and rate limits, whether it can be self-hosted or pre-rendered, and file size.

## TL;DR

- **Kommunle** takes its boundaries from **SCB** (CC0). Its satellite pictures are **one 600×600 JPEG per kommun**, rendered with the **Mapbox Static Images API** from a custom Mapbox satellite style and committed to the repo. They are not a single background of Sweden. Kommunle's code is MIT and can be reused with the license notice kept. The images contain Mapbox content and are not covered by the MIT license. Mapbox's current Product Terms forbid storing or redistributing that content, so do not copy them.
- **Boundaries:**
  - **SCB "Digitala gränser"** is CC0, has no attribution requirement, needs no account and is a direct download (about 104 KB zipped for the kommun layer). It has all 290 kommuner but is heavily generalised (9,748 vertices in total). Neighbouring polygons share exact vertices, so adjacency can be computed from it.
  - **Lantmäteriet "Kommun, län och rike"** is more detailed (about 6 MB zipped GeoPackage). It needs a Geotorget account and product authorisation, and its STAC metadata says CC BY 4.0.
  - **OpenStreetMap** has 290 `admin_level=7` relations tagged with `ref:scb`. Its license is ODbL: attribution is required and share-alike applies to derived databases.
- **Satellite background:** the sources that clearly allow pre-rendering and self-hosting as static assets are:
  - **EOX Sentinel-2 cloudless 2016** (CC BY 4.0)
  - **Your own Sentinel-2 mosaic** (Copernicus data is free and open, with attribution)
  - **NASA Blue Marble** (no US copyright, but only 500 m resolution)
  - **Lantmäteriet ortofoto** (CC BY 4.0 per STAC, account needed; very high resolution and very large)

  EOX cloudless for 2018–2025 is **non-commercial only** (CC BY-NC-SA 4.0). **Mapbox, MapTiler and Esri** may only be used live through their APIs. Their terms forbid caching on a server or turning their content into static images, and the free tiers carry quotas, plus a non-commercial restriction for MapTiler's free plan.
- **Cloudflare Workers static assets** allow 20,000 files on the free plan (100,000 on paid) and 25 MiB per file. A Sweden XYZ tile pyramid up to z10 is about 4,600 tiles, which fits. A single large PMTiles/MBTiles archive would exceed 25 MiB and would need R2 instead.

## 1. What Kommunle uses

Kommunle's repository is [aommm/kommunle](https://github.com/aommm/kommunle), a fork of Worldle by teuteuf.

| Item | Finding | Source |
| --- | --- | --- |
| Code license | MIT, "Copyright (c) 2022 teuteuf" | [`LICENSE`](https://github.com/aommm/kommunle/blob/main/LICENSE) |
| Boundary data | SCB "Digitala gränser" ArcView shapefile, snapshot `shape_svenska_210505` (2021-05-05), committed to the repo (`data/shape_svenska_210505/KommunSweref99TM.zip`, 104 KB) | [`data/README.md`](https://github.com/aommm/kommunle/blob/main/data/README.md), repo tree |
| Kommun coordinates | Exported as KML from Swedish Wikipedia's category "Sveriges kommuner", then manually wrangled | [`data/README.md`](https://github.com/aommm/kommunle/blob/main/data/README.md) |
| Satellite images | `data/generate_images.py`:<br>1. reads the SCB shapefile with `pyshp` and converts SWEREF 99 TM to WGS84 with `sweref99`<br>2. simplifies each polygon to about 30 vertices (Visvalingam–Wyatt)<br>3. requests a **Mapbox Static Images API** render of a custom style (`aommm/cl1rswpq7002v14mqhkea8bt8`, "satellite"), with the kommun drawn as a GeoJSON overlay (white fill at 0.2 opacity, 2 px stroke)<br>4. writes `public/images/countries/<Kommun>-satellite.png` | [`data/generate_images.py`](https://github.com/aommm/kommunle/blob/main/data/generate_images.py) |
| Image format and size | 291 files each in `public/` and `docs/` (the built GitHub Pages copy). They are JPEG data despite the `.png` extension, 600×600 px, about 40–150 KB each, about 32 MB per copy. | Repo tree via GitHub API; inspected `Kiruna-satellite.png` |
| Attribution in the UI | No Mapbox/OSM/SCB credit text was found in `Game.tsx` or `Infos.tsx`. The Static Images API burns attribution into the image by default (`attribution=true`). | Repo source; [Mapbox Static Images API docs](https://docs.mapbox.com/api/maps/static-images/) |

**Can Åkle reuse it?**

- **Code (MIT):** yes, as long as the copyright and permission notice is kept.
- **SCB shapefile:** yes. SCB data is CC0, so it is reusable, but take the current file straight from SCB (the 2021 snapshot is outdated).
- **Satellite JPEGs:** no. They are Mapbox "Licensed Map Content". Mapbox Product Terms (version dated July 21, 2026) say:
  - §1.9(v): the customer shall "not export, download, cache or store Licensed Map Content".
  - §1.10: no redistribution.
  - §2.8.1: the customer "shall not distribute Licensed Map Content, including from a cache, by proxying, or by using a screenshot or other static image instead of accessing Licensed Map Content directly from the Mapping APIs".

  The MIT license cannot grant rights to that content ([Mapbox Product Terms PDF](https://cdn.prod.website-files.com/609ed46055e27a02ffc0749b/6a60463142f6478d57642594_Mapbox%20Product%20Terms%20(July%2021%2C%202026).pdf)).
- **Fit:** Kommunle shows one cropped kommun at a time. Åkle wants a single map of Sweden as the background, so the images do not fit the use case anyway.

## 2. Kommun boundary sources

| Source | License and attribution | Access, cost, limits | Self-host / pre-render | Size and quality |
| --- | --- | --- | --- | --- |
| **SCB – Digitala gränser** ([page](https://www.scb.se/hitta-statistik/regional-statistik-och-kartor/regionala-indelningar/digitala-granser/)) | **CC0**, no attribution required. SCB suggests "Källa: SCB" / "Source: Statistics Sweden" if you credit. | Free direct download, no account. Current file: `shape_svenska_260225.zip` (Shapefile) or `tab_svenska_260225.zip` (MapInfo). | Yes. Convert once to GeoJSON/TopoJSON and bundle it. | Zip 215 KB; kommun layer `Kommun_Sweref99TM.zip` 104 KB (`.shp` 172 KB). 290 kommuner, 314 polygon parts, **9,748 vertices total**, SWEREF 99 TM (EPSG:3006), fields `KnKod`, `KnNamn`. SCB itself warns these are "enkla kommun- och länsgränser anpassade för tematisering av statistik … inte lämpliga för analyser". |
| **Lantmäteriet – Kommun, län och rike** (STAC collection `kommun-lan-rike` at `https://api.lantmateriet.se/stac-vektor/v1`) | STAC metadata: **`CC-BY-4.0`**. It is a "värdefull datamängd" (EU High-Value Dataset). Lantmäteriet's page says these "kan vi inte benämna … öppna data" because conditions vary; credit Lantmäteriet. Note: Lantmäteriet's general *open data* page says CC0, but that applies to products labelled "öppna data", not to this one. | Free, but needs a Geotorget account plus per-product authorisation and acceptance of the terms. An anonymous download returned **HTTP 401**. | Yes once downloaded (the CC BY 4.0 license permits redistribution with attribution). | Zipped GeoPackage: `aktuell` 6.0 MB, `2026` 6.2 MB; historical editions back to 1971. Much more detailed than SCB, so it would need simplification for the web. |
| **OpenStreetMap** ([copyright](https://www.openstreetmap.org/copyright)) | **ODbL 1.0**. You must credit "© OpenStreetMap contributors" and make clear the data is available under ODbL. Share-alike applies to derived *databases* (a derived boundary/adjacency dataset would count). | Free. Pull via Overpass or Geofabrik extracts. The OSMF's own API/tile servers are not for heavy third-party use. | Yes (redistribute under ODbL). | An Overpass query (2026-10-18) returned **290** `boundary=administrative` + `admin_level=7` relations in Sweden, each with a `ref:scb` code. Full geometry is detailed (MB scale before simplification). Coastline and sea handling should be checked before use. |
| Kommunle's committed copy | Same as SCB (CC0) | — | — | 2021-05-05 snapshot; prefer the current SCB file. |

**Adjacency check on SCB data.** I parsed the current `Kommun_Sweref99TM.shp` and looked for kommuner that share vertices:

- **728** kommun pairs share at least one exact vertex; **690** share at least two (≥2 approximates a real shared edge rather than a corner touch).
- Five kommuner share no vertex with any other: **Ekerö, Lidingö, Gotland, Öckerö, Tjörn**. These are island kommuner reached by bridge or ferry. This list differs from the "only Gotland and Öckerö" assumption in `docs/initial-prompt.md`.

## 3. Satellite background sources

| Source | License and attribution | Cost and limits | Self-host / pre-render as static assets | Resolution and size |
| --- | --- | --- | --- | --- |
| **EOX Sentinel-2 cloudless 2016** (WMTS layer `s2cloudless` / `s2cloudless_3857`) ([license page](https://cloudless.eox.at/license-non-commercial)) | **CC BY 4.0**. Attribution must be "displayed legibly and in proximity to the usage". Use EOX's text for 2016, which includes "Contains modified Copernicus Sentinel data 2016". | Public WMTS/WMS at `tiles.maps.eox.at`. EOX says "Feel free to use the provided service endpoints … directly in your application". Max request size 4096 px; stitch multiple requests if larger. | **Yes.** CC BY allows copying and adapting, so tiles or a single rendered image can be stored on Cloudflare. | About 10 m source resolution. My measurement: 28 z6 tiles covering Sweden = 303 KB (about 11 KB/tile, 256 px JPEG, much of it sea). Tile counts for the Sweden bbox (10.9–24.2°E, 55.3–69.1°N): z7 72, z8 242, z9 880, z10 3,306, z11 13,148. z0–z10 is about 4,600 tiles, roughly **tens of MB** (estimate; land tiles are larger at higher zoom). |
| **EOX Sentinel-2 cloudless 2017–2025** (layers `s2cloudless-2017`…`-2025`) | **CC BY-NC-SA 4.0** for 2018–2025 per EOX's license page (the 2018 attribution covers 2017–2018 data). Non-commercial only; share-alike. Commercial use requires buying a license from EOX. | Same endpoints. | Allowed for non-commercial use under the license (adaptations must be shared under the same license). | Same as above; newer and less cloudy. |
| **Own mosaic from Copernicus Sentinel-2** ([legal notice](https://sentinels.copernicus.eu/documents/247904/690755/Sentinel_Data_Legal_Notice)) | Free, full and open. You must credit "Contains modified Copernicus Sentinel data [Year]". | Free data; you pay in processing effort (cloud masking, mosaicking, colour balancing). | **Yes.** The output is your own. | Up to 10 m; size depends on chosen zooms (same tile maths as EOX). |
| **NASA Blue Marble Next Generation / GIBS** ([BMNG](https://science.nasa.gov/earth/earth-observatory/blue-marble-next-generation/base-map/), [media guidelines](https://www.nasa.gov/nasa-brand-center/images-and-media/), [GIBS](https://www.earthdata.nasa.gov/engage/open-data-services-software/earthdata-developer-portal/gibs-api)) | NASA imagery is "generally … not subject to copyright in the United States". NASA "should be acknowledged as the source". Do not imply endorsement. | Free download; GIBS provides free WMTS/WMS. | **Yes.** | BMNG is **500 m/pixel**, monthly composites. All of Sweden is about 1,600 × 3,100 px, which looks coarse when zoomed in on small kommuner. Could work for a stylised whole-Sweden backdrop. |
| **Lantmäteriet Ortofoto** (STAC `https://api.lantmateriet.se/stac-bild/v1`, collections `orto-<area>-<year>`) | STAC metadata: **`CC-BY-4.0`** (värdefull datamängd); credit Lantmäteriet. | Free; Geotorget account plus authorisation (same process as the boundaries). | Yes (CC BY 4.0) after downsampling. | Aerial orthophoto delivered as COG/GeoTIFF in many regional collections. Sub-metre resolution; national coverage is very large (many GB), so it would have to be downsampled heavily. More "aerial photo" than "satellite" look. |
| **Mapbox Satellite / Static Images API** (Kommunle's source) | Mapbox ToS + Product Terms; attribution required (burned into the image by default). | Static Images: up to 50,000 requests/month free, then paid; rate limit 1,250 req/min. GL JS map loads: 50,000/month free. [Pricing](https://www.mapbox.com/pricing) | **No.** Product Terms §1.9(v), §1.10, §2.8.1 forbid caching, storing and redistributing content, including as screenshots or static images. Only live API calls, with on-device caching up to 30 days. | Static images max 1280×1280 px per request. |
| **MapTiler Satellite** ([Cloud terms](https://www.maptiler.com/terms/cloud/), [attribution](https://www.maptiler.com/copyright/)) | Must show "© MapTiler © OpenStreetMap contributors" (plus imagery-provider credits listed on the copyright page). The free plan also requires the MapTiler logo. | Free plan: "limited to non-commercial use and research & development"; monthly quotas ([pricing](https://www.maptiler.com/cloud/pricing/)). | **No.** "It is prohibited to store, save, and/or redistribute any map content from a server-side cache … or by using a screenshot or other static image." Only a temporary personal browser cache is allowed. Self-hostable offline satellite data is a separate paid product. | Live tiles only. |
| **Esri World Imagery** ([item](https://www.arcgis.com/home/item.html?id=10df2279f9684e4a9f6a7f08febac2a9)) | Esri Master License Agreement; credit "Esri, Vantor, Earthstar Geographics, and the GIS User Community". | ArcGIS Location Platform: 2,000,000 basemap tiles/month free, then $0.15 per 1,000 ([pricing](https://location.arcgis.com/pricing/)). Requires an API key. | **No.** The item says the layer "is not intended to be used to export tiles for offline". The "for Export" variant is for offline use *in ArcGIS applications*. | Live tiles only. |

## 4. Hosting constraints on Cloudflare Workers

From [Workers limits](https://developers.cloudflare.com/workers/platform/limits/), last updated 2026-10-12:

- Static asset files per Worker version: **20,000 (Free) / 100,000 (Paid)**.
- Individual static asset file size: **25 MiB**.

What this means for imagery:

- An XYZ pyramid of Sweden up to z10 (about 4,600 files) fits the free plan.
- z11 adds about 13,000 more, which reaches the free limit.
- A single high-resolution background image or archive must stay under 25 MiB to be served as a static asset; anything larger would need R2 or similar.
- Boundary GeoJSON/TopoJSON derived from SCB is well under 1 MB.

## 5. Open points surfaced (not decided here)

- **Commercial or not?** Whether Åkle counts as commercial (ads, donations) decides whether EOX 2018+ and MapTiler's free plan are usable at all.
- **Detail level:** is SCB's generalised boundary (about 34 vertices per kommun on average) detailed enough visually and for adjacency, or is Lantmäteriet/OSM detail needed (which means a simplification pipeline)?
- **Island kommuner:** five kommuner (Ekerö, Lidingö, Gotland, Öckerö, Tjörn) have no land neighbour in the SCB data. This affects the bridge/ferry curation idea in `docs/initial-prompt.md`.
- **Imagery style and rendering approach:** one static image of Sweden, or a zoomable tile pyramid (and to which zoom)? This drives size and the 20,000-file limit.
- **Lantmäteriet license wording:** STAC metadata (CC BY 4.0) and the "open data" page (CC0) disagree in scope. Confirm in Geotorget's product terms before relying on it.
