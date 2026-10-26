import "server-only";

import type { CrmMatch } from "@/lib/approval";

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
    throw new Error("O Pipedrive não está configurado.");
  }
  const host = domain.replace(/^https?:\/\//, "").replace(/\/$/, "");
  const origin = host.includes(".") ? `https://${host}` : `https://${host}.pipedrive.com`;
  return { origin, token };
}

async function pipedriveRequest(
  path: string,
  options: { method?: "GET" | "POST"; params?: Record<string, string>; body?: Record<string, unknown> } = {},
): Promise<unknown> {
  const { origin, token } = config();
  const url = new URL(`/api/v1/${path.replace(/^\//, "")}`, origin);
  url.searchParams.set("api_token", token);
  for (const [key, value] of Object.entries(options.params ?? {})) {
    url.searchParams.set(key, value);
  }

  const response = await fetch(url, {
    method: options.method ?? "GET",
    cache: "no-store",
    headers: options.body ? { "Content-Type": "application/json" } : undefined,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }

  const record = body && typeof body === "object" ? (body as { success?: boolean; data?: unknown; error?: unknown }) : null;
  if (!response.ok || !record?.success) {
    const detail = typeof record?.error === "string" && !/api_token|token/i.test(record.error) ? record.error : null;
    if (response.status === 404) throw new Error(detail ?? "O cliente não foi encontrado no Pipedrive.");
    throw new Error(detail ?? `O pedido ao Pipedrive falhou (${response.status}).`);
  }
  return record.data;
}

async function pipedriveGet(path: string, params: Record<string, string> = {}): Promise<unknown> {
  return pipedriveRequest(path, { params });
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

function definedFields(fields: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(fields).filter(([, value]) => value !== undefined && value !== null && value !== ""));
}

function crmId(value: unknown): string | null {
  if (typeof value === "number" && Number.isInteger(value) && value > 0) return String(value);
  if (typeof value === "string" && value.trim()) return value.trim();
  return null;
}

function foldName(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function sameCompanyName(left: string, right: string): boolean {
  const a = foldName(left);
  const b = foldName(right);
  if (!a || !b) return false;
  if (a === b) return true;
  const shorter = a.length <= b.length ? a : b;
  const longer = a.length <= b.length ? b : a;
  return shorter.split(" ").length >= 2 && longer.startsWith(`${shorter} `);
}

export function websiteHost(value: string | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  try {
    const withProtocol = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
    const host = new URL(withProtocol).hostname.replace(/^www\./i, "").replace(/\.$/, "").toLowerCase();
    if (!host.includes(".") || host.length < 4) return null;
    return host;
  } catch {
    return null;
  }
}

function emailHost(value: string): string | null {
  const host = value.split("@")[1]?.replace(/\.$/, "").toLowerCase();
  if (!host || !host.includes(".")) return null;
  return host;
}

function emailsFrom(record: Record<string, unknown>): string[] {
  const found: string[] = [];
  const collect = (value: unknown) => {
    if (typeof value === "string") {
      for (const match of value.matchAll(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi)) found.push(match[0].toLowerCase());
      return;
    }
    if (!Array.isArray(value)) return;
    for (const entry of value) {
      if (typeof entry === "string") collect(entry);
      else if (entry && typeof entry === "object" && "value" in entry) collect((entry as { value?: unknown }).value);
    }
  };
  collect(record.emails);
  collect(record.email);
  collect(record.primary_email);
  return [...new Set(found)];
}

export async function createCrmNote(payload: {
  content: string;
  org_id?: number;
  deal_id?: number;
  person_id?: number;
  lead_id?: string;
}): Promise<number> {
  const data = await pipedriveRequest("notes", {
    method: "POST",
    body: definedFields({
      content: payload.content,
      org_id: payload.org_id,
      deal_id: payload.deal_id,
      person_id: payload.person_id,
      lead_id: payload.lead_id,
    }),
  });
  const id = numberOrNull(data && typeof data === "object" ? (data as { id?: unknown }).id : null);
  if (id === null) throw new Error("O Pipedrive não devolveu o id da nota.");
  return id;
}

export async function createCrmActivity(payload: {
  subject: string;
  type?: string;
  due_date?: string;
  org_id?: number;
  deal_id?: number;
  person_id?: number;
  note?: string;
}): Promise<number> {
  const data = await pipedriveRequest("activities", {
    method: "POST",
    body: definedFields({
      subject: payload.subject,
      type: payload.type || "meeting",
      due_date: payload.due_date,
      org_id: payload.org_id,
      deal_id: payload.deal_id,
      person_id: payload.person_id,
      note: payload.note,
      done: 0,
    }),
  });
  const id = numberOrNull(data && typeof data === "object" ? (data as { id?: unknown }).id : null);
  if (id === null) throw new Error("O Pipedrive não devolveu o id da atividade.");
  return id;
}

export async function createCrmOrganization(payload: { name: string; city?: string; website?: string }): Promise<number> {
  const data = await pipedriveRequest("organizations", {
    method: "POST",
    body: definedFields({
      name: payload.name,
      address: payload.city,
      website: payload.website,
    }),
  });
  const id = numberOrNull(data && typeof data === "object" ? (data as { id?: unknown }).id : null);
  if (id === null) throw new Error("O Pipedrive não devolveu o id da organização.");
  return id;
}

export async function createCrmPerson(payload: { name: string; org_id: number; email?: string }): Promise<number> {
  const data = await pipedriveRequest("persons", {
    method: "POST",
    body: definedFields({
      name: payload.name,
      org_id: payload.org_id,
      email: payload.email ? [{ value: payload.email, primary: true, label: "work" }] : undefined,
    }),
  });
  const id = numberOrNull(data && typeof data === "object" ? (data as { id?: unknown }).id : null);
  if (id === null) throw new Error("O Pipedrive não devolveu o id da pessoa.");
  return id;
}

export async function createCrmLead(payload: {
  title: string;
  organization_id?: number;
  person_id?: number;
}): Promise<string> {
  const data = await pipedriveRequest("leads", {
    method: "POST",
    body: definedFields({
      title: payload.title,
      organization_id: payload.organization_id,
      person_id: payload.person_id,
    }),
  });
  const id = crmId(data && typeof data === "object" ? (data as { id?: unknown }).id : null);
  if (id === null) throw new Error("O Pipedrive não devolveu o id da lead.");
  return id;
}

type DuplicateHit = {
  kind: CrmMatch["kind"];
  id: number | string;
  name: string;
  organizationId: number | null;
  organizationName: string | null;
  emails: string[];
  website: string | null;
};

async function searchDuplicateHits(term: string): Promise<DuplicateHit[]> {
  const query = term.trim();
  if (query.length < 2) return [];
  const data = await pipedriveGet("itemSearch", {
    term: query,
    item_types: "organization,person,lead",
    limit: "20",
  });
  const items = asList(data && typeof data === "object" ? (data as { items?: unknown }).items : null);
  return items.flatMap((entry) => {
    const item = entry.item;
    if (!item || typeof item !== "object") return [];
    const record = item as Record<string, unknown>;
    const kind = record.type === "organization" || record.type === "person" || record.type === "lead" ? record.type : null;
    if (!kind) return [];
    const name = text(kind === "lead" ? (record.title ?? record.name) : record.name);
    const id = kind === "lead" ? crmId(record.id) : numberOrNull(record.id);
    if (!name || id === null) return [];
    const organization = record.organization;
    const orgRecord = organization && typeof organization === "object" ? (organization as Record<string, unknown>) : null;
    return [
      {
        kind,
        id,
        name,
        organizationId: numberOrNull(orgRecord?.id),
        organizationName: text(orgRecord?.name),
        emails: emailsFrom(record),
        website: text(record.website),
      },
    ];
  });
}

async function personEmails(personId: number): Promise<string[]> {
  const data = await pipedriveGet(`persons/${personId}`);
  if (!data || typeof data !== "object") return [];
  return emailsFrom(data as Record<string, unknown>);
}

async function organizationWebsite(orgId: number): Promise<string | null> {
  const data = await pipedriveGet(`organizations/${orgId}`);
  if (!data || typeof data !== "object") return null;
  return text((data as { website?: unknown }).website);
}

function toMatch(hit: DuplicateHit): CrmMatch {
  return { kind: hit.kind, id: hit.id, name: hit.name };
}

export async function findCrmDuplicate(input: {
  company?: string;
  emails?: string[];
  website?: string;
}): Promise<CrmMatch[][]> {
  const company = input.company?.trim() ?? "";
  const emails = [...new Set((input.emails ?? []).map((email) => email.trim().toLowerCase()).filter(Boolean))];
  const domain = websiteHost(input.website);
  const terms = [company, ...emails, domain ?? ""].filter((term, index, all) => term.length >= 2 && all.indexOf(term) === index);
  const hits: DuplicateHit[] = [];
  const seenHits = new Set<string>();
  for (const term of terms) {
    for (const hit of await searchDuplicateHits(term)) {
      const key = `${hit.kind}:${hit.id}`;
      if (seenHits.has(key)) continue;
      seenHits.add(key);
      hits.push(hit);
    }
  }

  for (const hit of hits) {
    if (hit.kind !== "person" || typeof hit.id !== "number" || hit.emails.length > 0) continue;
    if (emails.length === 0 && !domain) continue;
    hit.emails = await personEmails(hit.id);
  }

  const matched: DuplicateHit[] = [];
  const seen = new Set<string>();
  const add = (hit: DuplicateHit) => {
    const key = `${hit.kind}:${hit.id}`;
    if (seen.has(key)) return;
    seen.add(key);
    matched.push(hit);
  };

  for (const hit of hits) {
    if (hit.kind === "organization" && company && sameCompanyName(hit.name, company)) add(hit);
    if (hit.kind === "lead" && company && sameCompanyName(hit.name, company)) add(hit);
    if (hit.kind !== "person") continue;
    const emailHit = hit.emails.some((email) => emails.includes(email));
    const domainHit = !!domain && hit.emails.some((email) => emailHost(email) === domain);
    const nameHit = !!company && sameCompanyName(hit.name, company);
    if (emailHit || domainHit || nameHit) add(hit);
  }

  if (domain) {
    for (const hit of hits) {
      if (hit.kind !== "organization" || typeof hit.id !== "number" || seen.has(`organization:${hit.id}`)) continue;
      const website = hit.website ?? (await organizationWebsite(hit.id));
      if (websiteHost(website ?? undefined) === domain) add(hit);
    }
  }

  for (const hit of hits) {
    if (hit.kind !== "person" || !hit.organizationId || !hit.organizationName || !company) continue;
    if (!sameCompanyName(hit.organizationName, company)) continue;
    add({
      kind: "organization",
      id: hit.organizationId,
      name: hit.organizationName,
      organizationId: hit.organizationId,
      organizationName: hit.organizationName,
      emails: [],
      website: null,
    });
  }

  const groups: CrmMatch[][] = [];
  const consumed = new Set<string>();
  for (const organization of matched.filter((hit) => hit.kind === "organization")) {
    const people = matched.filter((hit) => hit.kind === "person" && hit.organizationId === organization.id);
    consumed.add(`organization:${organization.id}`);
    for (const person of people) consumed.add(`person:${person.id}`);
    groups.push([toMatch(organization), ...people.map(toMatch)]);
  }
  for (const hit of matched) {
    const key = `${hit.kind}:${hit.id}`;
    if (consumed.has(key)) continue;
    consumed.add(key);
    groups.push([toMatch(hit)]);
  }
  return groups;
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
    throw new Error("O cliente não foi encontrado no Pipedrive.");
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
