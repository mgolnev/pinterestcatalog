import { getDb } from "@/lib/db";
import type { RootSection } from "@/lib/types";
import {
  CANONICAL_PRODUCT_ASPECT_RATIO,
  inferAspectRatioFromImageUrl,
} from "@/lib/feed/aspect";
import { dropCatalogPrefix } from "@/lib/feed/classify";
import { resolveFeedVersion } from "@/lib/feed/feed-query";

export type SimilarRow = {
  id: string;
  main_image_url: string;
  image_aspect_ratio: number | null;
  score: number;
};

type ProductRow = {
  id: string;
  external_product_id: string;
  category_path: string;
  leaf_category: string | null;
  color: string | null;
  normalized_color: string | null;
  product_type: string | null;
  root_section: string;
  gender_or_age_group: string | null;
  fit: string | null;
  silhouette: string | null;
  season: string | null;
  collection: string | null;
  price: number | null;
  popularity_score: number;
  main_image_url: string | null;
  main_image_aspect_ratio: number | null;
  availability_status: string;
  publication_status: string;
};

function parsePath(raw: string): string[] {
  try {
    const v = JSON.parse(raw) as unknown;
    return Array.isArray(v) ? v.map(String) : [];
  } catch {
    return [];
  }
}

function parentCategory(path: string[]): string | null {
  if (path.length < 2) return null;
  return path[path.length - 2] ?? null;
}

function topBranch(path: string[]): string | null {
  return path.length ? path[0] ?? null : null;
}

function scorePair(base: ProductRow, cand: ProductRow): number {
  const bp = dropCatalogPrefix(parsePath(base.category_path));
  const cp = dropCatalogPrefix(parsePath(cand.category_path));
  const leafB = base.leaf_category ?? "";
  const leafC = cand.leaf_category ?? "";
  const parentB = parentCategory(bp);
  const parentC = parentCategory(cp);
  const branchB = topBranch(bp);
  const branchC = topBranch(cp);

  let score = 0;
  if (leafB && leafC && leafB === leafC) score += 100;
  else if (parentB && parentC && parentB === parentC) score += 60;
  else if (branchB && branchC && branchB === branchC) score += 35;

  const bc = base.normalized_color ?? base.color ?? "";
  const cc = cand.normalized_color ?? cand.color ?? "";
  if (bc && cc && bc === cc) score += 30;

  const bt = base.product_type ?? "";
  const ct = cand.product_type ?? "";
  if (bt && ct && bt === ct) score += 25;

  if (
    base.gender_or_age_group &&
    cand.gender_or_age_group &&
    base.gender_or_age_group === cand.gender_or_age_group
  ) {
    score += 20;
  }

  const bf = base.fit ?? base.silhouette ?? "";
  const cf = cand.fit ?? cand.silhouette ?? "";
  if (bf && cf && bf === cf) score += 15;

  const bs = base.season ?? base.collection ?? "";
  const cs = cand.season ?? cand.collection ?? "";
  if (bs && cs && bs === cs) score += 10;

  const pb = base.price;
  const pc = cand.price;
  if (pb && pc && pb > 0 && pc > 0) {
    const lo = pb * 0.75;
    const hi = pb * 1.25;
    if (pc >= lo && pc <= hi) score += 10;
  }

  score += Math.min(5, cand.popularity_score ?? 0);
  return score;
}

export function getSimilarProducts(input: {
  productId: string;
  section: RootSection;
  limit: number;
  excludeProductIds: string[];
  feedVersion: string | null;
}): {
  items: SimilarRow[];
  strategy: string;
  fallback_used: boolean;
} {
  const fv = resolveFeedVersion(input.feedVersion);
  if (!fv) {
    return {
      items: [],
      strategy: "no_feed_version",
      fallback_used: true,
    };
  }

  const db = getDb();
  const base = db
    .prepare(
      `SELECT * FROM products WHERE id = ? AND feed_version = ?`
    )
    .get(input.productId, fv) as ProductRow | undefined;

  if (!base) {
    return { items: [], strategy: "missing_product", fallback_used: true };
  }

  const candidates = db
    .prepare(
      `SELECT * FROM products
       WHERE feed_version = @fv
         AND publication_status = 'published'
         AND availability_status = 'in_stock'
         AND main_image_url IS NOT NULL
         AND root_section = @section
         AND id != @id`
    )
    .all({
      fv,
      section: input.section,
      id: base.id,
    }) as ProductRow[];

  const exclude = new Set(input.excludeProductIds);
  exclude.add(base.id);

  let strategy = "same_category_color_then_parent_fallback";
  let fallback_used = false;

  const scored = candidates
    .filter((c) => !exclude.has(c.id))
    .map((c) => ({
      row: c,
      score: scorePair(base, c),
    }))
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.row.id.localeCompare(b.row.id);
    });

  let picked = scored.filter((s) => s.score >= 80);
  if (picked.length < input.limit) {
    picked = scored.filter((s) => s.score >= 50);
    fallback_used = true;
    strategy = "parent_category_fallback";
  }
  if (picked.length < input.limit) {
    picked = scored.filter((s) => s.score >= 25);
    fallback_used = true;
    strategy = "branch_fallback";
  }
  if (picked.length < input.limit) {
    picked = scored;
    fallback_used = true;
    strategy = "popular_in_section";
  }

  const items: SimilarRow[] = picked.slice(0, input.limit).map((p) => {
    const url = p.row.main_image_url!;
    const ar =
      p.row.main_image_aspect_ratio ??
      inferAspectRatioFromImageUrl(url) ??
      CANONICAL_PRODUCT_ASPECT_RATIO;
    return {
      id: p.row.id,
      main_image_url: url,
      image_aspect_ratio: ar,
      score: Math.round(p.score),
    };
  });

  return { items, strategy, fallback_used };
}
