import { getDb, getMeta } from "@/lib/db";
import type { RootSection } from "@/lib/types";
import { feedRankToken, sessionBucketFromSessionId } from "@/lib/feed/crypto-rank";
import {
  decodeFeedCursor,
  encodeFeedCursor,
  type FeedCursorPayload,
} from "@/lib/feed/cursor";
import { applyVisualRhythm } from "@/lib/feed/visual-rhythm";

export type FeedTileRow = {
  id: string;
  main_image_url: string;
  image_aspect_ratio: number | null;
  position_index: number;
};

type ProductRow = {
  id: string;
  main_image_url: string | null;
  main_image_aspect_ratio: number | null;
  leaf_category: string | null;
  normalized_color: string | null;
  product_type: string | null;
  category_path: string;
};

export function resolveFeedVersion(requested?: string | null): string | null {
  const active = getMeta("active_feed_version");
  if (requested && active && requested === active) return requested;
  return active ?? null;
}

function subsectionSql(
  section: RootSection,
  subsection: string | undefined
): { clause: string; params: Record<string, string | null> } {
  if (!subsection) {
    return { clause: "1 = 1", params: {} };
  }
  if (section === "kids" || section === "teens") {
    return {
      clause: "subsection = @subsection",
      params: { subsection },
    };
  }
  return { clause: "1 = 1", params: {} };
}

export function loadEligibleProducts(
  feedVersion: string,
  section: RootSection,
  subsection: string | undefined,
  excludeIds: Set<string>
): ProductRow[] {
  const db = getDb();
  const sub = subsectionSql(section, subsection);
  const rows = db
    .prepare(
      `SELECT id, main_image_url, main_image_aspect_ratio, leaf_category, normalized_color, product_type, category_path
       FROM products
       WHERE feed_version = @fv
         AND publication_status = 'published'
         AND availability_status = 'in_stock'
         AND main_image_url IS NOT NULL
         AND root_section = @section
         AND ${sub.clause}`
    )
    .all({
      fv: feedVersion,
      section,
      ...sub.params,
    }) as ProductRow[];

  const filtered = rows.filter((r) => r.main_image_url && !excludeIds.has(r.id));

  return filtered;
}

export function sortByFeedRank(
  rows: ProductRow[],
  feedVersion: string,
  section: RootSection,
  subsection: string | undefined,
  sessionId: string
): ProductRow[] {
  const sessionBucket = sessionBucketFromSessionId(sessionId);
  const sec = section;
  const sub = subsection ?? "";
  return [...rows].sort((a, b) => {
    const ka = feedRankToken(a.id, feedVersion, sec, sub, sessionBucket);
    const kb = feedRankToken(b.id, feedVersion, sec, sub, sessionBucket);
    if (ka !== kb) return ka < kb ? -1 : 1;
    return a.id.localeCompare(b.id);
  });
}

