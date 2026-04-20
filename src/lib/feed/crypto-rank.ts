import { createHash } from "node:crypto";

/** Стабильный числовой ранг для ORDER BY в рамках feed_version + section + session bucket. */
export function feedRankToken(
  productId: string,
  feedVersion: string,
  section: string,
  subsection: string | undefined,
  sessionBucket: number
): string {
  const h = createHash("sha256")
    .update(
      `${feedVersion}|${section}|${subsection ?? ""}|${sessionBucket}|${productId}`,
      "utf8"
    )
    .digest("hex");
  return h;
}

export function sessionBucketFromSessionId(sessionId: string): number {
  const digits = sessionId.replace(/\D/g, "");
  if (digits.length === 0) {
    const h = createHash("sha256").update(sessionId, "utf8").digest();
    return h.readUInt32BE(0) % 100000;
  }
  return Number.parseInt(digits.slice(0, 9), 10) % 100000;
}
