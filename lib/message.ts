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
  | { type: "status"; text: string }
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

export type NoteOffer = {
  content: string;
  label: string;
  org_id?: number;
  person_id?: number;
  lead_id?: string;
  proposed: boolean;
};

function positive(value: unknown): number | undefined {
  return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : undefined;
}

export function noteOffer(metaJson: string | null): NoteOffer | null {
  if (!metaJson) return null;
  try {
    const meta = JSON.parse(metaJson) as { noteOffer?: unknown };
    if (!meta.noteOffer || typeof meta.noteOffer !== "object" || Array.isArray(meta.noteOffer)) return null;
    const offer = meta.noteOffer as Record<string, unknown>;
    const content = typeof offer.content === "string" ? offer.content.trim() : "";
    const label = typeof offer.label === "string" ? offer.label.trim() : "";
    const orgId = positive(offer.org_id);
    const personId = positive(offer.person_id);
    const leadId = typeof offer.lead_id === "string" && offer.lead_id.trim() ? offer.lead_id.trim() : undefined;
    if (!content || !label || (!orgId && !personId && !leadId)) return null;
    return {
      content,
      label,
      org_id: orgId,
      person_id: personId,
      lead_id: leadId,
      proposed: offer.proposed === true,
    };
  } catch {
    return null;
  }
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
