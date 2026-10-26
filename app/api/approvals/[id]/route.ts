import { isUserName } from "@/lib/constants";
import { decideApproval } from "@/lib/approvals";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id: rawId } = await context.params;
  const id = Number(rawId);
  if (!Number.isInteger(id) || id <= 0) {
    return Response.json({ error: "Approval was not found." }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Decision body is not valid JSON." }, { status: 400 });
  }
  const record = body && typeof body === "object" ? (body as { decision?: unknown; decidedBy?: unknown }) : {};
  if (record.decision !== "approve" && record.decision !== "reject") {
    return Response.json({ error: "Choose approve or reject." }, { status: 400 });
  }
  if (typeof record.decidedBy !== "string" || !isUserName(record.decidedBy)) {
    return Response.json({ error: "Choose who is deciding." }, { status: 400 });
  }

  try {
    const approval = await decideApproval(id, record.decision, record.decidedBy);
    return Response.json({ approval }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not decide the approval.";
    const status = message === "Approval was not found." ? 404 : message === "This approval is already decided." ? 409 : 502;
    return Response.json({ error: message }, { status });
  }
}
