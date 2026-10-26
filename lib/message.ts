import { SPECIALISTS, type Channel, type SpecialistName } from "@/lib/constants";

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

export type SpecialistStreamEvent =
  | { type: "delta"; text: string }
  | { type: "message"; message: Message }
  | { type: "error"; error: string };

export function mentionedSpecialists(content: string): SpecialistName[] {
  const hits: { index: number; name: SpecialistName }[] = [];
  for (const specialist of SPECIALISTS) {
    const pattern = new RegExp(`(?:^|[^\\p{L}\\p{N}_])@${specialist.name}(?![\\p{L}\\p{N}_])`, "iu");
    const match = pattern.exec(content);
    if (!match) continue;
    hits.push({ index: match.index, name: specialist.name });
  }
  hits.sort((left, right) => left.index - right.index);
  return hits.map((hit) => hit.name);
}

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
