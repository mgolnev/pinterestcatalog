import { NextResponse } from "next/server";
import { getDb, getMeta } from "@/lib/db";
import {
  CANONICAL_PRODUCT_ASPECT_RATIO,
  inferAspectRatioFromImageUrl,
} from "@/lib/feed/aspect";
import { resolveFeedVersion } from "@/lib/feed/feed-query";

export const runtime = "nodejs";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;
  const url = new URL(_req.url);
  const feedVersion =
    resolveFeedVersion(url.searchParams.get("feed_version")) ??
    getMeta("active_feed_version") ??
    null;

  const db = getDb();
  const row = (
    feedVersion
      ? db
          .prepare(
            `SELECT id, name, price, old_price, currency, image_urls, category_path, product_url, availability_status, publication_status
             FROM products WHERE id = ? AND feed_version = ?`
          )
          .get(id, feedVersion)
      : db
          .prepare(
            `SELECT id, name, price, old_price, currency, image_urls, category_path, product_url, availability_status, publication_status
             FROM products WHERE id = ? ORDER BY updated_at DESC LIMIT 1`
          )
          .get(id)
  ) as
    | {
        id: string;
        name: string;
        price: number | null;
        old_price: number | null;
        currency: string;
        image_urls: string;
        category_path: string;
        product_url: string;
        availability_status: string;
        publication_status: string;
      }
    | undefined;

  if (!row || row.publication_status !== "published") {
    return NextResponse.json(
      {
        error: {
          code: "not_found",
          message: "Product not available",
          request_id: crypto.randomUUID(),
        },
      },
      { status: 404 }
    );
  }

  let urls: string[] = [];
  try {
    urls = JSON.parse(row.image_urls) as string[];
  } catch {
    urls = [];
  }
  let cat: string[] = [];
  try {
    cat = JSON.parse(row.category_path) as string[];
  } catch {
    cat = [];
  }

  return NextResponse.json({
    id: row.id,
    name: row.name,
    price: row.price,
    old_price: row.old_price,
    currency: row.currency,
    images: urls.map((u) => ({
      url: u,
      aspect_ratio:
        inferAspectRatioFromImageUrl(u) ?? CANONICAL_PRODUCT_ASPECT_RATIO,
    })),
    category_path: cat,
    product_url: row.product_url,
    availability_status: row.availability_status,
  });
}
