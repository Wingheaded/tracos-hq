import "server-only";

import { duplicateMessage, isApprovalType, type ApprovalRecord, type ApprovalType, type CrmMatch } from "@/lib/approval";
import { settleActivityDueDate } from "@/lib/dates";
import type { Channel } from "@/lib/constants";
import { getDb } from "@/lib/db";
import type { NoteOffer } from "@/lib/message";
import { setLeadStatus } from "@/lib/lead-records";
import { insertAgentMessage } from "@/lib/messages";
import {
  createCrmActivity,
  createCrmLead,
  createCrmNote,
  createCrmOrganization,
  createCrmPerson,
  crmGetClient,
  crmSearch,
  findCrmDuplicate,
  websiteHost,
} from "@/lib/pipedrive";

export type ProposeCrmResult =
  | { status: "pending"; approval: ApprovalRecord }
  | { status: "duplicate"; message: string; match: CrmMatch; noteOffer: NoteOffer; messageId: number };

const TEST_SUBJECT = "Visit Casa Maré on Thursday";

function positiveId(value: unknown, label: string): number | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) {
    throw new Error(`O campo ${label} da aprovação é inválido.`);
  }
  return value;
}

function requiredText(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`Falta o campo ${label} na aprovação.`);
  }
  return value.trim();
}

function optionalText(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function collectEmails(...values: unknown[]): string[] {
  const found: string[] = [];
  for (const value of values) {
    if (typeof value !== "string") continue;
    for (const match of value.matchAll(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi)) found.push(match[0].toLowerCase());
  }
  return [...new Set(found)];
}

function storedDueDate(value: unknown) {
  if (typeof value !== "string" || !value.trim()) return undefined;
  const settled = settleActivityDueDate({ due_date: value }, "");
  return typeof settled.due_date === "string" ? settled.due_date : undefined;
}

function optionalLeadId(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function normalizePayload(type: ApprovalType, payload: unknown): Record<string, unknown> {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("Falta o conteúdo da aprovação.");
  }
  const record = payload as Record<string, unknown>;
  if (type === "note") {
    const note = {
      content: requiredText(record.content, "note"),
      org_id: positiveId(record.org_id, "organization"),
      deal_id: positiveId(record.deal_id, "deal"),
      person_id: positiveId(record.person_id, "person"),
      lead_id: optionalLeadId(record.lead_id),
    };
    if (!note.org_id && !note.deal_id && !note.person_id && !note.lead_id) {
      throw new Error("Uma nota precisa de um registo onde ficar.");
    }
    return note;
  }
  if (type === "activity") {
    return {
      subject: requiredText(record.subject, "subject"),
      type: typeof record.type === "string" && record.type.trim() ? record.type.trim() : "meeting",
      due_date: storedDueDate(record.due_date),
      org_id: positiveId(record.org_id, "organization"),
      deal_id: positiveId(record.deal_id, "deal"),
      person_id: positiveId(record.person_id, "person"),
      note: typeof record.note === "string" ? record.note.trim() : undefined,
    };
  }
  const company = requiredText(record.company ?? record.title, "company");
  const contact = optionalText(record.contact);
  const emails = collectEmails(record.email, contact);
  return {
    title: optionalText(record.title) ?? company,
    company,
    city: optionalText(record.city),
    contact,
    website: optionalText(record.website),
    email: emails[0],
    organization_id: positiveId(record.organization_id, "organization"),
    person_id: positiveId(record.person_id, "person"),
    lead_row_id: positiveId(record.lead_row_id, "lead"),
  };
}

function rowToApproval(row: {
  id: number;
  type: string;
  payload_json: string;
  reason: string | null;
  status: string;
  created_by: string | null;
  decided_by: string | null;
  created_at: string;
  decided_at: string | null;
}): ApprovalRecord {
  let payload: Record<string, unknown> = {};
  try {
    const parsed = JSON.parse(row.payload_json) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) payload = parsed as Record<string, unknown>;
  } catch {
    payload = {};
  }
  return {
    id: row.id,
    type: isApprovalType(row.type) ? row.type : "note",
    payload,
    reason: row.reason,
    status: row.status === "approved" || row.status === "rejected" ? row.status : "pending",
    created_by: row.created_by,
    decided_by: row.decided_by,
    created_at: row.created_at,
    decided_at: row.decided_at,
  };
}

function noteTarget(match: CrmMatch): Pick<NoteOffer, "org_id" | "person_id" | "lead_id"> {
  if (match.kind === "organization" && typeof match.id === "number") return { org_id: match.id };
  if (match.kind === "person" && typeof match.id === "number") return { person_id: match.id };
  if (match.kind === "lead") return { lead_id: String(match.id) };
  throw new Error("Este resultado do Pipedrive não tem um registo para a nota.");
}

function leadNote(payload: Record<string, unknown>, matches: readonly CrmMatch[]): string {
  const lines = [duplicateMessage(matches)];
  for (const [label, key] of [
    ["Empresa", "company"],
    ["Cidade", "city"],
    ["Contacto", "contact"],
    ["Site", "website"],
  ] as const) {
    const value = optionalText(payload[key]);
    if (value) lines.push(`${label}: ${value}`);
  }
  return lines.join("\n");
}

