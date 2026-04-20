import { z } from "zod";

const schema = z.object({
  o: z.number().int().min(0),
  fv: z.string(),
  sec: z.string(),
  sub: z.string().optional(),
  sid: z.string(),
});

export type FeedCursorPayload = z.infer<typeof schema>;

export function encodeFeedCursor(payload: FeedCursorPayload): string {
  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
}

export function decodeFeedCursor(raw: string | null): FeedCursorPayload | null {
  if (!raw) return null;
  try {
    const json = Buffer.from(raw, "base64url").toString("utf8");
    const parsed = JSON.parse(json) as unknown;
    const r = schema.safeParse(parsed);
    return r.success ? r.data : null;
  } catch {
    return null;
  }
}
