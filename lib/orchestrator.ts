import "server-only";

import fs from "node:fs";
import path from "node:path";
import OpenAI from "openai";
import { proposeCrmWrite } from "@/lib/approvals";
import { isApprovalType } from "@/lib/approval";
import { SPECIALISTS, type Channel, type SpecialistName, type UserName } from "@/lib/constants";
import { lisbonDateLine, settleActivityDueDate } from "@/lib/dates";
import { prefersEnglish, REPLY_LANGUAGE_RULE } from "@/lib/locale";
import { PRICE_PRESENTATION_RULE } from "@/lib/specialists";
import { insertAgentMessage } from "@/lib/messages";
import type { Message } from "@/lib/message";
import { crmGetClient, crmSearch } from "@/lib/pipedrive";
import { consultSpecialist } from "@/lib/specialists";

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

const CONSULTED_SEGMENT: Record<SpecialistName, string> = {
  Daniel: "iluminação",
  Tomás: "acústica",
  Maya: "exterior",
  André: "escritórios",
  Inês: "biofilia",
};

const MAX_ROUNDS = 6;

const tools: OpenAI.Chat.Completions.ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "crm_search",
      description: "Search Pipedrive for organizations and people by name, email, or phone.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Name, email, or phone to search for." },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "crm_get_client",
      description: "Read one organization's deals, notes, and activities from Pipedrive.",
      parameters: {
        type: "object",
        properties: {
          org_id: { type: "integer", description: "Pipedrive organization id from crm_search." },
        },
        required: ["org_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "ask_specialist",
      description:
        "Ask one specialist a precise question, in the same language as the user. Agents: Daniel (lighting), Tomás (acoustics), Maya (outdoor), André (workplace), Inês (biophilia). Include client context in the question.",
      parameters: {
        type: "object",
        properties: {
          agent: { type: "string", enum: ["Daniel", "Tomás", "Maya", "André", "Inês"] },
          question: { type: "string" },
          context: { type: "string", description: "Client history or other context the specialist should use." },
        },
        required: ["agent", "question"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "propose_crm_write",
      description:
        "Create a pending approval. This never writes to Pipedrive. A human must approve it. type note: payload {content, org_id or deal_id or person_id or lead_id}. type activity: payload {subject, due_date, org_id, deal_id, person_id, note, type}. For due_date, copy the user's relative words (amanhã, quinta-feira, next week) and do not invent a calendar date. type lead: payload {company, city, contact, website, email, title}. A lead that matches an existing record is not proposed.",
      parameters: {
        type: "object",
        properties: {
          type: { type: "string", enum: ["note", "activity", "lead"] },
          payload: { type: "object", additionalProperties: true },
          reason: { type: "string" },
        },
        required: ["type", "payload", "reason"],
      },
    },
  },
];

function keyIsUsable(key: string | undefined): key is string {
  if (!key) return false;
  const trimmed = key.trim();
  if (!trimmed) return false;
  return !DUMMY_KEYS.has(trimmed.toLowerCase());
}

function isInvalidKeyError(error: unknown) {
  if (error instanceof OpenAI.APIError && (error.status === 401 || error.status === 403)) return true;
  if (typeof error === "object" && error && "status" in error) {
    const status = Number((error as { status?: number }).status);
    if (status === 401 || status === 403) return true;
  }
  if (!(error instanceof Error)) return false;
  return /api key|unauthorized|authentication/i.test(error.message);
}

function safeError(error: unknown) {
  const detail = error instanceof Error ? error.message : "The tool failed.";
  if (/api key|bearer|authorization|token/i.test(detail)) return "The request failed.";
  return detail.slice(0, 300);
}

async function emitText(text: string, onDelta: (text: string) => void) {
  const parts = text.split(/(\s+)/).filter((part) => part.length > 0);
  for (const part of parts) {
    onDelta(part);
    await new Promise((resolve) => setTimeout(resolve, 40));
  }
}

function systemPrompt() {
  const prompt = fs.readFileSync(path.join(process.cwd(), "kit", "prompts", "orchestrator.md"), "utf8").trim();
  return `${prompt}\n\n${lisbonDateLine()}\n\n${PRICE_PRESENTATION_RULE}\n\n${REPLY_LANGUAGE_RULE}`;
}

function specialistFromTool(value: unknown): SpecialistName | null {
  if (typeof value !== "string") return null;
  const folded = value.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
  const found = SPECIALISTS.find(
    (item) => item.name.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase() === folded,
  );
  return found?.name ?? null;
}

function consultedLabel(name: SpecialistName) {
  return `${name} (${CONSULTED_SEGMENT[name]})`;
}

function askingStatus(agent: SpecialistName) {
  const article = agent === "Maya" || agent === "Inês" ? "à" : "ao";
  return `A perguntar ${article} ${agent} (${CONSULTED_SEGMENT[agent]})…`;
}

function statusForTool(name: string, args: Record<string, unknown>, clients: Map<number, string>) {
  if (name === "crm_search") {
    const query = typeof args.query === "string" ? args.query.trim() : "";
    return query ? `A consultar o CRM… · ${query}` : "A consultar o CRM…";
  }
  if (name === "crm_get_client") {
    const orgId = positiveId(args.org_id);
    const client = orgId ? clients.get(orgId) : undefined;
    return client ? `A consultar o CRM… · ${client}` : "A consultar o CRM…";
  }
  if (name === "ask_specialist") {
    const agent = specialistFromTool(args.agent);
    return agent ? askingStatus(agent) : null;
  }
  if (name === "propose_crm_write") return "A preparar uma aprovação…";
  return null;
}

function rememberClients(name: string, body: unknown, clients: Map<number, string>) {
  if (name === "crm_search" && Array.isArray(body)) {
    for (const hit of body) {
      if (!hit || typeof hit !== "object") continue;
      const record = hit as {
        type?: unknown;
        id?: unknown;
        name?: unknown;
        organizationId?: unknown;
        organizationName?: unknown;
      };
      if (record.type === "organization" && typeof record.id === "number" && typeof record.name === "string" && record.name) {
        clients.set(record.id, record.name);
      }
      if (typeof record.organizationId === "number" && typeof record.organizationName === "string" && record.organizationName) {
        clients.set(record.organizationId, record.organizationName);
      }
    }
  }
  if (name === "crm_get_client" && body && typeof body === "object" && !Array.isArray(body)) {
    const record = body as { id?: unknown; name?: unknown };
    if (typeof record.id === "number" && typeof record.name === "string" && record.name) {
      clients.set(record.id, record.name);
    }
  }
}

function parseArguments(raw: string): Record<string, unknown> {
  if (!raw.trim()) return {};
  const parsed = JSON.parse(raw) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Tool arguments must be an object.");
  }
  return parsed as Record<string, unknown>;
}

