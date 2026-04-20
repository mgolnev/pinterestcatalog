import type { RootSection } from "@/lib/types";

const SECTIONS: RootSection[] = ["women", "men", "kids", "teens", "unknown"];

export function parseSection(raw: string | null): RootSection | null {
  if (!raw) return null;
  const s = raw.toLowerCase();
  return SECTIONS.includes(s as RootSection) ? (s as RootSection) : null;
}

export function parseLimit(raw: string | null, cap: number, fallback: number): number {
  const n = raw ? Number.parseInt(raw, 10) : NaN;
  if (!Number.isFinite(n) || n <= 0) return Math.min(fallback, cap);
  return Math.min(n, cap);
}

export function parseExcludeIds(url: URL): string[] {
  const out: string[] = [];
  const list = url.searchParams.getAll("exclude_product_ids");
  if (list.length) {
    for (const chunk of list) {
      for (const part of chunk.split(",")) {
        const id = part.trim();
        if (id) out.push(id);
      }
    }
  } else {
    const single = url.searchParams.get("exclude_product_ids");
    if (single) {
      for (const part of single.split(",")) {
        const id = part.trim();
        if (id) out.push(id);
      }
    }
  }
  return [...new Set(out)];
}