export function getFeedPage(input: {
  section: RootSection;
  subsection?: string;
  cursor: string | null;
  limit: number;
  excludeProductIds: string[];
  sessionId: string;
  feedVersion: string | null;
}): { items: FeedTileRow[]; next_cursor: string | null; feed_version: string; has_more: boolean } {
  const fv = resolveFeedVersion(input.feedVersion);
  if (!fv) {
    return { items: [], next_cursor: null, feed_version: "", has_more: false };
  }

  const exclude = new Set(input.excludeProductIds);
  const decoded = decodeFeedCursor(input.cursor);
  let idx =
    decoded &&
    decoded.fv === fv &&
    decoded.sec === input.section &&
    (decoded.sub ?? "") === (input.subsection ?? "") &&
    decoded.sid === input.sessionId
      ? decoded.o
      : 0;

  const fullPool = sortByFeedRank(
    loadEligibleProducts(fv, input.section, input.subsection, new Set()),
    fv,
    input.section,
    input.subsection,
    input.sessionId
  );

  const collected: { row: ProductRow; fullIndex: number }[] = [];
  while (collected.length < input.limit && idx < fullPool.length) {
    const p = fullPool[idx]!;
    const fi = idx;
    idx += 1;
    if (exclude.has(p.id)) continue;
    collected.push({ row: p, fullIndex: fi });
  }

  const rhythmed = applyVisualRhythm(
    collected.map((c) => c.row),
    input.limit
  );
  const byId = new Map(collected.map((c) => [c.row.id, c.fullIndex]));

  const has_more = fullPool.slice(idx).some((p) => !exclude.has(p.id));

  const items: FeedTileRow[] = rhythmed.map((r) => ({
    id: r.id,
    main_image_url: r.main_image_url!,
    image_aspect_ratio: r.main_image_aspect_ratio,
    position_index: byId.get(r.id) ?? 0,
  }));

  const nextOffset = idx;
  const payload: FeedCursorPayload = {
    o: nextOffset,
    fv,
    sec: input.section,
    sub: input.subsection,
    sid: input.sessionId,
  };

  return {
    items,
    next_cursor: has_more ? encodeFeedCursor(payload) : null,
    feed_version: fv,
    has_more,
  };
}

export function getContinueFeed(input: {
  section: RootSection;
  subsection?: string;
  cursor: string | null;
  anchorProductId?: string;
  positionIndex?: number;
  limit: number;
  excludeProductIds: string[];
  sessionId: string;
  feedVersion: string | null;
}): { items: FeedTileRow[]; next_cursor: string | null; feed_version: string; has_more: boolean } {
  const fv = resolveFeedVersion(input.feedVersion);
  if (!fv) {
    return { items: [], next_cursor: null, feed_version: "", has_more: false };
  }

  const decoded = decodeFeedCursor(input.cursor);
  const fromCursor =
    decoded &&
    decoded.fv === fv &&
    decoded.sec === input.section &&
    (decoded.sub ?? "") === (input.subsection ?? "") &&
    decoded.sid === input.sessionId;

  const exclude = new Set(input.excludeProductIds);
  if (input.anchorProductId) {
    exclude.add(input.anchorProductId);
  }

  const fullPool = sortByFeedRank(
    loadEligibleProducts(fv, input.section, input.subsection, new Set()),
    fv,
    input.section,
    input.subsection,
    input.sessionId
  );

  let scan = 0;
  if (fromCursor) {
    scan = decoded!.o;
  } else if (
    input.anchorProductId !== undefined &&
    input.positionIndex !== undefined
  ) {
    scan = input.positionIndex + 1;
    if (fullPool[input.positionIndex]?.id !== input.anchorProductId) {
      const idx = fullPool.findIndex((p) => p.id === input.anchorProductId);
      if (idx >= 0) scan = idx + 1;
    }
  } else {
    return { items: [], next_cursor: null, feed_version: fv, has_more: false };
  }

  const picked: { row: ProductRow; fullIndex: number }[] = [];
  while (picked.length < input.limit && scan < fullPool.length) {
    const p = fullPool[scan]!;
    const idx = scan;
    scan += 1;
    if (exclude.has(p.id)) continue;
    picked.push({ row: p, fullIndex: idx });
  }

  const has_more =
    scan < fullPool.length ||
    fullPool.slice(scan).some((p) => !exclude.has(p.id));

  const items: FeedTileRow[] = picked.map(({ row, fullIndex }) => ({
    id: row.id,
    main_image_url: row.main_image_url!,
    image_aspect_ratio: row.main_image_aspect_ratio,
    position_index: fullIndex,
  }));

  const nextOffset = scan;
  const payload: FeedCursorPayload = {
    o: nextOffset,
    fv,
    sec: input.section,
    sub: input.subsection,
    sid: input.sessionId,
  };

  return {
    items,
    next_cursor: has_more ? encodeFeedCursor(payload) : null,
    feed_version: fv,
    has_more,
  };
}
