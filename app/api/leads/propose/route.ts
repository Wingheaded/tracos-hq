import { isUserName } from "@/lib/constants";
import { proposeSelectedLeads } from "@/lib/leads";

function safeError(error: unknown) {
  const detail = error instanceof Error ? error.message : "Não foi possível propor as leads.";
  if (/api key|bearer|authorization|token|sk-/i.test(detail)) return "Não foi possível propor as leads.";
  return detail.slice(0, 300);
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "O pedido não é JSON válido." }, { status: 400 });
  }
  if (!body || typeof body !== "object") {
    return Response.json({ error: "Falta o conteúdo do pedido." }, { status: 400 });
  }

  const record = body as Record<string, unknown>;
  const messageId = record.messageId;
  const createdBy = typeof record.createdBy === "string" ? record.createdBy : "";
  const leadIds = Array.isArray(record.leadIds) ? record.leadIds.filter((id): id is number => typeof id === "number") : [];

  if (typeof messageId !== "number" || !Number.isInteger(messageId) || messageId <= 0) {
    return Response.json({ error: "A mensagem não é válida." }, { status: 400 });
  }
  if (!isUserName(createdBy)) return Response.json({ error: "Quem fala não é reconhecido." }, { status: 400 });

  try {
    const result = await proposeSelectedLeads({ messageId, leadIds, createdBy });
    return Response.json(result);
  } catch (error) {
    return Response.json({ error: safeError(error) }, { status: 400 });
  }
}
