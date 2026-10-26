import { isUserName } from "@/lib/constants";
import { proposeCasaMareVisit } from "@/lib/approvals";

export async function POST(request: Request) {
  let body: unknown = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }
  const createdBy = body && typeof body === "object" ? (body as { createdBy?: unknown }).createdBy : undefined;
  if (typeof createdBy !== "string" || !isUserName(createdBy)) {
    return Response.json({ error: "Choose who is proposing the approval." }, { status: 400 });
  }

  try {
    const approval = await proposeCasaMareVisit(createdBy);
    return Response.json({ approval }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not create the test approval.";
    return Response.json({ error: message }, { status: 502 });
  }
}
