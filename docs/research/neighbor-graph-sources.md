# Data sources for the kommun neighbor graph

Research for [#4](https://github.com/grehnen/akle/issues/4). Researched 2026-10-18.

**Question:** How can a build-time script produce the graph of which kommuner are neighbors? This covers (a) land borders from OSM (`admin_level=7`) or official sources (Lantmäteriet, SCB): how to compute shared borders, and how single-point touches, lakes and sea borders show up; (b) finding bridge connections automatically, and how much manual curation remains; (c) ferry routes for kommuner with no land or bridge neighbor (believed to be only Gotland and Öckerö).

This document reports facts and experiment results. It does not decide the neighbor rule; that is ticket [#6](https://github.com/grehnen/akle/issues/6).

## TL;DR

- **No source gives "land border" directly.** OSM kommun boundaries run through lakes and out to sea, so a shared OSM boundary does not mean a land border. SCB's boundaries are clipped to land, but they are so generalised that narrow straits close up and short land borders shrink to single points. A reliable land test needs **detailed boundaries plus a land/water mask**: shared border length on land must be greater than 0.
- **OSM topology makes shared borders easy to find.** In Sweden, neighbouring `admin_level=7` relations share the same boundary *ways*. In the experiment, 2,271 of 2,449 member ways belonged to exactly two kommuner. That gave **774 adjacent pairs**, plus **20 pairs that touch only at a node** (mostly quadripoints in Vänern and Vättern). The `maritime=yes` tag marks sea borders but not lake borders, and it is sometimes wrong. Västervik–Oskarshamn, Halmstad–Laholm and Uddevalla–Munkedal are tagged maritime-only, yet E22 or E6 crosses the border on land. Lake borders (Mälaren, Vänern, Vättern, Storsjön, Hjälmaren) look exactly like land borders.
- **SCB "Digitala gränser" (CC0, 104 KB)** gives **690 edge-sharing pairs and 38 point-only touches**. Five kommuner have no neighbor at all: **Gotland, Öckerö, Lidingö, Tjörn, Ekerö**. The OSM and SCB pair sets differ by about 90 pairs. These are lake/sea borders in OSM and generalisation artefacts in SCB. This is roughly the size of the "needs a better test or a human" set.
- **Bridges can be detected automatically:** look for road ways (`highway=*`) that have nodes in two kommuner, optionally where `bridge=yes`. This found Lidingöbron, Nockebybron (Ekerö), Tjörnbron (road 160), Nötesundsbron (Orust–Uddevalla), road 160 at Skåpesund (Orust–Tjörn) and Ölandsbron. It found **no road crossing** from Öckerö to any kommun. Caveat: the way that crosses the boundary is not always the one tagged `bridge=yes`, so "a road crosses the boundary, and the crossing lies over water" is a better test than the tag alone.
- **Kommuner with no land neighbor are more than two:** Gotland, Öckerö, **Lidingö, Tjörn, Orust, Ekerö**, plus the **Öland pair** (Borgholm and Mörbylånga, which border only each other). All except **Gotland and Öckerö** have a road bridge, so the belief "only Gotland and Öckerö need ferries" holds **if bridges count**.
- **Ferries:**
  - **Gotland:** the state-procured Destination Gotland routes **Visby–Nynäshamn** and **Visby–Oskarshamn** (contract with Trafikverket).
  - **Öckerö:** Trafikverket road ferries **Hönöleden** and **Björköleden** go to Lilla Varholmen in **Göteborg**. Nordöleden and line 296 stay inside Öckerö.
  - OSM `route=ferry` contains all of these, but an area filter also returns international lines passing through Gotland's sea area. Filter on where the route *ends*.
- **Tooling:** use a Geofabrik Sweden extract (about 0.9 GB `.osm.pbf`) with osmium, or Overpass for small queries (public instances were overloaded and slow during the experiment). Then shapely or turf for geometry.
- **Licenses:** OSM data is ODbL (attribution plus share-alike on derived databases). SCB data is CC0. Lantmäteriet's open data is CC0 per its open-data page, but see the note from [#3](https://github.com/grehnen/akle/issues/3) on product-level licensing.

## 1. Boundary sources

| Source | What it is | Coverage and quality | License | Source |
| --- | --- | --- | --- | --- |
| **OSM `boundary=administrative` + `admin_level=7`** | 290 relations for Sweden. Every relation has `ref:scb` (kommun code), and the codes match SCB's 290 exactly (verified in the experiment). | Detailed. Boundaries follow the legal line, including through lakes and out to the territorial sea. | ODbL 1.0 | [OSM wiki: admin_level table, Sweden row](https://wiki.openstreetmap.org/wiki/Tag:boundary%3Dadministrative) ("Kommun (290)") and the Overpass experiment below |
| **SCB "Digitala gränser"** | Shapefile/TAB, SWEREF 99 TM, `Kommun_Sweref99TM` with `KnKod`, `KnNamn` | Generalised and clipped to land. SCB: "enkla kommun- och länsgränser anpassade för tematisering av statistik. Gränserna är inte lämpliga för analyser." | CC0, no attribution required | [SCB Digitala gränser](https://www.scb.se/hitta-statistik/regional-statistik-och-kartor/regionala-indelningar/digitala-granser/) |
| **Lantmäteriet** (administrative boundaries / "Kommun, län och rike") | Exact boundaries | SCB itself points here "för kartor med exakta gränssnitt" | Lantmäteriet's open-data page says CC0. [#3's findings](https://github.com/grehnen/akle/blob/research/boundaries-and-imagery/docs/research/boundaries-and-imagery.md) found a Geotorget account requirement and CC BY 4.0 in the STAC metadata for this product. | [Lantmäteriet open data](https://www.lantmateriet.se/en/geodata/our-products/open-data/), [Geotorget product list](https://geotorget.lantmateriet.se/geodataprodukter) |

Ways to get OSM data:

- **Overpass API** is good for a one-off or for small queries. The area filter returns objects "partly or completely within" an area ([Overpass manual](https://dev.overpass-api.de/overpass-doc/en/full_data/area.html)). During this experiment overpass-api.de returned "server is currently at capacity" (HTTP 502/406), and queries took 30 s to 2 min each. A build script should not depend on it.
- **Geofabrik `sweden-latest.osm.pbf`** is 912,601,024 bytes (HTTP `Content-Length`, 2026-10-18), refreshed daily ([Geofabrik Sweden](https://download.geofabrik.de/europe/sweden.html)). Use it with **osmium-tool** (GPL; `osmium tags-filter`, `osmium export` to GeoJSON; [manual](https://osmcode.org/osmium-tool/manual.html)), or with pyosmium or GDAL's OSM driver.
- **Land/water masks:**
  - **Sea:** osmdata.openstreetmap.de **land polygons** or **water polygons**. These are built from `natural=coastline`, are ODbL, and are about 0.9 GB each as split WGS84 shapefiles ([land polygons](https://osmdata.openstreetmap.de/data/land-polygons.html)).
  - **Lakes:** coastline data does not cover lakes. Lakes need OSM `natural=water` polygons from the extract, or a Lantmäteriet topographic water layer.

## 2. Computing shared land borders

### 2.1 Methods

1. **Topological (OSM).** Neighbouring kommun relations reference the same boundary ways. Group member ways by the relations they belong to: a way in two relations is a shared border. A node in two relations with no shared way is a **single-point touch**. This needs no geometry library.
2. **Geometric (any polygon source).** For each pair of polygons, intersect their boundaries and look at the dimension of the result:
   - a line (length > 0) is a shared border
   - only points is a point touch

   Note that `shapely.touches` is true in **both** cases ("only points shared ... are on their boundaries", [shapely docs](https://shapely.readthedocs.io/en/stable/reference/shapely.touches.html)). Use `intersection(...).length`, or the DE-9IM `relate` pattern, to tell them apart. In JS, turf has [`booleanTouches`](https://turfjs.org/docs/api/booleanTouches) and [`lineOverlap`](https://turfjs.org/docs/api/lineOverlap). Use a small snapping tolerance if the source does not share vertices exactly. SCB does share vertices exactly; see 2.3.
3. **Land part of the border.** Intersect the shared border line with the land mask (land polygons minus inland water) and keep the length on land. Rules such as "length on land > 0", "> X m", or "point touches do not count" are decisions for #6.

### 2.2 Experiment: OSM topology (Overpass, 2026-10-18)

Query: `area["ISO3166-1"="SE"][admin_level=2]->.se; rel(area.se)[boundary=administrative][admin_level=7]; out body;` followed by `way(r); out body;`.

| Result | Value |
| --- | --- |
| Kommun relations | **290**, all with `ref:scb` |
| Member ways | 2,449. 2,271 are in two kommuner; 178 are in one (outer edge, i.e. national border or sea limit). |
| Pairs sharing at least one way | **774** |
| Pairs whose shared ways are all `maritime=yes` | 38, e.g. Lidingö–Stockholm, Öckerö–Göteborg, Öckerö–Kungälv, Tjörn–Stenungsund, Kalmar–Mörbylånga, Malmö–Lomma |
| Pairs touching only at a node | **20**, e.g. Mariestad–Hammarö, Gullspång–Säffle, Kristinehamn–Säffle (Vänern), Laxå–Töreboda, Karlskrona–Sölvesborg (sea) |
| Kommuner whose every shared way is `maritime=yes` | Lidingö, Orust, Tjörn, Öckerö |
| Kommuner with no shared way at all | **Gotland**. Its boundary is all sea, and its relation shares no way with any other kommun. |

How lakes and sea show up:

- **Sea.** Kommun boundaries continue out to the territorial-sea limit. Ways outside the coastline are meant to carry `maritime=yes` ("Add this tag to the ways of an administrative boundary which are located outside of the coastline", [OSM wiki Key:maritime](https://wiki.openstreetmap.org/wiki/Key:maritime)). So coastal kommuner that face each other across a bay or strait show up as adjacent. Gotland does not touch any other kommun's sea area.
- **Lakes.** Lake borders are *not* tagged maritime, so they look like land borders. Example: **Ekerö** consists only of islands in Mälaren, yet it shows nine "non-maritime" neighbours (Stockholm, Salem, Botkyrka, Huddinge, Järfälla, Upplands-Bro, Enköping, Strängnäs, Södertälje). The same happens across Vänern (e.g. Lidköping–Säffle, Lidköping–Åmål), Vättern (Hjo–Vadstena, Karlsborg–Motala) and Storsjön (Åre–Östersund).
- **Tagging is not a reliable land/water signal on its own.** Some sea ways are not tagged; for example Danderyd–Vaxholm has one untagged shared way, and the experiment found no road crossing it.

### 2.3 Experiment: SCB "Digitala gränser" (`shape_svenska_260225.zip`)

The kommun shapefile was read with pyshp. Edges shared by two polygons were counted, using exact vertex pairs.

| Result | Value |
| --- | --- |
| Pairs sharing at least one edge | **690** |
| Pairs touching only at a vertex | **38**, e.g. Danderyd–Stockholm, Sollentuna–Sundbyberg, Lund–Trelleborg, Mark–Mölndal, Skurup–Svedala |
| Kommuner with no neighbour | **Gotland, Öckerö, Lidingö, Tjörn, Ekerö** |
| Shortest shared borders | Kristinehamn–Karlskoga about 1.2 km, Sollentuna–Solna about 1.5 km, Härryda–Göteborg about 1.5 km |

The polygons are clipped to land, including Mälaren, so sea and big-lake borders disappear. That is the behaviour a land-border rule wants. But generalisation works in both directions:

- **It invents land:** Orust–Uddevalla (3.2 km), Orust–Lysekil and Värmdö–Nacka come out as edge-sharing even though Orust is an island.
- **It drops real borders to points:** for example Sollentuna–Sundbyberg and Mark–Mölndal share a way (non-maritime) in OSM but only a vertex in SCB.

Comparison, joined on `ref:scb` = `KnKod`:

- **687 pairs** are in both sets.
- **3** are SCB-only: Hudiksvall–Ånge, Töreboda–Laxå, Kristinehamn–Karlskoga. These are generalisation artefacts; OSM has a point touch or nothing.
- **87** are OSM-only: 32 maritime-only and 55 untagged. The untagged ones mix lake borders (Mälaren, Vänern, Vättern, Storsjön, Hjälmaren) with real short land borders that SCB reduced to points.

**Conclusion:** SCB alone and OSM alone each misclassify on the order of 50–90 pairs out of about 700–775. Detailed boundaries (OSM or Lantmäteriet) plus a land/water mask should settle most of them automatically. The remaining handful (narrow straits, quadripoints in lakes) is small enough to review by hand.

## 3. Detecting bridge connections

### 3.1 Method

A kommun pair has a fixed road link if some road way has nodes on both sides of their shared boundary. In Overpass:

```
rel(<A>);map_to_area->.a; rel(<B>);map_to_area->.b;
way(area.a)[highway]->.wa; way(area.b)->.wb; way.wa.wb; out tags;
```

To decide whether the link is a **bridge over water** rather than an ordinary land crossing:

- (i) check `bridge=yes` / `layer` on the crossing way or the ways next to it ([OSM wiki Key:bridge](https://wiki.openstreetmap.org/wiki/Key:bridge)), or, more robustly,
- (ii) check that the crossing point lies in water (inside the water mask) or on a maritime/lake part of the shared border.

Exclude `highway=path/footway/cycleway/track` if only roads for cars should count; whether they count is a decision for #6. Lilla Lidingöbron, for example, is foot/cycle only. Tunnels (`tunnel=yes`) are the same kind of case as bridges.

With the Geofabrik extract and no Overpass, do the same in one pass. Load all `highway=*` ways, assign each node to a kommun polygon (point-in-polygon, e.g. shapely STRtree), and record each pair (A, B) where a way's consecutive nodes fall in different kommuner, together with the crossing segment's `bridge`/`tunnel` tags and its land/water status.

### 3.2 Experiment: road crossings for island and water-only pairs (Overpass)

The first query round (the island pairs in the table) counted every `highway=*` way, including paths and cycleways. The batch run after the table excluded `path|footway|cycleway|steps|track|bridleway`.

| Pair | OSM border type | Road ways crossing | Notes |
| --- | --- | --- | --- |
| Lidingö – Stockholm | maritime | Lidingöbron (`primary`, `bridge=yes`), Lilla Lidingöbron (cycle/foot) | bridge |
| Ekerö – Stockholm | untagged (Mälaren) | Nockebybron (`secondary`, `bridge=yes`) | bridge |
| Ekerö – the other 8 Mälaren neighbours | untagged (Mälaren) | none | lake border only |
| Tjörn – Stenungsund | maritime | road 160 (`bridge=yes`), O 1158, path | Tjörnbron |
| Orust – Tjörn | maritime | road 160 (`bridge=yes`), O 1158 (not tagged bridge), path | road 160 at Skåpesund; crossing way not always tagged |
| Orust – Uddevalla | maritime | Nötesundsbron (`secondary`, `bridge=yes`), path | bridge |
| Orust – Stenungsund, Orust – Lysekil | maritime | none | sea only |
| Kalmar – Mörbylånga | maritime | Ölandsleden (`primary`, `bridge=yes`) | Ölandsbron |
| Öckerö – Göteborg, Öckerö – Kungälv | maritime | **none** | ferry only |
| Stockholm – Danderyd, Lidingö – Nacka, Vaxholm – Värmdö, … | maritime | none | sea only |
| Vaxholm – Österåker | mixed | Vaxholmsvägen, Bogesundsvägen | land |
| Nacka – Värmdö | mixed | 18 ways incl. Värmdöleden (motorway) | land (Värmdölandet is split between the two) |

The batch run covered all **38 maritime-only pairs** and all **Ekerö, Vaxholm and Värmdö pairs**: 50 pairs in total, motor roads only. Results:

- **Bridges over sea or strait (5):**
  - Lidingö–Stockholm
  - Kalmar–Mörbylånga
  - Stenungsund–Tjörn
  - Orust–Tjörn
  - Orust–Uddevalla
  - Lysekil–Uddevalla also shows a crossing: Skaftöbron, `bridge=yes`.
- **Ordinary land crossings on borders tagged maritime (3):** Västervik–Oskarshamn (E22), Halmstad–Laholm (E6/E20), Uddevalla–Munkedal (E6). These are real land borders whose single boundary way was tagged `maritime=yes`. This shows that the maritime tag is wrong in *both* directions and cannot replace a land mask.
- **No road (30 maritime-only pairs):** for example Öckerö–Göteborg, Öckerö–Kungälv, Malmö–Lomma, Höganäs–Ängelholm, all Öland–mainland pairs except Kalmar–Mörbylånga, and most Stockholm-archipelago pairs.
- **Lake pairs (Ekerö):** a road crosses for 1 of 9 (Stockholm). Danderyd–Vaxholm (untagged): no road.

### 3.3 How much manual curation remains

- **Detecting bridges is cheap and mostly automatic:** a road crosses the line, and the border there is water. The experiment found every expected bridge (Lidingö, Ekerö, Tjörn, Orust, Öland) and no false bridge for Öckerö.
- **What still needs a human:**
  - pairs where the crossing way is not itself tagged `bridge=yes` (Orust–Tjörn above)
  - whether foot/cycle-only bridges count
  - whether tunnels and causeways count, i.e. a road on a land fill (`embankment=yes`), where the border is "land" in OSM but water in reality
  - lake and river borders where a bridge crosses a river that forms the kommun border. This is very common inland, and then the pair is usually also a land neighbour.

  Expect a review list of tens of pairs, not hundreds, all from the set in §2.3 where sources disagree.
- **Bridges only matter for pairs that are not already land neighbours.** In practice that is the island cases above plus pairs across lakes, straits or rivers whose shared border is all water.

## 4. Ferries

### 4.1 Which kommuner lack land and bridge neighbours?

From the experiments:

| Kommun | Land neighbour? | Bridge? | Needs ferry? |
| --- | --- | --- | --- |
| Gotland | no (no shared boundary at all) | no | **yes** |
| Öckerö | no (maritime only: Göteborg, Kungälv) | no road crossing found | **yes** |
| Lidingö | no | Lidingöbron → Stockholm | no |
| Ekerö | no (only Mälaren) | Nockebybron → Stockholm | no |
| Tjörn | no | Tjörnbron → Stenungsund, Skåpesund → Orust | no |
| Orust | no (OSM); SCB wrongly says yes | Nötesundsbron → Uddevalla, Skåpesund → Tjörn | no |
| Borgholm and Mörbylånga (Öland) | only each other | Ölandsbron Mörbylånga → Kalmar | no (as a pair) |

So the belief in the ticket holds **if bridges count as neighbours**: only Gotland and Öckerö need ferries. Without bridges, at least five more kommuner (Lidingö, Ekerö, Tjörn, Orust and the Öland pair) would be cut off.

### 4.2 Ferry routes found (OSM `route=ferry`, endpoints mapped to kommuner with Overpass `is_in`)

| Route | Operator (OSM tags) | From → to |
| --- | --- | --- |
| Nynäshamn – Visby | Destination Gotland | Nynäshamn → Gotland |
| Oskarshamn – Visby | Destination Gotland | Oskarshamn → Gotland |
| Fårösundsleden | Trafikverket Färjerederiet | Gotland → Gotland (internal) |
| Hönöleden (Hönö Pinan – Lilla Varholmen) | Trafikverket Färjerederiet | Öckerö → Göteborg |
| Björköleden (Björkö – Lilla Varholmen) | Trafikverket Färjerederiet | Öckerö → Göteborg |
| Nordöleden; Färja 296 Öckerö–Kalvsund–Grötö | Trafikverket / Västtrafik | Öckerö → Öckerö (internal) |

- **Gotland:** Trafikverket procures the Visby–Nynäshamn and Visby–Oskarshamn traffic, operated by Destination Gotland. The contract runs to January 2027, then Alvina Shipping (with Destination Gotland as subcontractor) for 2027–2035 ([Region Gotland: Färjetrafik](https://gotland.se/utveckla-gotland/kommunikationer-till-fran-och-pa-gotland/farjetrafik)). So Gotland's ferry neighbours would be **Nynäshamn and Oskarshamn**.
- **Öckerö:** both road-ferry routes land in **Göteborg** (Lilla Varholmen, Hisingen). Kungälv shares a sea border but has no ferry in this data.

Notes on using OSM `route=ferry` ([wiki](https://wiki.openstreetmap.org/wiki/Tag:route%3Dferry)):

- An area query returns every ferry line that passes through the kommun's sea area. For Gotland that included Nynäshamn–Gdańsk, Nynäshamn–Ventspils, Travemünde–Helsinki and Travemünde–Turku, plus small passenger boats (Gotska Sandön, Karlsöarna).
- Filter on **endpoints** (first and last node, or the route relation's `from`/`to` and stop members). Also filter on `motor_vehicle`/`foot` if only car ferries should count.
- Both routes inside a kommun and international routes must be dropped.

**Trafikverket API:** Trafikverket's open API (`https://api.trafikinfo.trafikverket.se/v2/data.json`, free key from Trafikverket's data portal or Trafiklab; [Trafiklab overview](https://www.trafiklab.se/api/other-apis/trafikverket/)) has ferry objects (FerryRoute/FerryAnnouncement) for the Färjerederiet road ferries. Not verified in this research: the official schema page did not load. The procured Gotland lines are run by Destination Gotland, not Färjerederiet, so they are probably not in that dataset. With only two kommuner affected, a **hand-maintained ferry list** of about three edges (Gotland–Nynäshamn, Gotland–Oskarshamn, Öckerö–Göteborg) is the simplest option. OSM can serve as a cross-check.

## 5. Licenses and attribution

- **OSM (ODbL 1.0):** "You are free to copy, distribute, transmit and adapt our data, as long as you credit OpenStreetMap and its contributors. If you alter or build upon our data, you may distribute the result only under the same license." ([openstreetmap.org/copyright](https://www.openstreetmap.org/copyright))
  - A neighbour list derived from OSM and shipped inside the app is very likely a *Derivative Database*. It would then need to be offered under ODbL, while the game itself can be a *Produced Work* with attribution. See the [OSMF attribution guidelines](https://osmfoundation.org/wiki/Licence/Attribution_Guidelines) and the [Produced Work guideline](https://osmfoundation.org/wiki/Licence/Community_Guidelines/Produced_Work_-_Guideline).
  - The UI needs a "© OpenStreetMap contributors" credit that links to the copyright page.
  - Land and water polygons from osmdata.openstreetmap.de are also ODbL.
- **SCB Digitala gränser:** CC0. Attribution is optional; SCB suggests "Källa: SCB".
- **Lantmäteriet open data:** CC0 per the open-data page. Check each product's license (see #3).
- **Tools:** osmium-tool is GPL (only matters if redistributed; running it at build time is fine). shapely is BSD, turf is MIT, pyshp is MIT.

## 6. Suggested pipeline shape (not built)

1. Download the Geofabrik Sweden extract (or the Lantmäteriet boundaries) and the land/water masks.
2. Build 290 kommun polygons, keyed by `ref:scb`.
3. Find shared borders topologically or geometrically, and classify each part as land / lake / sea using the mask.
4. Find road crossings of each shared border and mark the ones over water as bridges.
5. Add a small hand-curated overrides file (ferries plus reviewed edge cases).
6. Emit `neighbors.json`, plus a diff report against the previous build and against SCB, so changes can be reviewed.

## Open questions surfaced

- Should a border that is only water (a lake or sea strait with no bridge) count as a neighbour? This applies to pairs such as Ekerö–Salem across Mälaren and Lidköping–Åmål across Vänern. → #6
- Do point touches count? There are 20 in OSM and 38 in SCB, many of them quadripoints in lakes. → #6
- Do foot/cycle-only bridges, tunnels and causeways count, and do passenger-only ferries? → #6
- OSM (ODbL, share-alike on the shipped neighbour list) or Lantmäteriet (CC0 / CC BY 4.0, account needed) as the boundary source for the graph? This should probably be decided together with the boundary-shape source from #3, so that the map and the graph agree.
- How should the build pipeline get OSM data reliably, given that the public Overpass instances were overloaded? Options: a Geofabrik extract in CI (about 0.9 GB download) or a committed, reviewed snapshot of the graph.
