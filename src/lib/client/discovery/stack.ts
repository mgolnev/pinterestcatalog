import { getSessionId } from "@/lib/client/session";

const STORAGE_KEY = "gj-discovery-stack-v2";

export type TailTile = {
  id: string;
  main_image_url: string;
  image_aspect_ratio: number | null;
};

export type FeedRoot = {
  section: string;
  subsection?: string;
  sessionId: string;
  feedVersion: string;
  /** Первый товар, открытый из ленты (якорь continuation) */
  anchorProductId: string;
  positionIndex: number;
  /** Курсор догрузки блока «Дальше в ленте» после якоря */
  continuationCursor: string | null;
};

export type SimilarSegment = {
  parentProductId: string;
  openedProductId: string;
  /** Остаток similar(parent) после тапа по opened */
  tailAfterOpened: TailTile[];
};

export type DiscoveryStack = {
  feedRoot: FeedRoot;
  segments: SimilarSegment[];
  seenProductIds: string[];
};

export function readDiscoveryStack(): DiscoveryStack | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as DiscoveryStack;
  } catch {
    return null;
  }
}

export function writeDiscoveryStack(stack: DiscoveryStack | null): void {
  if (typeof window === "undefined") return;
  try {
    if (!stack) {
      sessionStorage.removeItem(STORAGE_KEY);
      return;
    }
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(stack));
  } catch {
    /* ignore */
  }
}

/** Сбросить стек и открыть товар из основной ленты */
export function initDiscoveryFromFeed(input: {
  section: string;
  subsection?: string;
  feedVersion: string;
  anchorProductId: string;
  positionIndex: number;
}): DiscoveryStack {
  const sessionId = getSessionId();
  const stack: DiscoveryStack = {
    feedRoot: {
      section: input.section,
      subsection: input.subsection,
      sessionId,
      feedVersion: input.feedVersion,
      anchorProductId: input.anchorProductId,
      positionIndex: input.positionIndex,
      continuationCursor: null,
    },
    segments: [],
    seenProductIds: [input.anchorProductId],
  };
  writeDiscoveryStack(stack);
  return stack;
}

/**
 * После browser back URL меняется на родителя — убираем сегменты, пока не сойдётся openedProductId.
 */
export function reconcileStackForProduct(
  productId: string,
  stack: DiscoveryStack | null
): DiscoveryStack | null {
  if (!stack) return null;
  const s: DiscoveryStack = JSON.parse(JSON.stringify(stack)) as DiscoveryStack;
  while (s.segments.length > 0) {
    const last = s.segments[s.segments.length - 1]!;
    if (last.openedProductId === productId) break;
    s.segments.pop();
  }
  if (s.segments.length > 0) {
    const last = s.segments[s.segments.length - 1]!;
    if (last.openedProductId === productId) return s;
  }
  if (s.feedRoot.anchorProductId === productId && s.segments.length === 0) {
    return s;
  }
  return null;
}

export function pushSimilarNavigation(input: {
  stack: DiscoveryStack;
  parentProductId: string;
  openedProductId: string;
  tailAfterOpened: TailTile[];
}): DiscoveryStack {
  const tailIds = input.tailAfterOpened.map((t) => t.id);
  const seen = new Set(input.stack.seenProductIds);
  seen.add(input.openedProductId);
  for (const id of tailIds) seen.add(id);

  const next: DiscoveryStack = {
    ...input.stack,
    segments: [
      ...input.stack.segments,
      {
        parentProductId: input.parentProductId,
        openedProductId: input.openedProductId,
        tailAfterOpened: input.tailAfterOpened,
      },
    ],
    seenProductIds: [...seen],
  };
  writeDiscoveryStack(next);
  return next;
}

export function updateContinuationCursor(
  stack: DiscoveryStack,
  cursor: string | null
): void {
  const next = {
    ...stack,
    feedRoot: { ...stack.feedRoot, continuationCursor: cursor },
  };
  writeDiscoveryStack(next);
}

export function mergeSeen(stack: DiscoveryStack, ids: string[]): DiscoveryStack {
  const s = new Set(stack.seenProductIds);
  for (const id of ids) s.add(id);
  const next = { ...stack, seenProductIds: [...s] };
  writeDiscoveryStack(next);
  return next;
}

export function buildProductHref(input: {
  productId: string;
  section: string;
  subsection?: string;
  feedVersion: string;
  positionIndex?: number;
}): string {
  const q = new URLSearchParams();
  q.set("section", input.section);
  if (input.subsection) q.set("subsection", input.subsection);
  if (input.feedVersion) q.set("feed_version", input.feedVersion);
  if (input.positionIndex !== undefined) {
    q.set("position_index", String(input.positionIndex));
  }
  return `/product/${encodeURIComponent(input.productId)}?${q.toString()}`;
}
