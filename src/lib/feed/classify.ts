import type { RootSection } from "@/lib/types";
import type { Subsection } from "@/lib/types";

const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "");

/** Убирает искусственный корень «Каталог» у Gloria Jeans */
export function dropCatalogPrefix(path: string[]): string[] {
  if (path.length === 0) return path;
  const first = (path[0] ?? "").trim();
  if (/^каталог$/i.test(first)) return path.slice(1);
  return path;
}

/** Подсказка по полю «Пол» из фида, если по дереву категорий непонятно */
export function inferRootSectionFromPolParam(
  pol: string | null | undefined
): RootSection | null {
  if (!pol) return null;
  const x = norm(pol);
  if (/жен|woman|female|ladies/i.test(x)) return "women";
  if (/муж|мужчин|man|men\b/i.test(x)) return "men";
  if (/подрост|teen/i.test(x)) return "teens";
  if (/(мальчик|девоч|детск|малыш|kid)/i.test(x)) return "kids";
  return null;
}

export function inferSubsectionFromPolParam(
  pol: string | null | undefined,
  root: RootSection
): Subsection | undefined {
  if (!pol) return undefined;
  const x = norm(pol);
  if (root === "kids") {
    if (/мальчик/i.test(x)) return "boys";
    if (/девоч/i.test(x)) return "girls";
  }
  if (root === "teens") {
    if (/мальчик/i.test(x)) return "teen_boys";
    if (/девоч/i.test(x)) return "teen_girls";
  }
  return undefined;
}

export function classifyRootSection(categoryPath: string[]): RootSection {
  const head = categoryPath[0] ?? "";
  const h = norm(head);

  if (/(жен|woman|female|ladies)/i.test(h)) return "women";
  if (/(муж|man|male|men)/i.test(h) && !/дет/i.test(h)) return "men";
  if (/(подрост|teen|подростк)/i.test(h)) return "teens";
  if (/(дет|kid|child|малыш|мальчик|девоч)/i.test(h)) return "kids";

  const joined = norm(categoryPath.join(" | "));
  if (/(^|\s)(жен|woman)/i.test(joined)) return "women";
  if (/(^|\s)(муж|man\s|men)/i.test(joined)) return "men";
  if (/(подрост|teen)/i.test(joined)) return "teens";
  if (/(дет|kid|child)/i.test(joined)) return "kids";

  return "unknown";
}

export function classifySubsection(
  root: RootSection,
  categoryPath: string[]
): Subsection | undefined {
  const joined = norm(categoryPath.join(" | "));

  if (root === "kids") {
    if (/(мальчик|мальч|boys|boy)/i.test(joined)) return "boys";
    if (/(девоч|девушк|girls|girl)/i.test(joined)) return "girls";
  }
  if (root === "teens") {
    if (/(мальчик|мальч|boys|boy)/i.test(joined)) return "teen_boys";
    if (/(девоч|девушк|girls|girl)/i.test(joined)) return "teen_girls";
  }
  return undefined;
}

export function rootSectionMatchesFilter(
  root: RootSection,
  section: RootSection
): boolean {
  if (section === "women" || section === "men") return root === section;
  if (section === "kids") return root === "kids";
  if (section === "teens") return root === "teens";
  return false;
}

export function subsectionMatchesFilter(
  productSub: Subsection | undefined,
  filterSub: string | undefined
): boolean {
  if (!filterSub) return true;
  return productSub === (filterSub as Subsection);
}
