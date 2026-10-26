import { isApprovalType } from "@/lib/approval";
import { listApprovals, proposeCrmWrite } from "@/lib/approvals";
import { isChannel, isUserName, type Channel } from "@/lib/constants";
import { markNoteOfferProposed } from "@/lib/messages";

export async function GET() {
  return Response.json({ approvals: listApprovals() }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Approval body is not valid JSON." }, { status: 400 });
  }
  const record = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  if (typeof record.type !== "string" || !isApprovalType(record.type)) {
    return Response.json({ error: "Choose a note, activity, or lead." }, { status: 400 });
  }
  if (typeof record.createdBy !== "string" || !isUserName(record.createdBy)) {
    return Response.json({ error: "Choose who is proposing the approval." }, { status: 400 });
  }
  const reason = typeof record.reason === "string" ? record.reason : "";
  const channel: Channel = typeof record.channel === "string" && isChannel(record.channel) ? record.channel : "leads";
  const messageId = typeof record.messageId === "number" ? record.messageId : undefined;

  try {
    const result = await proposeCrmWrite(record.type, record.payload, reason, record.createdBy, channel);
    if (result.status === "duplicate") {
      return Response.json(
        {
          duplicate: {
            message: result.message,
            match: result.match,
            noteOffer: result.noteOffer,
            messageId: result.messageId,
          },
        },
        { headers: { "Cache-Control": "no-store" } },
      );
    }
    if (record.type === "note" && messageId) markNoteOfferProposed(messageId);
    return Response.json({ approval: result.approval }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not propose the approval.";
    const status = /missing|invalid|needs a record|too long/i.test(message) ? 400 : 502;
    return Response.json({ error: message }, { status });
  }
}
