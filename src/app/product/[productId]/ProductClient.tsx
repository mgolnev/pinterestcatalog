"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getSessionId } from "@/lib/client/session";
import {
  buildProductHref,
  initDiscoveryFromFeed,
  mergeSeen,
  pushSimilarNavigation,
  readDiscoveryStack,
  reconcileStackForProduct,
  type DiscoveryStack,
  type TailTile,
  updateContinuationCursor,
  writeDiscoveryStack,
} from "@/lib/client/discovery/stack";
import { cssAspectRatioBox, tileWidthOverHeight } from "@/lib/feed/aspect";
import { FEED_GRID_CLASS, FEED_IMAGE_SIZES } from "@/lib/feed/grid-layout";

type Detail = {
  id: string;
  name: string;
  price: number | null;
  old_price: number | null;
  currency: string;
  images: { url: string; aspect_ratio: number | null }[];
  category_path: string[];
  product_url: string;
  availability_status: string;
};

type SimilarItem = {
  id: string;
  main_image_url: string;
  image_aspect_ratio: number | null;
  score: number;
};

type ContTile = {
  id: string;
  main_image_url: string;
  image_aspect_ratio: number | null;
  position_index: number;
};

export function ProductClient({ productId }: { productId: string }) {
  const router = useRouter();
  const sp = useSearchParams();
  const positionIndex = Number.parseInt(sp.get("position_index") ?? "", 10);
  const feedVersionParam = sp.get("feed_version") ?? "";

  const sessionId = useMemo(() => getSessionId(), []);

  const [stack, setStack] = useState<DiscoveryStack | null>(null);
  const [hydrated, setHydrated] = useState(false);

  const [detail, setDetail] = useState<Detail | null>(null);
  const [similar, setSimilar] = useState<SimilarItem[]>([]);
  const [cont, setCont] = useState<ContTile[]>([]);
  const [contCursor, setContCursor] = useState<string | null>(null);
  const [contHasMore, setContHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const sentinelRef = useRef<HTMLDivElement | null>(null);

  const section = stack?.feedRoot.section ?? sp.get("section") ?? "women";
  const subsection = stack?.feedRoot.subsection ?? sp.get("subsection") ?? undefined;
  const feedVersion = stack?.feedRoot.feedVersion || feedVersionParam;

  useEffect(() => {
    setHydrated(false);
    let s = readDiscoveryStack();
    s = reconcileStackForProduct(productId, s);
    if (!s && Number.isFinite(positionIndex) && feedVersionParam && productId) {
      s = initDiscoveryFromFeed({
        section: sp.get("section") ?? "women",
        subsection: sp.get("subsection") ?? undefined,
        feedVersion: feedVersionParam,
        anchorProductId: productId,
        positionIndex,
      });
    } else if (s) {
      writeDiscoveryStack(s);
    }
    setStack(s);
    setHydrated(true);
  }, [productId, positionIndex, feedVersionParam, sp]);

  useEffect(() => {
    if (!hydrated) return;
    let cancelled = false;

    async function run() {
      setLoading(true);
      setErr(null);
      try {
        const stk = readDiscoveryStack();
        const fv = stk?.feedRoot.feedVersion || feedVersionParam;

        const dRes = await fetch(
          `/api/products/${encodeURIComponent(productId)}?feed_version=${encodeURIComponent(fv)}`
        );
        if (!dRes.ok) throw new Error("Товар недоступен");
        const d = (await dRes.json()) as Detail;
        if (cancelled) return;
        setDetail(d);

        let st = readDiscoveryStack();
        if (st && !st.seenProductIds.includes(d.id)) {
          st = mergeSeen(st, [d.id]);
          setStack(st);
        }

        const seen = new Set(st?.seenProductIds ?? [d.id]);
        seen.add(d.id);
        const ex = [...seen];

        const sParams = new URLSearchParams({
          section: stk?.feedRoot.section ?? sp.get("section") ?? "women",
          session_id: sessionId,
          limit: "40",
        });
        if (stk?.feedRoot.subsection)
          sParams.set("subsection", stk.feedRoot.subsection);
        if (fv) sParams.set("feed_version", fv);
        for (const id of ex) sParams.append("exclude_product_ids", id);

        const sRes = await fetch(
          `/api/products/${encodeURIComponent(productId)}/similar?${sParams.toString()}`
        );
        let simItems: SimilarItem[] = [];
        if (sRes.ok) {
          const sJson = (await sRes.json()) as { items: SimilarItem[] };
          simItems = sJson.items;
          if (!cancelled) setSimilar(simItems);
        } else if (!cancelled) setSimilar([]);

        const root = stk?.feedRoot;
        if (root) {
          const ex2 = [
            ...new Set([...ex, ...simItems.map((x) => x.id)]),
          ];
          const cParams = new URLSearchParams({
            section: root.section,
            session_id: sessionId,
            limit: "40",
            anchor_product_id: root.anchorProductId,
            position_index: String(root.positionIndex),
          });
          if (root.subsection) cParams.set("subsection", root.subsection);
          if (fv) cParams.set("feed_version", fv);
          for (const id of ex2) cParams.append("exclude_product_ids", id);
          if (root.continuationCursor)
            cParams.set("cursor", root.continuationCursor);

          const cRes = await fetch(`/api/feed/continue?${cParams.toString()}`);
          if (cRes.ok) {
            const cJson = (await cRes.json()) as {
              items: ContTile[];
              next_cursor: string | null;
              has_more: boolean;
            };
            if (!cancelled) {
              setCont(cJson.items);
              setContCursor(cJson.next_cursor);
              setContHasMore(cJson.has_more);
              const st2 = readDiscoveryStack();
              if (st2 && cJson.next_cursor !== st2.feedRoot.continuationCursor) {
                updateContinuationCursor(st2, cJson.next_cursor);
                setStack(readDiscoveryStack());
              }
            }
          } else if (!cancelled) {
            setCont([]);
            setContCursor(null);
            setContHasMore(false);
          }
        } else {
          if (!cancelled) {
            setCont([]);
            setContCursor(null);
            setContHasMore(false);
          }
        }
      } catch (e) {
        if (!cancelled) setErr(e instanceof Error ? e.message : "Ошибка");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void run();
    return () => {
      cancelled = true;
    };
  }, [hydrated, productId, sessionId, sp, feedVersionParam]);

  const loadMoreCont = useCallback(async () => {
    const stk = readDiscoveryStack();
    if (!stk?.feedRoot || !contCursor) return;
    const root = stk.feedRoot;
    const fv = stk.feedRoot.feedVersion || feedVersionParam;
    const seen = new Set(stk.seenProductIds);
    for (const s of similar) seen.add(s.id);
    for (const c of cont) seen.add(c.id);
    seen.add(productId);
    const params = new URLSearchParams({
      section: root.section,
      session_id: sessionId,
      limit: "40",
      cursor: contCursor,
    });
    if (root.subsection) params.set("subsection", root.subsection);
    if (fv) params.set("feed_version", fv);
    for (const id of seen) params.append("exclude_product_ids", id);

    const res = await fetch(`/api/feed/continue?${params.toString()}`);
    if (!res.ok) return;
    const data = (await res.json()) as {
      items: ContTile[];
      next_cursor: string | null;
      has_more: boolean;
    };
    setCont((prev) => [...prev, ...data.items]);
    setContCursor(data.next_cursor);
    setContHasMore(data.has_more);
    const st = readDiscoveryStack();
    if (st) updateContinuationCursor(st, data.next_cursor);
    setStack(readDiscoveryStack());
  }, [cont, contCursor, feedVersionParam, productId, sessionId, similar]);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && contHasMore && contCursor) {
          void loadMoreCont();
        }
      },
      { rootMargin: "600px" }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [contHasMore, contCursor, loadMoreCont]);

  /** Тап по похожему на текущем detail — новый уровень вложенности */
  const navigateToChildFromParentSimilar = useCallback(
    (parentProductId: string, opened: TailTile, remainder: TailTile[]) => {
      const stk = readDiscoveryStack();
      if (!stk) return;
      pushSimilarNavigation({
        stack: stk,
        parentProductId,
        openedProductId: opened.id,
        tailAfterOpened: remainder,
      });
      router.push(
        buildProductHref({
          productId: opened.id,
          section: stk.feedRoot.section,
          subsection: stk.feedRoot.subsection,
          feedVersion: stk.feedRoot.feedVersion,
        })
      );
    },
    [router]
  );

  /** Тап по хвосту чужой подборки (сосед в родительском similar) — сбрасываем ветви с тем же parent */
  const navigateFromRemainderTail = useCallback(
    (parentProductId: string, opened: TailTile, remainder: TailTile[]) => {
      const stk = readDiscoveryStack();
      if (!stk) return;
      const filtered: DiscoveryStack = {
        ...stk,
        segments: stk.segments.filter(
          (s) => s.parentProductId !== parentProductId
        ),
      };
      const next = pushSimilarNavigation({
        stack: filtered,
        parentProductId,
        openedProductId: opened.id,
        tailAfterOpened: remainder,
      });
      router.push(
        buildProductHref({
          productId: opened.id,
          section: next.feedRoot.section,
          subsection: next.feedRoot.subsection,
          feedVersion: next.feedRoot.feedVersion,
        })
      );
    },
    [router]
  );

  const openContinuationTile = useCallback(
    (c: ContTile) => {
      const stk = readDiscoveryStack();
      const fv = stk?.feedRoot.feedVersion || feedVersionParam;
      const sec = stk?.feedRoot.section ?? section;
      const sub = stk?.feedRoot.subsection ?? subsection;
      initDiscoveryFromFeed({
        section: sec,
        subsection: sub,
        feedVersion: fv,
        anchorProductId: c.id,
        positionIndex: c.position_index,
      });
      router.push(
        buildProductHref({
          productId: c.id,
          section: sec,
          subsection: sub,
          feedVersion: fv,
          positionIndex: c.position_index,
        })
      );
    },
    [feedVersionParam, router, section, subsection]
  );

  const backHref =
    subsection !== undefined
      ? `/feed/${section}?subsection=${encodeURIComponent(subsection)}`
      : `/feed/${section}`;

  /** Хвосты: от последнего сегмента (глубже) к первому — остаток similar(Q), затем остаток similar(P), … */
  const tailSections = useMemo(() => {
    const stk = stack;
    if (!stk?.segments.length) return [];
    const seen = new Set<string>();
    const out: {
      key: string;
      parentProductId: string;
      tiles: TailTile[];
    }[] = [];
    for (let i = stk.segments.length - 1; i >= 0; i--) {
      const seg = stk.segments[i]!;
      const tiles = seg.tailAfterOpened.filter((t) => {
        if (seen.has(t.id)) return false;
        seen.add(t.id);
        return true;
      });
      if (tiles.length) {
        out.push({
          key: `tail-${i}-${seg.parentProductId}`,
          parentProductId: seg.parentProductId,
          tiles,
        });
      }
    }
    return out;
  }, [stack]);

  if (!hydrated || loading) {
    return (
      <div className="min-h-screen bg-black px-4 py-10 text-center text-sm text-white/60">
        Загрузка…
      </div>
    );
  }

  if (err || !detail) {
    return (
      <div className="min-h-screen bg-black px-4 py-10 text-center text-sm text-red-300">
        {err ?? "Не найдено"}
        <div className="mt-6">
          <Link href={backHref} className="text-white underline">
            Назад в ленту
          </Link>
        </div>
      </div>
    );
  }

  const hero = detail.images[0];
  const heroAr =
    hero?.aspect_ratio ??
    tileWidthOverHeight(hero?.url ?? "", null);

  return (
    <div className="min-h-screen bg-black pb-16">
      <div className="sticky top-0 z-20 flex items-center gap-2 bg-black/70 px-2 py-2 backdrop-blur">
        <button
          type="button"
          onClick={() => router.back()}
          className="rounded-full bg-white/10 px-3 py-1.5 text-sm"
        >
          ← Назад
        </button>
        <Link href={backHref} className="rounded-full bg-white/10 px-3 py-1.5 text-sm">
          Лента
        </Link>
      </div>

      {hero ? (
        <div
          className="relative w-full"
          style={{ aspectRatio: cssAspectRatioBox(heroAr) }}
        >
          <Image
            src={hero.url}
            alt=""
            fill
            className="object-cover"
            priority
            unoptimized
          />
        </div>
      ) : null}

      <div className="px-4 py-4">
        <h1 className="text-lg font-medium leading-snug">{detail.name}</h1>
        <div className="mt-2 flex items-baseline gap-2">
          {detail.price !== null ? (
            <span className="text-xl">
              {detail.price} {detail.currency}
            </span>
          ) : (
            <span className="text-sm text-white/60">Цена недоступна</span>
          )}
          {detail.old_price ? (
            <span className="text-sm text-white/40 line-through">
              {detail.old_price}
            </span>
          ) : null}
        </div>
        {detail.product_url && detail.product_url !== "about:blank" ? (
          <a
            href={detail.product_url}
            target="_blank"
            rel="noreferrer"
            className="mt-4 inline-block rounded-full bg-white px-4 py-2 text-sm text-black"
          >
            Перейти к товару
          </a>
        ) : null}
      </div>

      {similar.length ? (
        <section className="mt-6">
          <h2 className="mb-2 px-1 text-xs uppercase tracking-wide text-white/50">
            Похожие
          </h2>
          <div className={FEED_GRID_CLASS}>
            {similar.map((s, idx) => {
              const tail: TailTile[] = similar.slice(idx + 1).map((t) => ({
                id: t.id,
                main_image_url: t.main_image_url,
                image_aspect_ratio: t.image_aspect_ratio,
              }));
              const opened: TailTile = {
                id: s.id,
                main_image_url: s.main_image_url,
                image_aspect_ratio: s.image_aspect_ratio,
              };
              return (
                <button
                  key={s.id}
                  type="button"
                  className="relative block w-full overflow-hidden bg-neutral-900 p-0 text-left"
                  style={{
                    aspectRatio: cssAspectRatioBox(
                      tileWidthOverHeight(s.main_image_url, s.image_aspect_ratio)
                    ),
                  }}
                  onClick={() =>
                    navigateToChildFromParentSimilar(
                      detail.id,
                      opened,
                      tail
                    )
                  }
                >
                  <Image
                    src={s.main_image_url}
                    alt=""
                    fill
                    className="object-cover"
                    sizes={FEED_IMAGE_SIZES}
                    priority={idx < 6}
                    unoptimized
                  />
                </button>
              );
            })}
          </div>
        </section>
      ) : null}

      {tailSections.map((block) => (
        <section key={block.key} className="mt-6">
          <h2 className="mb-2 px-1 text-xs uppercase tracking-wide text-white/50">
            Дальше в подборке
          </h2>
          <div className={FEED_GRID_CLASS}>
            {block.tiles.map((t, idx) => {
              const remainder = block.tiles.slice(idx + 1);
              return (
                <button
                  key={`${block.key}-${t.id}`}
                  type="button"
                  className="relative block w-full overflow-hidden bg-neutral-900 p-0 text-left"
                  style={{
                    aspectRatio: cssAspectRatioBox(
                      tileWidthOverHeight(t.main_image_url, t.image_aspect_ratio)
                    ),
                  }}
                  onClick={() =>
                    navigateFromRemainderTail(
                      block.parentProductId,
                      t,
                      remainder
                    )
                  }
                >
                  <Image
                    src={t.main_image_url}
                    alt=""
                    fill
                    className="object-cover"
                    sizes={FEED_IMAGE_SIZES}
                    priority={idx < 6}
                    unoptimized
                  />
                </button>
              );
            })}
          </div>
        </section>
      ))}

      {cont.length ? (
        <section className="mt-6">
          <h2 className="mb-2 px-1 text-xs uppercase tracking-wide text-white/50">
            Дальше в ленте
          </h2>
          <div className={FEED_GRID_CLASS}>
            {cont.map((c, idx) => (
              <button
                key={c.id}
                type="button"
                className="relative block w-full overflow-hidden bg-neutral-900 p-0 text-left"
                style={{
                  aspectRatio: cssAspectRatioBox(
                    tileWidthOverHeight(c.main_image_url, c.image_aspect_ratio)
                  ),
                }}
                onClick={() => openContinuationTile(c)}
              >
                <Image
                  src={c.main_image_url}
                  alt=""
                  fill
                  className="object-cover"
                  sizes={FEED_IMAGE_SIZES}
                  priority={idx < 6}
                  unoptimized
                />
              </button>
            ))}
          </div>
          <div ref={sentinelRef} className="h-6" />
        </section>
      ) : null}
    </div>
  );
}
