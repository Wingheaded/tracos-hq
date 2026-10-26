import "server-only";

import fs from "node:fs";
import path from "node:path";

import type { Channel, UserName } from "@/lib/constants";
import { extractJsonObject, parseLeadDocument, type ParsedLead } from "@/lib/lead-parse";
import { attachSearchMessage, readStoredLead, saveSearch, setLeadStatus } from "@/lib/lead-records";
import { REPLY_LANGUAGE_RULE } from "@/lib/locale";
import { leadTable, type Message } from "@/lib/message";
import { insertAgentMessage, readMessage } from "@/lib/messages";
import { proposeCrmWrite } from "@/lib/approvals";

const DUMMY_KEYS = new Set([
  "changeme",
  "change-me",
  "your-key",
  "your_key",
  "your-api-key",
  "todo",
  "xxx",
  "xai-xxx",
  "sk-xxx",
  "replace-me",
]);

const LEADS_MENTION = /(?:^|[^\p{L}\p{N}_])@Leads(?![\p{L}\p{N}_])/giu;

function keyIsUsable(key: string | undefined): key is string {
  if (!key) return false;
  const trimmed = key.trim();
  if (!trimmed) return false;
  return !DUMMY_KEYS.has(trimmed.toLowerCase());
}

function requestText(content: string) {
  return content.replace(LEADS_MENTION, " ").replace(/\s+/g, " ").trim();
}

function instructions() {
  const file = fs.readFileSync(path.join(process.cwd(), "kit", "prompts", "leads.md"), "utf8").trim();
  return `${file}

Use the web_search tool before you answer. Do not answer from memory.
${REPLY_LANGUAGE_RULE}
The why_it_fits sentences follow that language rule. The JSON keys stay in English.
Return only the JSON object. No markdown.`;
}

function backupLeads(): ParsedLead[] {
  const file = fs.readFileSync(path.join(process.cwd(), "kit", "leads", "backup-search-algarve-hotels.json"), "utf8");
  const parsed = parseLeadDocument(JSON.parse(file) as unknown);
  if (parsed.leads.length === 0) throw new Error("Os resultados guardados não têm leads.");
  return parsed.leads;
}

function outputText(body: unknown): string {
  if (!body || typeof body !== "object") return "";
  const record = body as Record<string, unknown>;
  if (typeof record.output_text === "string" && record.output_text.trim()) return record.output_text;
  if (!Array.isArray(record.output)) return "";
  const parts: string[] = [];
  for (const item of record.output) {
    if (!item || typeof item !== "object") continue;
    const block = item as Record<string, unknown>;
    if (typeof block.text === "string") parts.push(block.text);
    if (!Array.isArray(block.content)) continue;
    for (const piece of block.content) {
      if (!piece || typeof piece !== "object") continue;
      const text = (piece as { text?: unknown }).text;
      if (typeof text === "string") parts.push(text);
    }
  }
  return parts.join("\n");
}

async function searchWeb(request: string): Promise<ParsedLead[]> {
  const apiKey = process.env.XAI_API_KEY?.trim();
  const model = process.env.XAI_MODEL?.trim();
  if (!keyIsUsable(apiKey) || !model) throw new Error("A pesquisa na internet não está configurada.");

  const response = await fetch("https://api.x.ai/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      input: [{ role: "user", content: `${instructions()}\n\nPedido:\n${request}` }],
      tools: [{ type: "web_search" }],
    }),
    signal: AbortSignal.timeout(120_000),
  });
  if (!response.ok) throw new Error("A pesquisa na internet falhou.");

  const leads = parseLeadDocument(extractJsonObject(outputText(await response.json()))).leads;
  if (leads.length === 0) throw new Error("A pesquisa na internet não devolveu leads.");
  return leads;
}

function wantsFallback() {
  return process.env.LEADS_FALLBACK?.trim().toLowerCase() === "true";
}

export async function answerLeads(input: {
  channel: Channel;
  content: string;
  createdBy: UserName;
  onStatus: (text: string) => void;
}): Promise<Message> {
  if (input.channel !== "leads") throw new Error("O Leads só pesquisa em #leads.");
  const request = requestText(input.content);
  if (!request) throw new Error("Diz o que queres procurar.");

  input.onStatus("A pesquisar na internet…");

  let leads: ParsedLead[];
  let fallback = false;
  if (wantsFallback()) {
    leads = backupLeads();
    fallback = true;
  } else {
    try {
      leads = await searchWeb(request);
    } catch {
      leads = backupLeads();
      fallback = true;
    }
  }

  const saved = saveSearch({
    query: request,
    createdBy: input.createdBy,
    fallback,
    leads,
  });
  const message = insertAgentMessage({
    channel: "leads",
    author: "Leads",
    content: fallback
      ? `resultados guardados. ${saved.rows.length} empresas.`
      : `Encontrei ${saved.rows.length} empresas.`,
    meta: {
      leadsTable: {
        searchId: saved.searchId,
        fallback,
        rows: saved.rows,
      },
    },
  });
  attachSearchMessage(saved.searchId, message.id);
  return message;
}

export async function proposeSelectedLeads(input: {
  messageId: number;
  leadIds: number[];
  createdBy: UserName;
}): Promise<{ message: Message; warning?: string }> {
  const message = readMessage(input.messageId);
  const table = message && message.author === "Leads" ? leadTable(message.meta_json) : null;
  if (!message || message.channel !== "leads" || !table) {
    throw new Error("Essa mensagem não tem uma tabela de leads.");
  }

  const selectable = new Set(table.rows.filter((row) => row.status === "new").map((row) => row.id));
  const ids = [...new Set(input.leadIds.filter((id) => Number.isInteger(id) && selectable.has(id)))];
  if (ids.length === 0) throw new Error("Seleciona pelo menos uma lead nova.");

  let warning: string | undefined;
  for (const id of ids) {
    const stored = readStoredLead(id);
    if (!stored || stored.searchId !== String(table.searchId)) {
      warning = "Uma das leads já não está nesta pesquisa.";
      break;
    }
    try {
      const result = await proposeCrmWrite(
        "lead",
        {
          company: stored.company,
          title: stored.company,
          city: stored.city || undefined,
          contact: stored.generalContact || undefined,
          website: stored.website || undefined,
          lead_row_id: stored.id,
        },
        `Nova lead para ${stored.company}.`,
        input.createdBy,
        "leads",
      );
      setLeadStatus(stored.id, result.status === "duplicate" ? "duplicate" : "approved");
    } catch (error) {
      warning = error instanceof Error ? error.message : "Não foi possível propor a lead.";
      break;
    }
  }

  const updated = readMessage(input.messageId);
  if (!updated) throw new Error("A mensagem desapareceu.");
  return { message: updated, warning };
}
