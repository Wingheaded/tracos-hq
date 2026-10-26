import { listApprovals } from "@/lib/approvals";

export async function GET() {
  return Response.json({ approvals: listApprovals() }, { headers: { "Cache-Control": "no-store" } });
}
