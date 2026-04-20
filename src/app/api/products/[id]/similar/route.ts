import { NextResponse } from "next/server";
import { getSimilarProducts } from "@/lib/feed/similar";
import { parseExcludeIds, parseLimit, parseSection } from "@/lib/api/parse";

export const runtime = "nodejs";

export async function GET(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;
  const url = new URL(req.url);
  const section = parseSection(url.searchParams.get("section"));
  const sessionId = url.searchParams.get("session_id")?.trim();
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

  const limit = parseLimit(url.searchParams.get("limit"), 40, 40);
  const exclude = parseExcludeIds(url);
  const feedVersion = url.searchParams.get("feed_version");

  const res = getSimilarProducts({
    productId: id,
    section,
    limit,
    excludeProductIds: exclude,
    feedVersion,
  });

  return NextResponse.json({
    items: res.items.map((i) => ({
      id: i.id,
      main_image_url: i.main_image_url,
      image_aspect_ratio: i.image_aspect_ratio,
      score: i.score,
    })),
    strategy: res.strategy,
    fallback_used: res.fallback_used,
  });
}
