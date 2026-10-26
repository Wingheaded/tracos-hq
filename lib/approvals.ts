import "server-only";

import { getDb } from "@/lib/db";
import { isApprovalType, type ApprovalRecord, type ApprovalType } from "@/lib/approval";
import { createCrmActivity, createCrmLead, createCrmNote, crmGetClient, crmSearch } from "@/lib/pipedrive";

const TEST_SUBJECT = "Visit Casa Maré on Thursday";

function positiveId(value: unknown, label: string): number | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) {
    throw new Error(`Approval ${label} is invalid.`);
  }
  return value;
}

function requiredText(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`Approval ${label} is missing.`);
  }
  return value.trim();
}

function normalizePayload(type: ApprovalType, payload: unknown): Record<string, unknown> {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("Approval payload is missing.");
  }
  const record = payload as Record<string, unknown>;
  if (type === "note") {
    return {
      content: requiredText(record.content, "note"),
      org_id: positiveId(record.org_id, "organization"),
      deal_id: positiveId(record.deal_id, "deal"),
      person_id: positiveId(record.person_id, "person"),
    };
  }
  if (type === "activity") {
    return {
      subject: requiredText(record.subject, "subject"),
      type: typeof record.type === "string" && record.type.trim() ? record.type.trim() : "meeting",
      due_date: typeof record.due_date === "string" ? record.due_date : undefined,
      org_id: positiveId(record.org_id, "organization"),
      deal_id: positiveId(record.deal_id, "deal"),
      person_id: positiveId(record.person_id, "person"),
      note: typeof record.note === "string" ? record.note.trim() : undefined,
    };
  }
  const organizationId = positiveId(record.organization_id, "organization");
  const personId = positiveId(record.person_id, "person");
  if (!organizationId && !personId) {
    throw new Error("A lead needs an organization or a person.");
  }
  return {
    title: requiredText(record.title, "title"),
    organization_id: organizationId,
    person_id: personId,
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

export function proposeCrmWrite(
  type: ApprovalType,
  payload: unknown,
  reason: string,
  createdBy?: string,
): ApprovalRecord {
  const normalized = normalizePayload(type, payload);
  const db = getDb();
  const inserted = db
    .prepare(
      `INSERT INTO approvals (type, payload_json, reason, status, created_by, created_at)
       VALUES (@type, @payload_json, @reason, 'pending', @created_by, @created_at)`,
    )
    .run({
      type,
      payload_json: JSON.stringify(normalized),
      reason: reason.trim() || null,
      created_by: createdBy?.trim() || null,
      created_at: new Date().toISOString(),
    });
  const row = db.prepare(`SELECT * FROM approvals WHERE id = ?`).get(inserted.lastInsertRowid) as Parameters<
    typeof rowToApproval
  >[0];
  return rowToApproval(row);
}

export function listApprovals(): ApprovalRecord[] {
  const rows = getDb().prepare(`SELECT * FROM approvals ORDER BY id DESC`).all() as Parameters<typeof rowToApproval>[0][];
  return rows.map(rowToApproval);
}

function readApproval(id: number): ApprovalRecord | null {
  const row = getDb().prepare(`SELECT * FROM approvals WHERE id = ?`).get(id) as Parameters<typeof rowToApproval>[0] | undefined;
  return row ? rowToApproval(row) : null;
}

async function createInPipedrive(type: ApprovalType, payload: Record<string, unknown>): Promise<number> {
  const normalized = normalizePayload(type, payload);
  if (type === "note") {
    return createCrmNote({
      content: String(normalized.content),
      org_id: normalized.org_id as number | undefined,
      deal_id: normalized.deal_id as number | undefined,
      person_id: normalized.person_id as number | undefined,
    });
  }
  if (type === "activity") {
    return createCrmActivity({
      subject: String(normalized.subject),
      type: String(normalized.type),
      due_date: typeof normalized.due_date === "string" ? normalized.due_date : undefined,
      org_id: normalized.org_id as number | undefined,
      deal_id: normalized.deal_id as number | undefined,
      person_id: normalized.person_id as number | undefined,
      note: typeof normalized.note === "string" ? normalized.note : undefined,
    });
  }
  return createCrmLead({
    title: String(normalized.title),
    organization_id: normalized.organization_id as number | undefined,
    person_id: normalized.person_id as number | undefined,
  });
}

export async function decideApproval(
  id: number,
  decision: "approve" | "reject",
  decidedBy: string,
): Promise<ApprovalRecord> {
  const current = readApproval(id);
  if (!current) throw new Error("Approval was not found.");
  if (current.status !== "pending") throw new Error("This approval is already decided.");

  let payload = current.payload;
  if (decision === "approve") {
    const pipedriveId = await createInPipedrive(current.type, current.payload);
    payload = { ...current.payload, pipedrive_id: pipedriveId };
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
  if (result.changes === 0) throw new Error("This approval is already decided.");
  const updated = readApproval(id);
  if (!updated) throw new Error("Approval was not found.");
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
  if (!organization) throw new Error("Casa Maré was not found in Pipedrive.");
  const client = await crmGetClient(organization.id);
  const deal = client.deals.find((item) => item.status === "open") ?? client.deals[0];
  if (!deal) throw new Error("Casa Maré has no deal.");

  return proposeCrmWrite(
    "activity",
    {
      subject: TEST_SUBJECT,
      type: "meeting",
      due_date: upcomingThursday(),
      org_id: organization.id,
      deal_id: deal.id,
    },
    `Test activity for ${deal.title}.`,
    createdBy,
  );
}
