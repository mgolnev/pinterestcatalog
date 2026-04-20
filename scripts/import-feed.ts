import fs from "node:fs";
import path from "node:path";
import { fetchFeedXml, importFeedFromXml } from "../src/lib/feed/import-feed";
import { getFeedUrl } from "../src/lib/env";

async function main() {
  const arg = process.argv[2];
  let xml: string;
  if (arg) {
    const p = path.resolve(arg);
    xml = fs.readFileSync(p, "utf8");
  } else {
    const url = getFeedUrl();
    console.log("Fetching feed from", url);
    xml = await fetchFeedXml(url);
  }
  const res = importFeedFromXml(xml);
  console.log("Import OK:", res);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
