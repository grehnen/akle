// PROTOTYPE: converts SCB kommun shapes (CC0, via Kommunle's 2021 snapshot) to GeoJSON + a rough neighbor list.
import { open } from "shapefile";
import proj4 from "proj4";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { $ } from "bun";

const dir = mkdtempSync(join(tmpdir(), "scb-"));
await $`unzip -o -q data/KommunSweref99TM.zip -d ${dir}`;
proj4.defs("EPSG:3006", "+proj=utm +zone=33 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs");
const toWgs = proj4("EPSG:3006", "EPSG:4326");

const source = await open(join(dir, "Kommun_Sweref99TM_region.shp"), join(dir, "Kommun_Sweref99TM_region.dbf"), { encoding: "windows-1252" });
const features = [];
const vertexOwners = new Map();
for (let r = await source.read(); !r.done; r = await source.read()) {
  const { KnKod: code, KnNamn: name } = r.value.properties;
  const rings = r.value.geometry.type === "Polygon" ? [r.value.geometry.coordinates] : r.value.geometry.coordinates;
  for (const polygon of rings)
    for (const ring of polygon)
      for (const [x, y] of ring) {
        const key = `${Math.round(x)},${Math.round(y)}`;
        if (!vertexOwners.has(key)) vertexOwners.set(key, new Set());
        vertexOwners.get(key).add(code);
      }
  const project = (ring) => ring.map((p) => toWgs.forward(p).map((v) => +v.toFixed(5)));
  const geometry =
    r.value.geometry.type === "Polygon"
      ? { type: "Polygon", coordinates: r.value.geometry.coordinates.map(project) }
      : { type: "MultiPolygon", coordinates: r.value.geometry.coordinates.map((poly) => poly.map(project)) };
  features.push({ type: "Feature", id: Number(code), properties: { code, name }, geometry });
}

const neighbors = Object.fromEntries(features.map((f) => [f.properties.code, new Set()]));
for (const owners of vertexOwners.values())
  for (const a of owners) for (const b of owners) if (a !== b) neighbors[a].add(b);

// Hand-added links for islands SCB leaves isolated (rough, prototype only).
const byName = Object.fromEntries(features.map((f) => [f.properties.name, f.properties.code]));
const manual = [
  ["Lidingö", "Stockholm"], ["Ekerö", "Stockholm"], ["Ekerö", "Upplands-Bro"], ["Tjörn", "Stenungsund"],
  ["Tjörn", "Orust"], ["Öckerö", "Göteborg"], ["Gotland", "Nynäshamn"], ["Gotland", "Oskarshamn"],
];
for (const [a, b] of manual) {
  neighbors[byName[a]].add(byName[b]);
  neighbors[byName[b]].add(byName[a]);
}

writeFileSync("public/kommuner.geojson", JSON.stringify({ type: "FeatureCollection", features }));
writeFileSync("public/neighbors.json", JSON.stringify(Object.fromEntries(Object.entries(neighbors).map(([k, v]) => [k, [...v]]))));
const isolated = Object.entries(neighbors).filter(([, v]) => v.size === 0).map(([k]) => features.find((f) => f.properties.code === k).properties.name);
console.log(`${features.length} kommuner, isolated: ${isolated.join(", ") || "none"}`);
