export const CHANNELS = [
  { id: "general", label: "#general", hint: "Team channel" },
  { id: "clients", label: "#clients", hint: "Client work" },
  { id: "finance", label: "#finance", hint: "Invoices and expenses" },
  { id: "leads", label: "#leads", hint: "Prospect research" },
] as const;

export type Channel = (typeof CHANNELS)[number]["id"];

export const USERS = ["Paulo", "Nelson", "José"] as const;

export type UserName = (typeof USERS)[number];

export const AGENTS = [
  { name: "Echo", detail: "Replies when mentioned" },
  { name: "Orchestrator", detail: "Manager" },
  { name: "Daniel", detail: "Lighting" },
  { name: "Tomás", detail: "Acoustics" },
  { name: "Maya", detail: "Outdoor" },
  { name: "André", detail: "Workplace" },
  { name: "Inês", detail: "Biophilia" },
  { name: "Finance", detail: "Invoices" },
  { name: "Leads", detail: "Prospects" },
] as const;

export function isChannel(value: string): value is Channel {
  return CHANNELS.some((channel) => channel.id === value);
}

export function isUserName(value: string): value is UserName {
  return USERS.some((user) => user === value);
}
