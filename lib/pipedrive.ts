import "server-only";

export type CrmSearchHit = {
  type: "organization" | "person";
  id: number;
  name: string;
  organizationId: number | null;
  organizationName: string | null;
  email: string | null;
  phone: string | null;
};

export type CrmDeal = {
  id: number;
  title: string;
  value: number | null;
  currency: string | null;
  status: string | null;
  expectedCloseDate: string | null;
};

export type CrmNote = {
  id: number;
  content: string;
  createdAt: string | null;
};

export type CrmActivity = {
  id: number;
  subject: string | null;
  type: string | null;
  done: boolean;
  dueDate: string | null;
  note: string | null;
};

export type CrmClient = {
  id: number;
  name: string;
  address: string | null;
  deals: CrmDeal[];
  notes: CrmNote[];
  activities: CrmActivity[];
};

type PipedriveConfig = {
  origin: string;
  token: string;
};

function config(): PipedriveConfig {
  const domain = process.env.PIPEDRIVE_DOMAIN?.trim();
  const token = process.env.PIPEDRIVE_API_TOKEN?.trim();
  if (!domain || !token) {
    throw new Error("Pipedrive is not configured.");
  }
  const host = domain.replace(/^https?:\/\//, "").replace(/\/$/, "");
  const origin = host.includes(".") ? `https://${host}` : `https://${host}.pipedrive.com`;
  return { origin, token };
}

async function pipedriveGet(path: string, params: Record<string, string> = {}): Promise<unknown> {
  const { origin, token } = config();
  const url = new URL(`/api/v1/${path.replace(/^\//, "")}`, origin);
  url.searchParams.set("api_token", token);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }

  const response = await fetch(url, { cache: "no-store" });
  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }

  const record = body && typeof body === "object" ? (body as { success?: boolean; data?: unknown }) : null;
  if (!response.ok || !record?.success) {
    if (response.status === 404) throw new Error("Pipedrive client was not found.");
    throw new Error(`Pipedrive request failed (${response.status}).`);
  }
  return record.data;
}

function text(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function plain(value: unknown): string {
  return String(value ?? "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function numberOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function firstContact(value: unknown): string | null {
  const direct = text(value);
  if (direct) return direct;
  if (!Array.isArray(value)) return null;
  for (const entry of value) {
    if (typeof entry === "string" && entry.trim()) return entry.trim();
    if (entry && typeof entry === "object" && "value" in entry) {
      const found = text((entry as { value?: unknown }).value);
      if (found) return found;
    }
  }
  return null;
}

function asList(data: unknown): Record<string, unknown>[] {
  if (!Array.isArray(data)) return [];
  return data.filter((item): item is Record<string, unknown> => !!item && typeof item === "object");
}

export async function crmSearch(query: string): Promise<CrmSearchHit[]> {
  const term = query.trim();
  if (term.length < 2) return [];

  const data = await pipedriveGet("itemSearch", {
    term,
    item_types: "organization,person",
    limit: "20",
  });
  const items = asList(data && typeof data === "object" ? (data as { items?: unknown }).items : null);

  return items.flatMap((entry) => {
    const item = entry.item;
    if (!item || typeof item !== "object") return [];
    const record = item as Record<string, unknown>;
    const type = record.type === "person" ? "person" : record.type === "organization" ? "organization" : null;
    const id = numberOrNull(record.id);
    const name = text(record.name);
    if (!type || id === null || !name) return [];

    const organization = record.organization;
    const orgRecord = organization && typeof organization === "object" ? (organization as Record<string, unknown>) : null;
    const organizationId = type === "organization" ? id : numberOrNull(orgRecord?.id);
    const organizationName = type === "organization" ? name : text(orgRecord?.name);

    return [
      {
        type,
        id,
        name,
        organizationId,
        organizationName,
        email: firstContact(record.emails ?? record.primary_email ?? record.email),
        phone: firstContact(record.phones ?? record.primary_phone ?? record.phone),
      },
    ];
  });
}

export async function crmGetClient(orgId: number): Promise<CrmClient> {
  if (!Number.isInteger(orgId) || orgId <= 0) {
    throw new Error("Pipedrive client was not found.");
  }

  const [organization, deals, notes, activities] = await Promise.all([
    pipedriveGet(`organizations/${orgId}`),
    pipedriveGet(`organizations/${orgId}/deals`, { status: "all_not_deleted", limit: "100" }),
    pipedriveGet("notes", { org_id: String(orgId), limit: "100" }),
    pipedriveGet(`organizations/${orgId}/activities`, { limit: "100" }),
  ]);

  const org = organization && typeof organization === "object" ? (organization as Record<string, unknown>) : {};

  return {
    id: orgId,
    name: text(org.name) ?? `Organization ${orgId}`,
    address: text(org.address),
    deals: asList(deals).flatMap((deal) => {
      const id = numberOrNull(deal.id);
      const title = text(deal.title);
      if (id === null || !title) return [];
      return [
        {
          id,
          title,
          value: numberOrNull(deal.value),
          currency: text(deal.currency),
          status: text(deal.status),
          expectedCloseDate: text(deal.expected_close_date),
        },
      ];
    }),
    notes: asList(notes).flatMap((note) => {
      const id = numberOrNull(note.id);
      const content = plain(note.content);
      if (id === null || !content) return [];
      return [{ id, content, createdAt: text(note.add_time) }];
    }),
    activities: asList(activities).flatMap((activity) => {
      const id = numberOrNull(activity.id);
      if (id === null) return [];
      const note = plain(activity.note);
      return [
        {
          id,
          subject: text(activity.subject),
          type: text(activity.type),
          done: activity.done === true || activity.done === 1,
          dueDate: text(activity.due_date),
          note: note.length > 0 ? note : null,
        },
      ];
    }),
  };
}
