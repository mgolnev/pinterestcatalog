import { NextResponse } from "next/server";
import { getMeta } from "@/lib/db";
import { getDb } from "@/lib/db";

export const runtime = "nodejs";

export async function GET() {
  try {
    getDb().prepare("SELECT 1").get();
    const fv = getMeta("active_feed_version");
    if (!fv) {
      return NextResponse.json(
        { ready: false, reason: "no_feed_version" },
        { status: 503 }
      );
    }
    return NextResponse.json({ ready: true, feed_version: fv });
  } catch (e) {
    return NextResponse.json(
      { ready: false, reason: "db_error" },
      { status: 503 }
    );
  }
}
