export const APPROVAL_TYPES = ["note", "activity", "lead"] as const;

export type ApprovalType = (typeof APPROVAL_TYPES)[number];

export type ApprovalStatus = "pending" | "approved" | "rejected";

export type ApprovalRecord = {
  id: number;
  type: ApprovalType;
  payload: Record<string, unknown>;
  reason: string | null;
  status: ApprovalStatus;
  created_by: string | null;
  decided_by: string | null;
  created_at: string;
  decided_at: string | null;
};

export function isApprovalType(value: string): value is ApprovalType {
  return (APPROVAL_TYPES as readonly string[]).includes(value);
}

export type CrmMatchKind = "organization" | "person" | "lead";

export type CrmMatch = {
  kind: CrmMatchKind;
  id: number | string;
  name: string;
};

const MATCH_KIND = { organization: "organização", person: "pessoa", lead: "lead" } as const;

export function duplicateMessage(match: CrmMatch | readonly CrmMatch[]): string {
  const matches: readonly CrmMatch[] = Array.isArray(match) ? match : [match];
  const detail = matches.map((item) => `${item.name} (${MATCH_KIND[item.kind]} ${item.id})`).join(", ");
  return `Já está no Pipedrive: ${detail}`;
}
