import "server-only";

import { getDb } from "@/lib/db";
import { limitLeadSegments, type ParsedLead } from "@/lib/lead-parse";
import {
  LEAD_SEGMENT_LABEL,
  LEAD_STATUS_LABEL,
  type LeadBoardLead,
  type LeadBoardSearch,
  type LeadRowStatus,
  type LeadTableRow,
} from "@/lib/message";

const STATUSES = new Set<LeadRowStatus>(["new", "approved", "sent", "duplicate"]);

type LeadRow = {
  id: number;
  search_id: string | null;
  company: string | null;
  website: string | null;
  city: string | null;
  sector: string | null;
  why_it_fits: string | null;
  segments: string | null;
  general_contact: string | null;
  source_url: string | null;
  status: string | null;
};

function asStatus(value: string | null): LeadRowStatus {
  return value && STATUSES.has(value as LeadRowStatus) ? (value as LeadRowStatus) : "new";
}

function parseSegments(value: string | null): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

function toBoardLead(row: LeadRow): LeadBoardLead {
  return {
    id: row.id,
    company: row.company?.trim() ?? "",
    city: row.city?.trim() ?? "",
    sector: row.sector?.trim() ?? "",
    whyItFits: row.why_it_fits?.trim() ?? "",
    segments: limitLeadSegments(row.why_it_fits?.trim() ?? "", parseSegments(row.segments)),
    website: row.website?.trim() ?? "",
    generalContact: row.general_contact?.trim() ?? "",
    sourceUrl: row.source_url?.trim() ?? "",
    status: asStatus(row.status),
  };
}

export function saveSearch(input: {
  query: string;
  createdBy: string;
  fallback: boolean;
  leads: ParsedLead[];
}): { searchId: number; rows: LeadTableRow[] } {
  const db = getDb();
  const insertSearch = db.prepare(
    `INSERT INTO searches (query, created_by, created_at, fallback)
     VALUES (@query, @created_by, @created_at, @fallback)`,
  );
  const insertLead = db.prepare(
    `INSERT INTO leads (search_id, company, website, city, sector, why_it_fits, segments, general_contact, source_url, status)
     VALUES (@search_id, @company, @website, @city, @sector, @why_it_fits, @segments, @general_contact, @source_url, 'new')`,
  );
  const save = db.transaction(() => {
    const search = insertSearch.run({
      query: input.query,
      created_by: input.createdBy,
      created_at: new Date().toISOString(),
      fallback: input.fallback ? 1 : 0,
    });
    const searchId = Number(search.lastInsertRowid);
    const rows: LeadTableRow[] = [];
    for (const lead of input.leads) {
      const inserted = insertLead.run({
        search_id: String(searchId),
        company: lead.company,
        website: lead.website,
        city: lead.city,
        sector: lead.sector,
        why_it_fits: lead.whyItFits,
        segments: JSON.stringify(lead.segments),
        general_contact: lead.generalContact,
        source_url: lead.sourceUrl,
      });
      rows.push({
        id: Number(inserted.lastInsertRowid),
        company: lead.company,
        city: lead.city,
        whyItFits: lead.whyItFits,
        segments: lead.segments,
        sourceUrl: lead.sourceUrl,
        status: "new",
      });
    }
    return { searchId, rows };
  });
  return save();
}

export function attachSearchMessage(searchId: number, messageId: number) {
  getDb().prepare(`UPDATE searches SET message_id = ? WHERE id = ?`).run(messageId, searchId);
}

export function readStoredLead(id: number): (LeadBoardLead & { searchId: string }) | null {
  const row = getDb().prepare(`SELECT * FROM leads WHERE id = ?`).get(id) as LeadRow | undefined;
  if (!row) return null;
  return { ...toBoardLead(row), searchId: row.search_id ?? "" };
}

function patchMessageStatus(messageId: number, leadId: number, status: LeadRowStatus) {
  const db = getDb();
  const row = db.prepare(`SELECT meta_json FROM messages WHERE id = ?`).get(messageId) as
    | { meta_json: string | null }
    | undefined;
  if (!row?.meta_json) return;
  try {
    const meta = JSON.parse(row.meta_json) as { leadsTable?: { rows?: { id?: number; status?: string }[] } };
    const rows = meta.leadsTable?.rows;
    if (!Array.isArray(rows)) return;
    let changed = false;
    for (const item of rows) {
      if (item?.id === leadId) {
        item.status = status;
        changed = true;
      }
    }
    if (!changed) return;
    db.prepare(`UPDATE messages SET meta_json = ? WHERE id = ?`).run(JSON.stringify(meta), messageId);
  } catch {
    return;
  }
}

export function setLeadStatus(leadId: number, status: LeadRowStatus) {
  const db = getDb();
  const lead = db.prepare(`SELECT search_id FROM leads WHERE id = ?`).get(leadId) as { search_id: string | null } | undefined;
  if (!lead) return;
  db.prepare(`UPDATE leads SET status = ? WHERE id = ?`).run(status, leadId);
  const searchId = Number(lead.search_id);
  if (!Number.isInteger(searchId) || searchId <= 0) return;
  const search = db.prepare(`SELECT message_id FROM searches WHERE id = ?`).get(searchId) as
    | { message_id: number | null }
    | undefined;
  if (!search?.message_id) return;
  patchMessageStatus(search.message_id, leadId, status);
}

export function listLeadBoard(): LeadBoardSearch[] {
  const db = getDb();
  const searches = db
    .prepare(
      `SELECT id, query, created_by, created_at, fallback
       FROM searches
       ORDER BY id DESC`,
    )
    .all() as {
    id: number;
    query: string;
    created_by: string | null;
    created_at: string;
    fallback: number;
  }[];
  const leads = db.prepare(`SELECT * FROM leads ORDER BY id ASC`).all() as LeadRow[];
  return searches.map((search) => ({
    id: search.id,
    query: search.query,
    createdBy: search.created_by,
    createdAt: search.created_at,
    fallback: search.fallback === 1,
    leads: leads.filter((lead) => lead.search_id === String(search.id)).map(toBoardLead),
  }));
}

function csvCell(value: string) {
  if (/[",\n\r]/.test(value)) return `"${value.replaceAll('"', '""')}"`;
  return value;
}

export function leadsCsv(): string {
  const header = [
    "empresa",
    "cidade",
    "sector",
    "porque encaixa",
    "segmentos",
    "site",
    "contacto",
    "fonte",
    "estado",
    "pesquisa",
  ];
  const lines = [header.join(",")];
  for (const search of listLeadBoard()) {
    for (const lead of search.leads) {
      lines.push(
        [
          lead.company,
          lead.city,
          lead.sector,
          lead.whyItFits,
          lead.segments.map((segment) => LEAD_SEGMENT_LABEL[segment] ?? segment).join("; "),
          lead.website,
          lead.generalContact,
          lead.sourceUrl,
          LEAD_STATUS_LABEL[lead.status],
          search.query,
        ]
          .map(csvCell)
          .join(","),
      );
    }
  }
  return `\uFEFF${lines.join("\r\n")}\r\n`;
}
