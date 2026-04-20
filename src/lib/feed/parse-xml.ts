import { XMLParser } from "fast-xml-parser";

export type ParsedCategory = { id: string; parentId?: string; name: string };

export type ParsedOffer = {
  id: string;
  group_id?: string;
  available?: boolean;
  name?: string;
  url?: string;
  price?: number;
  oldprice?: number;
  currencyId?: string;
  /** Все categoryId из оффера; лучший выбирается по глубине дерева при импорте */
  categoryIds: string[];
  typePrefix?: string;
  pictures: string[];
  vendor?: string;
  params: Record<string, string>;
};

function asArray<T>(v: T | T[] | undefined): T[] {
  if (v === undefined) return [];
  return Array.isArray(v) ? v : [v];
}

function text(v: unknown): string | undefined {
  if (v === undefined || v === null) return undefined;
  if (typeof v === "string" || typeof v === "number") return String(v);
  if (typeof v === "object" && "#text" in (v as object)) {
    return String((v as { "#text": unknown })["#text"]);
  }
  return undefined;
}

function num(v: unknown): number | undefined {
  const t = text(v);
  if (t === undefined) return undefined;
  const n = Number.parseFloat(t.replace(",", "."));
  return Number.isFinite(n) ? n : undefined;
}

/** Убирает служебные строки перед XML (например заголовок из браузера) */
export function stripXmlPreamble(xml: string): string {
  const t = xml.trimStart();
  if (t.startsWith("<?xml")) return t;
  const decl = t.indexOf("<?xml");
  if (decl >= 0) return t.slice(decl);
  const yml = t.indexOf("<yml_catalog");
  if (yml >= 0) return t.slice(yml);
  return t;
}

/**
 * Если файл обрезан (например при сохранении из редактора), закрываем дерево
 * после последнего целого `</offer>`.
 */
export function repairTruncatedYml(xml: string): string {
  let s = xml;
  const junk = s.search(/\[\s*\d[\d,\s]*\s*characters?\s+truncated/i);
  if (junk >= 0) {
    s = s.slice(0, junk);
  }
  if (/<\/yml_catalog>\s*$/i.test(s.trim())) {
    return s;
  }
  const lastOffer = s.lastIndexOf("</offer>");
  if (lastOffer === -1) return s;
  const head = s.slice(0, lastOffer + "</offer>".length);
  if (head.includes("</offers>")) return s;
  return `${head}\n    </offers>\n  </shop>\n</yml_catalog>\n`;
}

export function parseShopXml(xml: string): {
  categories: ParsedCategory[];
  offers: ParsedOffer[];
} {
  const clean = repairTruncatedYml(stripXmlPreamble(xml));
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "",
    trimValues: true,
  });
  const doc = parser.parse(clean) as Record<string, unknown>;
  const root = findShopRoot(doc);
  const categories = extractCategories(root);

  const offersRaw = root?.offers as Record<string, unknown> | undefined;
  const offerNodes = offersRaw?.offer;
  const offers: ParsedOffer[] = [];

  for (const raw of asArray(offerNodes)) {
    const o = raw as Record<string, unknown> & {
      id?: string | number;
      available?: boolean | string;
    };
    const id = o.id !== undefined ? String(o.id) : undefined;
    if (!id) continue;

    const groupId =
      o.group_id !== undefined ? String(o.group_id) : undefined;

    const catIdsRaw = asArray(o.categoryId as unknown);
    const categoryIds = catIdsRaw
      .map((x) => {
        if (typeof x === "string" || typeof x === "number") return String(x);
        return text(x) ?? "";
      })
      .filter((x) => Boolean(x));

    const pics = asArray(o.picture)
      .map((p) => text(p))
      .filter((x): x is string => Boolean(x));

    const params: Record<string, string> = {};
    for (const pr of asArray(o.param as Record<string, unknown> | undefined)) {
      if (!pr || typeof pr !== "object") continue;
      const name = text((pr as { name?: unknown }).name);
      const val = text((pr as { "#text"?: unknown })["#text"]) ?? text(pr);
      if (name && val) params[name] = val;
    }

    const availableRaw = o.available;
    const available =
      typeof availableRaw === "boolean"
        ? availableRaw
        : String(availableRaw ?? "true").toLowerCase() !== "false";

    const oldprice =
      num(o.oldprice) ??
      num((o as { oldPrice?: unknown }).oldPrice);

    offers.push({
      id,
      group_id: groupId,
      available,
      name: text(o.name),
      url: text(o.url),
      price: num(o.price),
      oldprice,
      currencyId: text(o.currencyId),
      categoryIds,
      typePrefix: text(o.typePrefix),
      pictures: pics,
      vendor: text(o.vendor),
      params,
    });
  }

  return { categories, offers };
}

function findShopRoot(doc: Record<string, unknown>): Record<string, unknown> | undefined {
  if (doc.shop && typeof doc.shop === "object") return doc.shop as Record<string, unknown>;
  const yml = doc.yml_catalog as Record<string, unknown> | undefined;
  if (yml?.shop && typeof yml.shop === "object") return yml.shop as Record<string, unknown>;
  const yml2 = doc["yml-catalog"] as Record<string, unknown> | undefined;
  if (yml2?.shop && typeof yml2.shop === "object") return yml2.shop as Record<string, unknown>;
  return undefined;
}

function extractCategories(shop: Record<string, unknown> | undefined): ParsedCategory[] {
  if (!shop?.categories) return [];
  const catNode = (shop.categories as Record<string, unknown>).category;
  const out: ParsedCategory[] = [];
  for (const raw of asArray(catNode)) {
    if (raw === undefined || raw === null) continue;
    if (typeof raw === "string") {
      continue;
    }
    const c = raw as Record<string, unknown> & {
      id?: string | number;
      parentId?: string | number;
    };
    const id = c.id !== undefined ? String(c.id) : undefined;
    if (!id) continue;
    const label =
      text(c["#text"]) ??
      text((c as { name?: unknown }).name) ??
      String(
        Object.values(c).find(
          (v) =>
            typeof v === "string" &&
            v !== String(c.id) &&
            (c.parentId === undefined || v !== String(c.parentId))
        ) ??
          ""
      );
    if (!label) continue;
    const parentId = c.parentId !== undefined ? String(c.parentId) : undefined;
    out.push({ id, parentId, name: label });
  }
  return out;
}

export function buildCategoryPaths(
  categories: ParsedCategory[]
): Map<string, string[]> {
  const byId = new Map(categories.map((c) => [c.id, c]));
  const memo = new Map<string, string[]>();

  function pathFor(id: string): string[] {
    const hit = memo.get(id);
    if (hit) return hit;
    const c = byId.get(id);
    if (!c) {
      memo.set(id, []);
      return [];
    }
    if (!c.parentId) {
      const p = [c.name];
      memo.set(id, p);
      return p;
    }
    const parentPath = pathFor(c.parentId);
    const p = [...parentPath, c.name];
    memo.set(id, p);
    return p;
  }

  for (const c of categories) {
    pathFor(c.id);
  }
  return memo;
}