function insertPending(type: ApprovalType, payload: Record<string, unknown>, reason: string, createdBy?: string): ApprovalRecord {
  const db = getDb();
  const inserted = db
    .prepare(
      `INSERT INTO approvals (type, payload_json, reason, status, created_by, created_at)
       VALUES (@type, @payload_json, @reason, 'pending', @created_by, @created_at)`,
    )
    .run({
      type,
      payload_json: JSON.stringify(payload),
      reason: reason.trim() || null,
      created_by: createdBy?.trim() || null,
      created_at: new Date().toISOString(),
    });
  const row = db.prepare(`SELECT * FROM approvals WHERE id = ?`).get(inserted.lastInsertRowid) as Parameters<
    typeof rowToApproval
  >[0];
  return rowToApproval(row);
}

export async function proposeCrmWrite(
  type: ApprovalType,
  payload: unknown,
  reason: string,
  createdBy?: string,
  channel: Channel = "leads",
): Promise<ProposeCrmResult> {
  const normalized = normalizePayload(type, payload);
  if (type === "lead") {
    const groups = await findCrmDuplicate({
      company: optionalText(normalized.company),
      emails: collectEmails(normalized.email, normalized.contact),
      website: optionalText(normalized.website),
    });
    if (groups.length > 0) {
      let first: ProposeCrmResult | null = null;
      for (const group of groups) {
        const primary = group.find((match) => match.kind === "organization") ?? group[0];
        const offer: NoteOffer = {
          content: leadNote(normalized, group),
          label: primary.name,
          ...noteTarget(primary),
          proposed: false,
        };
        const message = duplicateMessage(group);
        const existing = getDb()
          .prepare(
            `SELECT id FROM messages WHERE channel = ? AND author = 'Leads' AND content = ? ORDER BY id DESC LIMIT 1`,
          )
          .get(channel, message) as { id: number } | undefined;
        const messageId = existing
          ? existing.id
          : insertAgentMessage({
              channel,
              author: "Leads",
              content: message,
              meta: { noteOffer: offer },
            }).id;
        if (!first) first = { status: "duplicate", message, match: primary, noteOffer: offer, messageId };
      }
      if (first) return first;
    }
  }
  return { status: "pending", approval: insertPending(type, normalized, reason, createdBy) };
}

export function listApprovals(): ApprovalRecord[] {
  const rows = getDb().prepare(`SELECT * FROM approvals ORDER BY id DESC`).all() as Parameters<typeof rowToApproval>[0][];
  return rows.map(rowToApproval);
}

function readApproval(id: number): ApprovalRecord | null {
  const row = getDb().prepare(`SELECT * FROM approvals WHERE id = ?`).get(id) as Parameters<typeof rowToApproval>[0] | undefined;
  return row ? rowToApproval(row) : null;
}

function savePendingPayload(id: number, payload: Record<string, unknown>) {
  getDb()
    .prepare(`UPDATE approvals SET payload_json = ? WHERE id = ? AND status = 'pending'`)
    .run(JSON.stringify(payload), id);
}

const GENERIC_EMAIL =
  /^(info|reservas|reservations|hello|contact|contacts|geral|general|rececao|recepção|reception|office|mail|booking|bookings|stay|hotel|comercial|sales|welcome|enquiry|enquiries)@/i;
const PHONE_NUMBER = /\+?\d[\d\s()./-]{7,}\d/;

function phoneNumber(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const match = value.match(PHONE_NUMBER);
  if (!match) return undefined;
  const digits = match[0].replace(/\D/g, "");
  if (digits.length < 9 || digits.length > 15) return undefined;
  return match[0].replace(/\s+/g, " ").trim();
}

export function classifyLeadContact(contact: string | undefined, emailField?: string): {
  name?: string;
  phone?: string;
  email?: string;
} {
  const email = collectEmails(emailField, contact)[0];
  const phone = phoneNumber(contact);
  const name = (contact ?? "")
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, " ")
    .replace(new RegExp(PHONE_NUMBER.source, "g"), " ")
    .replace(/\b(tel\.?|telefone|phone|e-?mail|email|contacto|contato)\b/gi, " ")
    .replace(/[<>(),;|/]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const person = /\p{L}/u.test(name) && name.length >= 2 ? name : undefined;
  if (!person || (email !== undefined && GENERIC_EMAIL.test(email) && person.toLowerCase() === email.split("@")[0]?.toLowerCase())) {
    return { phone, email };
  }
  return { name: person, phone, email };
}

function websiteForCrm(value: string | undefined): string | undefined {
  if (!value || !websiteHost(value)) return undefined;
  return /^[a-z][a-z0-9+.-]*:\/\//i.test(value) ? value : `https://${value}`;
}

