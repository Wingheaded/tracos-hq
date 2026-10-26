const SECTORS = new Set(["hotel", "restaurant", "office", "architecture_studio", "developer", "retail", "other"]);
const SEGMENTS = new Set(["lighting", "acoustics", "outdoor", "workplace", "biophilia"]);

const SEGMENT_CUES: { weight: number; pattern: RegExp; segments: string[] }[] = [
  { weight: 5, pattern: /\b(spas?|wellness|well-being|wellbeing|bem-estar)\b/i, segments: ["biophilia", "acoustics"] },
  { weight: 5, pattern: /\b(rooftops?|terraces?|terraços?|terraço|esplanadas?)\b/i, segments: ["outdoor", "lighting"] },
  { weight: 4, pattern: /\b(gardens?|jardins?|biophili\w*|paredes? verdes?|inspira[cç][aã]o natural)\b/i, segments: ["biophilia", "outdoor"] },
  { weight: 3, pattern: /\b(restaurants?|restaurantes?|dining|bares?|bars?)\b/i, segments: ["acoustics", "lighting"] },
  { weight: 3, pattern: /\b(conferences?|confer[eê]ncias?|meeting rooms?|salas? de reuni[oõ]es|escrit[oó]rios?|workplaces?|headquarters)\b/i, segments: ["workplace", "acoustics"] },
  { weight: 2, pattern: /\b(pools?|piscinas?)\b/i, segments: ["outdoor", "lighting"] },
  { weight: 2, pattern: /\b(acoustics?|ac[uú]stic\w*)\b/i, segments: ["acoustics", "lighting"] },
  { weight: 1, pattern: /\b(rooms?|suites?|su[ií]tes?|quartos?|interiors?|interiores|lobbies|lobby)\b/i, segments: ["lighting", "acoustics"] },
];

export function limitLeadSegments(whyItFits: string, suggested: readonly string[]): string[] {
  let best: { weight: number; index: number; segments: string[] } | null = null;
  for (const cue of SEGMENT_CUES) {
    const match = cue.pattern.exec(whyItFits);
    if (!match || match.index === undefined) continue;
    if (!best || cue.weight > best.weight || (cue.weight === best.weight && match.index < best.index)) {
      best = { weight: cue.weight, index: match.index, segments: cue.segments };
    }
  }
  if (best) return best.segments.slice(0, 2);
  return [...new Set(suggested.filter((segment) => SEGMENTS.has(segment)))].slice(0, 2);
}
const GENERIC_EMAIL =
  /^(info|reservas|reservations|hello|contact|contacts|geral|general|rececao|reception|office|mail|booking|bookings|stay|hotel|comercial|sales|welcome|enquiry|enquiries)@/i;

export type ParsedLead = {
  company: string;
  website: string;
  city: string;
  sector: string;
  whyItFits: string;
  segments: string[];
  generalContact: string;
  sourceUrl: string;
};

function httpUrl(value: unknown): string {
  if (typeof value !== "string") return "";
  const text = value.trim();
  if (!/^https?:\/\//i.test(text)) return "";
  try {
    const url = new URL(text);
    if (url.protocol !== "http:" && url.protocol !== "https:") return "";
    return url.toString();
  } catch {
    return "";
  }
}

function cleanContact(value: unknown): string {
  if (typeof value !== "string") return "";
  const text = value.trim();
  if (!text || /linkedin\.com/i.test(text)) return "";
  const email = text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0] ?? "";
  if (email) return GENERIC_EMAIL.test(email) ? email.toLowerCase() : "";
  const digits = text.replace(/\D/g, "");
  if (digits.length >= 9 && digits.length <= 15) return text.slice(0, 40);
  return "";
}

export function parseLeadDocument(value: unknown): { query: string; leads: ParsedLead[] } {
  if (!value || typeof value !== "object" || Array.isArray(value)) return { query: "", leads: [] };
  const record = value as Record<string, unknown>;
  const query = typeof record.query === "string" ? record.query.trim() : "";
  const source = Array.isArray(record.leads) ? record.leads : [];
  const leads: ParsedLead[] = [];
  for (const item of source) {
    if (leads.length >= 15) break;
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const lead = item as Record<string, unknown>;
    const company = typeof lead.company === "string" ? lead.company.trim() : "";
    const sourceUrl = httpUrl(lead.source_url);
    if (!company || !sourceUrl) continue;
    const sectorRaw = typeof lead.sector === "string" ? lead.sector.trim() : "";
    const rawSegments = Array.isArray(lead.relevant_segments) ? lead.relevant_segments : [];
    const whyItFits = typeof lead.why_it_fits === "string" ? lead.why_it_fits.trim().slice(0, 500) : "";
    leads.push({
      company: company.slice(0, 200),
      website: httpUrl(lead.website),
      city: typeof lead.city === "string" ? lead.city.trim().slice(0, 120) : "",
      sector: SECTORS.has(sectorRaw) ? sectorRaw : "other",
      whyItFits,
      segments: limitLeadSegments(
        whyItFits,
        rawSegments.filter((segment): segment is string => typeof segment === "string"),
      ),
      generalContact: cleanContact(lead.general_contact),
      sourceUrl,
    });
  }
  return { query, leads };
}

export function extractJsonObject(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const source = fenced?.[1] ?? text;
  const start = source.indexOf("{");
  const end = source.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("A resposta não trouxe JSON.");
  return JSON.parse(source.slice(start, end + 1)) as unknown;
}
