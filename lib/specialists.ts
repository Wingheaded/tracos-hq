import fs from "node:fs";
import path from "node:path";
import OpenAI from "openai";
import { SPECIALISTS, type SpecialistName } from "@/lib/constants";
import type { Channel } from "@/lib/constants";
import { insertAgentMessage } from "@/lib/messages";
import type { Message } from "@/lib/message";

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

type Specialist = (typeof SPECIALISTS)[number];

function specialistByName(name: SpecialistName): Specialist {
  const specialist = SPECIALISTS.find((item) => item.name === name);
  if (!specialist) throw new Error("Unknown specialist.");
  return specialist;
}

function readCatalog(specialist: Specialist) {
  const filePath = path.join(process.cwd(), "kit", "catalog", specialist.catalogFile);
  return fs.readFileSync(filePath, "utf8");
}

function firstBrand(catalogJson: string) {
  const catalog = JSON.parse(catalogJson) as { brands?: { name?: string }[] };
  const brand = catalog.brands?.[0]?.name?.trim();
  if (!brand) throw new Error("Catalog has no brand.");
  return brand;
}

export function placeholderReply(brand: string) {
  return `Placeholder. The first brand in my catalog is "${brand}".`;
}

function systemPrompt(specialist: Specialist, catalogJson: string) {
  const templatePath = path.join(process.cwd(), "kit", "prompts", "specialist.md");
  const template = fs.readFileSync(templatePath, "utf8");
  const body = template.split(/\n---\n/).slice(1).join("\n---\n").trim();
  return body
    .replaceAll("{{name}}", specialist.name)
    .replaceAll("{{segment}}", specialist.segment)
    .replaceAll("{{human_owner}}", specialist.humanOwner)
    .replaceAll("{{catalog_json}}", catalogJson.trim());
}

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

async function emitText(text: string, onDelta: (text: string) => void) {
  const parts = text.split(/(\s+)/).filter((part) => part.length > 0);
  for (const part of parts) {
    onDelta(part);
    await new Promise((resolve) => setTimeout(resolve, 40));
  }
}

export async function answerSpecialist(input: {
  channel: Channel;
  agent: SpecialistName;
  content: string;
  onDelta: (text: string) => void;
}): Promise<Message> {
  const specialist = specialistByName(input.agent);
  const catalog = readCatalog(specialist);
  const fallback = placeholderReply(firstBrand(catalog));
  const apiKey = process.env.XAI_API_KEY;
  const model = process.env.XAI_MODEL?.trim();

  let answer = "";
  if (!keyIsUsable(apiKey) || !model) {
    answer = fallback;
    await emitText(answer, input.onDelta);
  } else {
    try {
      const client = new OpenAI({ apiKey: apiKey.trim(), baseURL: "https://api.x.ai/v1" });
      const stream = await client.chat.completions.create({
        model,
        stream: true,
        messages: [
          { role: "system", content: systemPrompt(specialist, catalog) },
          { role: "user", content: input.content },
        ],
      });
      for await (const chunk of stream) {
        const text = chunk.choices[0]?.delta?.content ?? "";
        if (!text) continue;
        answer += text;
        input.onDelta(text);
      }
      if (!answer.trim()) {
        answer = fallback;
        await emitText(answer, input.onDelta);
      }
    } catch (error) {
      if (answer.length > 0 || !isInvalidKeyError(error)) throw error;
      answer = fallback;
      await emitText(answer, input.onDelta);
    }
  }

  return insertAgentMessage({
    channel: input.channel,
    author: specialist.name,
    content: answer.trim(),
  });
}