async function createInPipedrive(type: ApprovalType, approvalId: number, payload: Record<string, unknown>): Promise<Record<string, unknown>> {
  const normalized = normalizePayload(type, payload);
  if (type === "note") {
    const id = await createCrmNote({
      content: String(normalized.content),
      org_id: normalized.org_id as number | undefined,
      deal_id: normalized.deal_id as number | undefined,
      person_id: normalized.person_id as number | undefined,
      lead_id: optionalText(normalized.lead_id),
    });
    return { ...normalized, pipedrive_id: id };
  }
  if (type === "activity") {
    const id = await createCrmActivity({
      subject: String(normalized.subject),
      type: String(normalized.type),
      due_date: typeof normalized.due_date === "string" ? normalized.due_date : undefined,
      org_id: normalized.org_id as number | undefined,
      deal_id: normalized.deal_id as number | undefined,
      person_id: normalized.person_id as number | undefined,
      note: typeof normalized.note === "string" ? normalized.note : undefined,
    });
    return { ...normalized, pipedrive_id: id };
  }

  const next = { ...normalized };
  const company = requiredText(next.company ?? next.title, "company");
  const contact = optionalText(next.contact);
  const leadContact = classifyLeadContact(contact, optionalText(next.email));
  const emails = collectEmails(leadContact.email);
  let organizationId = positiveId(next.organization_id, "organization");
  if (!organizationId) {
    const duplicate = await findCrmDuplicate({
      company,
      emails,
      website: optionalText(next.website),
    });
    if (duplicate.length > 0) throw new Error(duplicate.map((group) => duplicateMessage(group)).join("\n"));
    organizationId = await createCrmOrganization({
      name: company,
      city: optionalText(next.city),
      website: websiteForCrm(optionalText(next.website)),
      phone: leadContact.name ? undefined : leadContact.phone,
      email: leadContact.name ? undefined : leadContact.email,
    });
    next.organization_id = organizationId;
    savePendingPayload(approvalId, next);
  }

  let personId = positiveId(next.person_id, "person");
  if (!personId && leadContact.name) {
    personId = await createCrmPerson({
      name: leadContact.name,
      org_id: organizationId,
      email: leadContact.email,
      phone: leadContact.phone,
    });
    next.person_id = personId;
    savePendingPayload(approvalId, next);
  }

  const leadId = await createCrmLead({
    title: optionalText(next.title) ?? company,
    organization_id: organizationId,
    person_id: personId,
  });
  return { ...next, organization_id: organizationId, person_id: personId, pipedrive_id: leadId };
}

export async function decideApproval(
  id: number,
  decision: "approve" | "reject",
  decidedBy: string,
): Promise<ApprovalRecord> {
  const current = readApproval(id);
  if (!current) throw new Error("A aprovação não foi encontrada.");
  if (current.status !== "pending") throw new Error("Esta aprovação já foi decidida.");

  let payload = current.payload;
  if (decision === "approve") {
    payload = await createInPipedrive(current.type, current.id, current.payload);
  }

  const result = getDb()
    .prepare(
      `UPDATE approvals
       SET status = @status, decided_by = @decided_by, decided_at = @decided_at, payload_json = @payload_json
       WHERE id = @id AND status = 'pending'`,
    )
    .run({
      id,
      status: decision === "approve" ? "approved" : "rejected",
      decided_by: decidedBy,
      decided_at: new Date().toISOString(),
      payload_json: JSON.stringify(payload),
    });
  if (result.changes === 0) throw new Error("Esta aprovação já foi decidida.");
  const updated = readApproval(id);
  if (!updated) throw new Error("A aprovação não foi encontrada.");
  if (updated.type === "lead") {
    const rowId = updated.payload.lead_row_id;
    if (typeof rowId === "number" && Number.isInteger(rowId) && rowId > 0) {
      setLeadStatus(rowId, decision === "approve" ? "sent" : "new");
    }
  }
  return updated;
}

function upcomingThursday(from = new Date()): string {
  const date = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  const daysUntilThursday = (4 - date.getDay() + 7) % 7;
  date.setDate(date.getDate() + daysUntilThursday);
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

export async function proposeCasaMareVisit(createdBy?: string): Promise<ApprovalRecord> {
  const matches = await crmSearch("Casa Maré");
  const organization = matches.find((match) => match.type === "organization" && /casa maré/i.test(match.name));
  if (!organization) throw new Error("A Casa Maré não foi encontrada no Pipedrive.");
  const client = await crmGetClient(organization.id);
  const deal = client.deals.find((item) => item.status === "open") ?? client.deals[0];
  if (!deal) throw new Error("A Casa Maré não tem um negócio.");

  const result = await proposeCrmWrite(
    "activity",
    {
      subject: TEST_SUBJECT,
      type: "meeting",
      due_date: upcomingThursday(),
      org_id: organization.id,
      deal_id: deal.id,
    },
    `Atividade de teste para ${deal.title}.`,
    createdBy,
  );
  if (result.status !== "pending") throw new Error("Não foi possível criar a aprovação de teste.");
  return result.approval;
}
