import type { Channel } from "@/lib/constants";

export type AuthorType = "human" | "agent";

export type Message = {
  id: number;
  channel: Channel;
  author: string;
  author_type: AuthorType;
  content: string;
  meta_json: string | null;
  created_at: string;
};

export function consultedNames(metaJson: string | null): string[] {
  if (!metaJson) return [];
  try {
    const meta = JSON.parse(metaJson) as { consulted?: unknown };
    if (!Array.isArray(meta.consulted)) return [];
    return meta.consulted.filter((name): name is string => typeof name === "string" && name.length > 0);
  } catch {
    return [];
  }
}
