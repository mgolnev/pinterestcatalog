import { NextResponse } from "next/server";
import { fetchFeedXml, importFeedFromXml } from "@/lib/feed/import-feed";
import { getFeedUrl } from "@/lib/env";

function authorize(req: Request): boolean {
  const secret = process.env.IMPORT_FEED_SECRET;
  if (!secret) return false;
  const auth = req.headers.get("authorization");
  const bearer = auth?.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  const header = req.headers.get("x-import-feed-secret")?.trim() ?? "";
  return bearer === secret || header === secret;
}

export async function importFeedPOST(req: Request): Promise<Response> {
  if (!process.env.IMPORT_FEED_SECRET) {
    return NextResponse.json(
      {
        error:
          "Задайте переменную IMPORT_FEED_SECRET в окружении и повторите запрос.",
      },
      { status: 503 }
    );
  }
  if (!authorize(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const url = getFeedUrl();
    const xml = await fetchFeedXml(url);
    const { feedVersion, inserted } = importFeedFromXml(xml);
    return NextResponse.json({
      ok: true,
      feed_url: url,
      feed_version: feedVersion,
      inserted,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function importFeedGET(): Promise<Response> {
  return NextResponse.json(
    {
      message:
        "Импорт: POST с заголовком Authorization: Bearer <IMPORT_FEED_SECRET> или X-Import-Feed-Secret.",
    },
    { status: 405, headers: { Allow: "POST" } }
  );
}
