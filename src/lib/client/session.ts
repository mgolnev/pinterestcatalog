"use client";

import { nanoid } from "nanoid";

const KEY = "gj_session_id_v1";

export function getSessionId(): string {
  if (typeof window === "undefined") return "ssr";
  try {
    let id = window.localStorage.getItem(KEY);
    if (!id) {
      id = nanoid();
      window.localStorage.setItem(KEY, id);
    }
    return id;
  } catch {
    return "localstorage-unavailable";
  }
}
