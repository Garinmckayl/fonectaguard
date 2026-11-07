// Dev tool: probe OpenStreetMap + Trade Register lookups for a business (real network).
import { findOsm } from "../src/lib/osm";
import { lookupRegistry } from "../src/lib/registry";
const [name, city, website, address] = process.argv.slice(2);
(async () => {
  const osm = await findOsm({ name, city, website, address });
  console.log("OSM:", osm ? { url: osm.url, name: osm.name, missing: osm.missing, fields: Object.fromEntries(Object.entries(osm.extraction).map(([k, v]) => [k, v!.raw])) } : null);
  console.log("PRH:", await lookupRegistry({ name, city, website, address }));
})();
