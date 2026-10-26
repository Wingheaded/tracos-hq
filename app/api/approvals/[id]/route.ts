import { isUserName } from "@/lib/constants";
import { decideApproval } from "@/lib/approvals";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id: rawId } = await context.params;
  const id = Number(rawId);
  if (!Number.isInteger(id) || id <= 0) {
    return Response.json({ error: "A aprovação não foi encontrada." }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "O pedido não é JSON válido." }, { status: 400 });
  }
  const record = body && typeof body === "object" ? (body as { decision?: unknown; decidedBy?: unknown }) : {};
  if (record.decision !== "approve" && record.decision !== "reject") {
    return Response.json({ error: "Escolhe aprovar ou rejeitar." }, { status: 400 });
  }
  if (typeof record.decidedBy !== "string" || !isUserName(record.decidedBy)) {
    return Response.json({ error: "Escolhe quem decide." }, { status: 400 });
  }

  try {
    const approval = await decideApproval(id, record.decision, record.decidedBy);
    return Response.json({ approval }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Não foi possível decidir a aprovação.";
    const status = message === "A aprovação não foi encontrada." ? 404 : message === "Esta aprovação já foi decidida." ? 409 : 502;
    return Response.json({ error: message }, { status });
  }
}
