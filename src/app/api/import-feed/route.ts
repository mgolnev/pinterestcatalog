import {
  importFeedGET,
  importFeedPOST,
} from "@/lib/server/import-feed-http";

export const runtime = "nodejs";
export const maxDuration = 300;

export const POST = importFeedPOST;
export const GET = importFeedGET;