function positiveId(value: unknown): number | null {
  if (typeof value === "number" && Number.isInteger(value) && value > 0) return value;
  if (typeof value === "string" && /^\d+$/.test(value.trim())) {
    const parsed = Number(value.trim());
    return parsed > 0 ? parsed : null;
  }
  return null;
}

function clipText(value: string | null, max: number) {
  if (!value) return value;
  return value.length > max ? `${value.slice(0, max)}…` : value;
}

function toolContent(value: unknown) {
  const text = JSON.stringify(value);
  return text.length > 12000 ? `${text.slice(0, 12000)}…` : text;
}

function withoutLeadingConsulted(text: string) {
  const stripped = text.replace(/^\s*(Consulted|Consultados)\s*:[^\n]*\n*/i, "").trim();
  return stripped.length > 0 ? stripped : text.trim();
}

async function runTool(
  name: string,
  args: Record<string, unknown>,
  input: { channel: Channel; createdBy: string; content: string },
  consulted: SpecialistName[],
) {
  if (name === "crm_search") {
    const query = typeof args.query === "string" ? args.query : "";
    return crmSearch(query);
  }

  if (name === "crm_get_client") {
    const orgId = positiveId(args.org_id);
    if (!orgId) return { error: "org_id must be a Pipedrive organization id." };
    const client = await crmGetClient(orgId);
    return {
      ...client,
      deals: client.deals.slice(0, 15),
      notes: client.notes.slice(0, 10).map((note) => ({ ...note, content: clipText(note.content, 400) })),
      activities: client.activities.slice(0, 15).map((activity) => ({ ...activity, note: clipText(activity.note, 200) })),
    };
  }

  if (name === "ask_specialist") {
    const agent = specialistFromTool(args.agent);
    const question = typeof args.question === "string" ? args.question.trim() : "";
    const context = typeof args.context === "string" ? args.context.trim() : "";
    if (!agent) return { error: "Unknown specialist. Use Daniel, Tomás, Maya, André, or Inês." };
    if (!question) return { error: "A question is required." };
    const content = context ? `${question}\n\nContext:\n${context}` : question;
    const answer = await consultSpecialist({ agent, content });
    if (!consulted.includes(agent)) consulted.push(agent);
    return { agent, answer };
  }

  if (name === "propose_crm_write") {
    const type = typeof args.type === "string" ? args.type : "";
    if (!isApprovalType(type)) {
      return { error: "type must be note, activity, or lead. Nothing was written." };
    }
    let payload = args.payload;
    if (typeof payload === "string") {
      try {
        payload = JSON.parse(payload) as unknown;
      } catch {
        return { error: "payload must be an object. Nothing was written." };
      }
    }
    const reason = typeof args.reason === "string" ? args.reason.trim() : "";
    if (!reason) return { error: "A reason is required. Nothing was written." };
    if (type === "activity" && payload && typeof payload === "object" && !Array.isArray(payload)) {
      payload = settleActivityDueDate(payload as Record<string, unknown>, input.content);
    }
    const result = await proposeCrmWrite(type, payload, reason, input.createdBy, input.channel);
    if (result.status === "duplicate") {
      return { status: "duplicate", message: result.message, match: result.match };
    }
    const dueDate = typeof result.approval.payload.due_date === "string" ? result.approval.payload.due_date : null;
    return {
      status: "pending",
      approvalId: result.approval.id,
      type: result.approval.type,
      due_date: dueDate,
      message: dueDate
        ? `Pending approval created. It is not in Pipedrive until a human approves it. The resolved date is ${dueDate}. Mention that date and no other. Tell the user in their language.`
        : "Pending approval created. It is not in Pipedrive until a human approves it. No date was resolved, so do not mention a date. Tell the user in their language.",
    };
  }

  return { error: `Unknown tool ${name}.` };
}

