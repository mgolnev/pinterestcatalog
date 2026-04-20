import { getDb, setMeta } from "@/lib/db";
import type { AvailabilityStatus, PublicationStatus, RootSection } from "@/lib/types";
import type { Subsection } from "@/lib/types";
import {
  classifyRootSection,
  classifySubsection,
  dropCatalogPrefix,
  inferRootSectionFromPolParam,
  inferSubsectionFromPolParam,
} from "@/lib/feed/classify";
import {
  CANONICAL_PRODUCT_ASPECT_RATIO,
  inferAspectRatioFromImageUrl,
} from "@/lib/feed/aspect";
import {
  buildCategoryPaths,
  parseShopXml,
  stripXmlPreamble,
  type ParsedOffer,
} from "@/lib/feed/parse-xml";

function pickColor(params: Record<string, string>): string | null {
  const keys = ["Цвет", "color", "Color", "цвет"];
  for (const k of keys) {
    const v = params[k];
    if (v) return v.trim();
  }
  return null;
}

function pickProductType(params: Record<string, string>, name: string): string | null {
  const keys = ["Тип", "type", "Type", "Вид товара"];
  for (const k of keys) {
    const v = params[k];
    if (v) return v.trim();
  }
  const n = name.toLowerCase();
  if (n.includes("джинс")) return "Джинсы";
  return null;
}

function normalizeColor(raw: string | null): string | null {
  if (!raw) return null;
  return raw.trim().toLowerCase().replace(/\s+/g, " ");
}

function inferAspectRatio(url: string): number | null {
  return inferAspectRatioFromImageUrl(url) ?? CANONICAL_PRODUCT_ASPECT_RATIO;
}

function normalizeCurrency(raw: string | undefined): string {
  const c = (raw ?? "RUB").trim().toUpperCase();
  if (c === "RUR") return "RUB";
  return c;
}

function pickBestCategoryId(
  ids: string[],
  paths: Map<string, string[]>
): string | null {
  let best: string | null = null;
  let bestDepth = -1;
  for (const id of ids) {
    const p = paths.get(id);
    const depth = p?.length ?? 0;
    if (depth > bestDepth) {
      bestDepth = depth;
      best = id;
    }
  }
  return best;
}

function mapAvailability(offer: ParsedOffer): AvailabilityStatus {
  if (offer.available === false) return "out_of_stock";
  return "in_stock";
}

function buildProductRecord(
  offer: ParsedOffer,
  categoryPath: string[],
  feedVersion: string,
  now: string,
  bestCategoryId: string | null
): {
  id: string;
  external_product_id: string;
  name: string;
  price: number | null;
  old_price: number | null;
  currency: string;
  category_id: string | null;
  category_path: string;
  leaf_category: string | null;
  root_section: RootSection;
  subsection: Subsection | undefined;
  gender_or_age_group: string | null;
  attributes: string;
  color: string | null;
  normalized_color: string | null;
  product_type: string | null;
  fit: string | null;
  silhouette: string | null;
  season: string | null;
  collection: string | null;
  image_urls: string;
  main_image_url: string | null;
  main_image_aspect_ratio: number | null;
  photo_type: string | null;
  image_quality_score: number | null;
  product_url: string;
  availability_status: AvailabilityStatus;
  publication_status: PublicationStatus;
  updated_at: string;
  feed_version: string;
  popularity_score: number;
} | null {
  const name = offer.name?.trim() || "Товар";
  const url = offer.url?.trim() || "";
  const mainImage = offer.pictures[0] ?? null;
  const pathForClass = dropCatalogPrefix(categoryPath);
  const pol = offer.params["Пол"]?.trim() ?? null;

  let root = classifyRootSection(pathForClass);
  if (root === "unknown") {
    const inferred = inferRootSectionFromPolParam(pol);
    if (inferred) root = inferred;
  }

  let subsection = classifySubsection(root, pathForClass);
  if (subsection === undefined) {
    const s2 = inferSubsectionFromPolParam(pol, root);
    if (s2) subsection = s2;
  }

  let publication: PublicationStatus = "published";
  if (!mainImage) publication = "hidden";
  if (!bestCategoryId || categoryPath.length === 0) publication = "quarantine";
  if (root === "unknown") publication = "quarantine";

  const color = pickColor(offer.params);
  const normalized_color = normalizeColor(color);

  if (!url && publication === "published") publication = "hidden";

  const availability = mapAvailability(offer);

  const leaf = categoryPath.length ? categoryPath[categoryPath.length - 1]! : null;

  const attrs = {
    ...offer.params,
    vendor: offer.vendor,
    group_id: offer.group_id,
  };

  const productType =
    offer.typePrefix?.trim() ||
    pickProductType(offer.params, name) ||
    null;

  return {
    id: `gj-${offer.id}`,
    external_product_id: offer.id,
    name,
    price: offer.price ?? null,
    old_price: offer.oldprice ?? null,
    currency: normalizeCurrency(offer.currencyId),
    category_id: bestCategoryId,
    category_path: JSON.stringify(categoryPath),
    leaf_category: leaf,
    root_section: root,
    subsection,
    gender_or_age_group: pol,
    attributes: JSON.stringify(attrs),
    color,
    normalized_color,
    product_type: productType,
    fit: offer.params["Посадка"] ?? offer.params["fit"] ?? null,
    silhouette: offer.params["Силуэт"] ?? offer.params["Фасон"] ?? null,
    season: offer.params["Сезон"] ?? null,
    collection: offer.params["Коллекция"] ?? null,
    image_urls: JSON.stringify(offer.pictures),
    main_image_url: mainImage,
    main_image_aspect_ratio: mainImage ? inferAspectRatio(mainImage) : null,
    photo_type: null,
    image_quality_score: null,
    product_url: url || "about:blank",
    availability_status: availability,
    publication_status: publication,
    updated_at: now,
    feed_version: feedVersion,
    popularity_score: 0,
  };
}

