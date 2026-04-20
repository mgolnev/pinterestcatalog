"use client";

import Image from "next/image";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getSessionId } from "@/lib/client/session";
import { initDiscoveryFromFeed } from "@/lib/client/discovery/stack";
import { cssAspectRatioBox, tileWidthOverHeight } from "@/lib/feed/aspect";
import { FEED_GRID_CLASS, FEED_IMAGE_SIZES } from "@/lib/feed/grid-layout";

type Tile = {
  id: string;
  main_image_url: string;
  image_aspect_ratio: number | null;
  position_index: number;
};

const SECTIONS = [
  { key: "women", label: "Женщины" },
  { key: "men", label: "Мужчины" },
  { key: "kids", label: "Дети" },
  { key: "teens", label: "Подростки" },
] as const;

function storageKey(section: string, subsection: string | undefined) {
  return `gj-feed-v1:${section}:${subsection ?? "all"}`;
}

export function FeedClient({ section }: { section: string }) {
  const sp = useSearchParams();
  const subsection = sp.get("subsection") ?? undefined;

  const [items, setItems] = useState<Tile[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [feedVersion, setFeedVersion] = useState<string>("");
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sessionId = useMemo(() => getSessionId(), []);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const feedVersionRef = useRef("");

  useEffect(() => {
    feedVersionRef.current = feedVersion;
  }, [feedVersion]);

  const persist = useCallback(() => {
    try {
      const raw = JSON.stringify({
        items,
        cursor,
        feed_version: feedVersion,
        has_more: hasMore,
        scrollY: window.scrollY,
      });
      sessionStorage.setItem(storageKey(section, subsection), raw);
    } catch {
      /* ignore */
    }
  }, [items, cursor, feedVersion, hasMore, section, subsection]);

  const fetchPage = useCallback(
    async (nextCursor: string | null, append: boolean) => {
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams({
          section,
          session_id: sessionId,
          limit: "40",
        });
        if (subsection) params.set("subsection", subsection);
        if (feedVersionRef.current) {
          params.set("feed_version", feedVersionRef.current);
        }
        if (nextCursor) params.set("cursor", nextCursor);

        const res = await fetch(`/api/feed?${params.toString()}`);
        if (!res.ok) throw new Error("Не удалось загрузить ленту");
        const data = (await res.json()) as {
          items: Tile[];
          next_cursor: string | null;
          feed_version: string;
          has_more: boolean;
        };
        setFeedVersion(data.feed_version);
        setHasMore(data.has_more);
        setCursor(data.next_cursor);
        setItems((prev) =>
          append ? [...prev, ...data.items] : data.items
        );
      } catch (e) {
        setError(e instanceof Error ? e.message : "Ошибка сети");
      } finally {
        setLoading(false);
      }
    },
    [section, subsection, sessionId]
  );

  useEffect(() => {
    let cancelled = false;

    async function init() {
      try {
        const raw = sessionStorage.getItem(storageKey(section, subsection));
        if (raw) {
          const parsed = JSON.parse(raw) as {
            items: Tile[];
            cursor: string | null;
            feed_version: string;
            has_more?: boolean;
            scrollY: number;
          };
          if (parsed.items?.length) {
            if (cancelled) return;
            setItems(parsed.items);
            setCursor(parsed.cursor);
            setFeedVersion(parsed.feed_version);
            feedVersionRef.current = parsed.feed_version;
            setHasMore(
              typeof parsed.has_more === "boolean"
                ? parsed.has_more
                : Boolean(parsed.cursor)
            );
            requestAnimationFrame(() =>
              window.scrollTo(0, parsed.scrollY ?? 0)
            );
            return;
          }
        }
      } catch {
        /* ignore */
      }

      if (cancelled) return;
      await fetchPage(null, false);
    }

    void init();

    return () => {
      cancelled = true;
    };
  }, [section, subsection, fetchPage]);

  useEffect(() => {
    const onScroll = () => {
      persist();
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [persist]);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        const first = entries[0];
        if (first?.isIntersecting && hasMore && !loading && cursor) {
          void fetchPage(cursor, true);
        }
      },
      { rootMargin: "800px" }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [hasMore, loading, cursor, fetchPage]);

  const showKidsTabs = section === "kids" || section === "teens";

  return (
    <div className="min-h-screen pb-10">
      <header className="sticky top-0 z-20 border-b border-white/10 bg-black/80 backdrop-blur">
        <div className="flex gap-1 overflow-x-auto px-2 py-2">
          {SECTIONS.map((s) => (
            <Link
              key={s.key}
              href={`/feed/${s.key}`}
              className={`shrink-0 rounded-full px-3 py-1.5 text-sm ${
                section === s.key
                  ? "bg-white text-black"
                  : "bg-white/10 text-white"
              }`}
            >
              {s.label}
            </Link>
          ))}
        </div>
        {showKidsTabs ? (
          <div className="flex gap-1 overflow-x-auto px-2 pb-2">
            {(section === "kids"
              ? [
                  { sub: undefined, label: "Все" },
                  { sub: "boys", label: "Мальчики" },
                  { sub: "girls", label: "Девочки" },
                ]
              : [
                  { sub: undefined, label: "Все" },
                  { sub: "teen_boys", label: "Мальчики" },
                  { sub: "teen_girls", label: "Девочки" },
                ]
            ).map((t) => {
              const href =
                t.sub === undefined
                  ? `/feed/${section}`
                  : `/feed/${section}?subsection=${t.sub}`;
              const active = (t.sub ?? "") === (subsection ?? "");
              return (
                <Link
                  key={t.label}
                  href={href}
                  className={`shrink-0 rounded-full px-3 py-1 text-xs ${
                    active ? "bg-white/20" : "bg-white/5"
                  }`}
                >
                  {t.label}
                </Link>
              );
            })}
          </div>
        ) : null}
      </header>

      {error ? (
        <div className="px-3 py-6 text-center text-sm text-red-300">
          {error}
          <button
            type="button"
            className="ml-3 underline"
            onClick={() => void fetchPage(null, false)}
          >
            Повторить
          </button>
        </div>
      ) : null}

      <main className={FEED_GRID_CLASS}>
        {items.map((it, idx) => {
          const ratio = tileWidthOverHeight(
            it.main_image_url,
            it.image_aspect_ratio
          );
          const href = `/product/${encodeURIComponent(it.id)}?section=${section}${
            subsection ? `&subsection=${encodeURIComponent(subsection)}` : ""
          }&position_index=${it.position_index}${
            feedVersion ? `&feed_version=${encodeURIComponent(feedVersion)}` : ""
          }`;
          return (
            <Link
              key={`${it.id}-${it.position_index}`}
              href={href}
              className="relative block w-full overflow-hidden bg-neutral-900"
              style={{ aspectRatio: cssAspectRatioBox(ratio) }}
              onClick={() => {
                initDiscoveryFromFeed({
                  section,
                  subsection,
                  feedVersion: feedVersionRef.current || feedVersion,
                  anchorProductId: it.id,
                  positionIndex: it.position_index,
                });
                persist();
              }}
            >
              <Image
                src={it.main_image_url}
                alt=""
                fill
                className="object-cover"
                sizes={FEED_IMAGE_SIZES}
                priority={idx < 6}
                unoptimized
              />
            </Link>
          );
        })}
      </main>

      <div ref={sentinelRef} className="h-8" />

      {loading ? (
        <p className="py-4 text-center text-xs text-white/50">Загрузка…</p>
      ) : null}

      {!hasMore && items.length > 0 ? (
        <p className="py-6 text-center text-xs text-white/40">Конец ленты</p>
      ) : null}

      {!loading && items.length === 0 && !error ? (
        <p className="px-4 py-10 text-center text-sm text-white/60">
          Нет товаров для отображения. Импортируйте фид:{" "}
          <code className="text-white/80">npm run import-feed</code>
        </p>
      ) : null}
    </div>
  );
}