export async function answerOrchestrator(input: {
  channel: Channel;
  content: string;
  createdBy: UserName;
  onDelta: (text: string) => void;
  onStatus?: (text: string) => void;
  onConsulted?: (names: string[]) => void;
}): Promise<Message> {
  const apiKey = process.env.XAI_API_KEY;
  const model = process.env.XAI_MODEL?.trim();
  const english = prefersEnglish(input.content);
  const fallback = english
    ? "I can't reach the model right now, so I haven't consulted the team."
    : "Não consigo chegar ao modelo agora, por isso ainda não consultei a equipa.";
  const consulted: SpecialistName[] = [];
  const clientNames = new Map<number, string>();
  let consultedAnnounced = 0;

  const announce = () => {
    if (consulted.length === 0 || consulted.length === consultedAnnounced) return;
    consultedAnnounced = consulted.length;
    input.onConsulted?.(consulted.map(consultedLabel));
  };

  const finish = async (text: string) => {
    input.onStatus?.("A juntar as respostas…");
    await emitText(text, input.onDelta);
  };

  let answer = "";
  if (!keyIsUsable(apiKey) || !model) {
    answer = fallback;
    await finish(answer);
  } else {
    const client = new OpenAI({ apiKey: apiKey.trim(), baseURL: "https://api.x.ai/v1" });
    const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
      { role: "system", content: systemPrompt() },
      { role: "user", content: input.content },
    ];

    try {
      let usedTool = false;
      for (let round = 0; round < MAX_ROUNDS; round++) {
        if (usedTool) input.onStatus?.("A juntar as respostas…");
        const completion = await client.chat.completions.create({
          model,
          messages,
          tools,
          tool_choice: "auto",
        });
        const message = completion.choices[0]?.message;
        if (!message) throw new Error("The Orchestrator returned nothing.");

        const calls = message.tool_calls ?? [];
        if (calls.length > 0) {
          usedTool = true;
          messages.push({
            role: "assistant",
            content: message.content,
            tool_calls: calls,
          });
          const results = await Promise.all(
            calls.map(async (call) => {
              if (call.type !== "function") {
                return { id: call.id, body: { error: "Unsupported tool call." } };
              }
              try {
                const args = parseArguments(call.function.arguments ?? "");
                const status = statusForTool(call.function.name, args, clientNames);
                if (status) input.onStatus?.(status);
                const body = await runTool(call.function.name, args, input, consulted);
                rememberClients(call.function.name, body, clientNames);
                return { id: call.id, body };
              } catch (error) {
                return { id: call.id, body: { error: safeError(error) } };
              }
            }),
          );
          announce();
          for (const result of results) {
            messages.push({
              role: "tool",
              tool_call_id: result.id,
              content: toolContent(result.body),
            });
          }
          continue;
        }

        answer = withoutLeadingConsulted(message.content ?? "");
        break;
      }
    } catch (error) {
      if (answer.length > 0 || !isInvalidKeyError(error)) throw error;
      answer = fallback;
    }

    if (!answer.trim()) {
      answer = english
        ? "I couldn't put a recommendation together from the team."
        : "Não consegui juntar uma recomendação da equipa.";
    }
    announce();
    await finish(answer);
  }

  return insertAgentMessage({
    channel: input.channel,
    author: "Orchestrator",
    content: answer.trim(),
    meta: consulted.length > 0 ? { consulted: consulted.map(consultedLabel) } : null,
  });
}