export async function fetchFeedXml(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: { "User-Agent": "gloria-jeans-inspiration-feed/0.1" },
  });
  if (!res.ok) {
    throw new Error(`Feed HTTP ${res.status}`);
  }
  return stripXmlPreamble(await res.text());
}

export function importFeedFromXml(xml: string): { feedVersion: string; inserted: number } {
  const { categories, offers } = parseShopXml(xml);
  const paths = buildCategoryPaths(categories);
  const db = getDb();
  const feedVersion = new Date().toISOString();
  const now = feedVersion;

  const insert = db.prepare(`
    INSERT INTO products (
      id, external_product_id, name, price, old_price, currency,
      category_id, category_path, leaf_category, root_section, subsection,
      gender_or_age_group, attributes, color, normalized_color,
      product_type, fit, silhouette, season, collection,
      image_urls, main_image_url, main_image_aspect_ratio, photo_type, image_quality_score,
      product_url, availability_status, publication_status, updated_at, feed_version, popularity_score
    ) VALUES (
      @id, @external_product_id, @name, @price, @old_price, @currency,
      @category_id, @category_path, @leaf_category, @root_section, @subsection,
      @gender_or_age_group, @attributes, @color, @normalized_color,
      @product_type, @fit, @silhouette, @season, @collection,
      @image_urls, @main_image_url, @main_image_aspect_ratio, @photo_type, @image_quality_score,
      @product_url, @availability_status, @publication_status, @updated_at, @feed_version, @popularity_score
    )
    ON CONFLICT(external_product_id) DO UPDATE SET
      name = excluded.name,
      price = excluded.price,
      old_price = excluded.old_price,
      currency = excluded.currency,
      category_id = excluded.category_id,
      category_path = excluded.category_path,
      leaf_category = excluded.leaf_category,
      root_section = excluded.root_section,
      subsection = excluded.subsection,
      gender_or_age_group = excluded.gender_or_age_group,
      attributes = excluded.attributes,
      color = excluded.color,
      normalized_color = excluded.normalized_color,
      product_type = excluded.product_type,
      fit = excluded.fit,
      silhouette = excluded.silhouette,
      season = excluded.season,
      collection = excluded.collection,
      image_urls = excluded.image_urls,
      main_image_url = excluded.main_image_url,
      main_image_aspect_ratio = excluded.main_image_aspect_ratio,
      photo_type = excluded.photo_type,
      image_quality_score = excluded.image_quality_score,
      product_url = excluded.product_url,
      availability_status = excluded.availability_status,
      publication_status = excluded.publication_status,
      updated_at = excluded.updated_at,
      feed_version = excluded.feed_version,
      popularity_score = excluded.popularity_score,
      id = excluded.id
  `);

  let inserted = 0;

  const work = db.transaction((xmlFeedVersion: string) => {
    for (const offer of offers) {
      const bestId = pickBestCategoryId(offer.categoryIds, paths);
      const catPath = bestId ? paths.get(bestId) ?? [] : [];
      const row = buildProductRecord(offer, catPath, xmlFeedVersion, now, bestId);
      if (!row) continue;
      insert.run({
        ...row,
        subsection: row.subsection ?? null,
        gender_or_age_group: row.gender_or_age_group ?? null,
      });
      inserted += 1;
    }

    db.prepare("DELETE FROM products WHERE feed_version != ?").run(xmlFeedVersion);
    setMeta("active_feed_version", xmlFeedVersion);
    setMeta("last_successful_import_at", now);
  });

  work(feedVersion);

  return { feedVersion, inserted };
}
