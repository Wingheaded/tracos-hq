export const CHANNELS = [
  { id: "general", label: "#general", hint: "Canal da equipa" },
  { id: "clients", label: "#clients", hint: "Trabalho com clientes" },
  { id: "finance", label: "#finance", hint: "Faturas e despesas" },
  { id: "leads", label: "#leads", hint: "Prospeção" },
] as const;

export type Channel = (typeof CHANNELS)[number]["id"];

export const USERS = ["Paulo", "Nelson", "José"] as const;

export type UserName = (typeof USERS)[number];

export const AGENTS = [
  { name: "Echo", detail: "Responde quando é mencionado" },
  { name: "Orchestrator", detail: "Gestor" },
  { name: "Daniel", detail: "Iluminação" },
  { name: "Tomás", detail: "Acústica" },
  { name: "Maya", detail: "Exterior" },
  { name: "André", detail: "Escritórios" },
  { name: "Inês", detail: "Biofilia" },
  { name: "Finance", detail: "Faturas" },
  { name: "Leads", detail: "Prospeção" },
] as const;

export const SPECIALISTS = [
  { name: "Daniel", segment: "Lighting", humanOwner: "João", catalogFile: "daniel-lighting.json" },
  { name: "Tomás", segment: "Acoustics", humanOwner: "Joana", catalogFile: "tomas-acoustics.json" },
  { name: "Maya", segment: "Outdoor furniture", humanOwner: "Paulo", catalogFile: "maya-outdoor.json" },
  { name: "André", segment: "Corporate / workplace", humanOwner: "Célia", catalogFile: "andre-corporate.json" },
  { name: "Inês", segment: "Biophilia", humanOwner: "Nelson", catalogFile: "ines-biophilia.json" },
] as const;

export type SpecialistName = (typeof SPECIALISTS)[number]["name"];

export function isSpecialistName(value: string): value is SpecialistName {
  return SPECIALISTS.some((specialist) => specialist.name === value);
}

export function isChannel(value: string): value is Channel {
  return CHANNELS.some((channel) => channel.id === value);
}

export function isUserName(value: string): value is UserName {
  return USERS.some((user) => user === value);
}
