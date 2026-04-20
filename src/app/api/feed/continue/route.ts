import { NextResponse } from "next/server";
import { getContinueFeed } from "@/lib/feed/feed-query";
import { parseExcludeIds, parseLimit, parseSection } from "@/lib/api/parse";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const section = parseSection(url.searchParams.get("section"));
  const sessionId = url.searchParams.get("session_id")?.trim();
  const cursor = url.searchParams.get("cursor");
  const anchor = url.searchParams.get("anchor_product_id")?.trim();
  const posRaw = url.searchParams.get("position_index");
  const positionIndex = posRaw ? Number.parseInt(posRaw, 10) : NaN;

  if (!section || section === "unknown") {
    return NextResponse.json(
      {
        error: {
          code: "bad_request",
          message: "Invalid or missing section",
          request_id: crypto.randomUUID(),
        },
      },
      { status: 400 }
    );
  }
  if (!sessionId) {
    return NextResponse.json(
      {
        error: {
          code: "bad_request",
          message: "session_id is required",
          request_id: crypto.randomUUID(),
        },
      },
      { status: 400 }
    );
  }
  const hasAnchor =
    Boolean(anchor) && Number.isFinite(positionIndex);

  if (!cursor && !hasAnchor) {
    return NextResponse.json(
      {
        error: {
          code: "bad_request",
          message: "Provide cursor or anchor_product_id with position_index",
          request_id: crypto.randomUUID(),
        },
      },
      { status: 400 }
    );
  }

  const subsection = url.searchParams.get("subsection") ?? undefined;
  const limit = parseLimit(url.searchParams.get("limit"), 60, 40);
  const exclude = parseExcludeIds(url);
  const feedVersion = url.searchParams.get("feed_version");

  const res = getContinueFeed({
    section,
    subsection,
    cursor,
    anchorProductId: anchor,
    positionIndex: Number.isFinite(positionIndex) ? positionIndex : undefined,
    limit,
    excludeProductIds: exclude,
    sessionId,
    feedVersion,
  });

  return NextResponse.json({
    items: res.items.map((i) => ({
      id: i.id,
      main_image_url: i.main_image_url,
      image_aspect_ratio: i.image_aspect_ratio,
      position_index: i.position_index,
    })),
    next_cursor: res.next_cursor,
    feed_version: res.feed_version,
    has_more: res.has_more,
  });
}
