import { SPECIALISTS, type Channel, type SpecialistName } from "@/lib/constants";
import { limitLeadSegments } from "@/lib/lead-parse";

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

const LEADS_MENTION = /(?:^|[^\p{L}\p{N}_])@Leads(?![\p{L}\p{N}_])/iu;

export function mentionsLeads(content: string): boolean {
  return LEADS_MENTION.test(content);
}

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

export type LeadRowStatus = "new" | "approved" | "sent" | "duplicate";

export const LEAD_STATUS_LABEL: Record<LeadRowStatus, string> = {
  new: "Nova",
  approved: "Em aprovação",
  sent: "Enviada para o CRM",
  duplicate: "Já no Pipedrive",
};

export const LEAD_SEGMENT_LABEL: Record<string, string> = {
  lighting: "Iluminação",
  acoustics: "Acústica",
  outdoor: "Exterior",
  workplace: "Escritórios",
  biophilia: "Biofilia",
};

export type LeadTableRow = {
  id: number;
  company: string;
  city: string;
  whyItFits: string;
  segments: string[];
  sourceUrl: string;
  status: LeadRowStatus;
};

export type LeadTable = {
  searchId: number;
  fallback: boolean;
  rows: LeadTableRow[];
};

export type LeadBoardLead = LeadTableRow & {
  sector: string;
  website: string;
  generalContact: string;
};

export type LeadBoardSearch = {
  id: number;
  query: string;
  createdBy: string | null;
  createdAt: string;
  fallback: boolean;
  leads: LeadBoardLead[];
};

function leadStatus(value: unknown): LeadRowStatus {
  if (value === "approved" || value === "sent" || value === "duplicate") return value;
  return "new";
}

export function leadTable(metaJson: string | null): LeadTable | null {
  if (!metaJson) return null;
  try {
    const meta = JSON.parse(metaJson) as { leadsTable?: unknown };
    if (!meta.leadsTable || typeof meta.leadsTable !== "object" || Array.isArray(meta.leadsTable)) return null;
    const table = meta.leadsTable as Record<string, unknown>;
    const searchId = positive(table.searchId);
    if (!searchId || !Array.isArray(table.rows)) return null;
    const rows: LeadTableRow[] = [];
    for (const item of table.rows) {
      if (!item || typeof item !== "object" || Array.isArray(item)) continue;
      const row = item as Record<string, unknown>;
      const id = positive(row.id);
      const company = typeof row.company === "string" ? row.company.trim() : "";
      const sourceUrl = typeof row.sourceUrl === "string" ? row.sourceUrl.trim() : "";
      if (!id || !company || !sourceUrl) continue;
      rows.push({
        id,
        company,
        city: typeof row.city === "string" ? row.city.trim() : "",
        whyItFits: typeof row.whyItFits === "string" ? row.whyItFits.trim() : "",
        segments: limitLeadSegments(
          typeof row.whyItFits === "string" ? row.whyItFits : "",
          Array.isArray(row.segments) ? row.segments.filter((segment): segment is string => typeof segment === "string") : [],
        ),
        sourceUrl,
        status: leadStatus(row.status),
      });
    }
    return { searchId, fallback: table.fallback === true, rows };
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
