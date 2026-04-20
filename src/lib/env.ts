import path from "node:path";

export function getDataDir(): string {
  return process.env.DATA_DIR ?? path.join(process.cwd(), "data");
}

export function getFeedUrl(): string {
  return (
    process.env.FEED_URL ??
    "https://storage-cdn11.gloria-jeans.ru/catalog/feeds/auto-merch/auto-merch-feed-cc-central.xml"
  );
}

export function getAppEnv(): string {
  return process.env.APP_ENV ?? "dev";
}
