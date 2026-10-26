import { isChannel } from "@/lib/constants";
import { listMessages, parsePostBody, postHumanMessage } from "@/lib/messages";

export async function GET(request: Request) {
  const channel = new URL(request.url).searchParams.get("channel") ?? "";
  if (!isChannel(channel)) {
    return Response.json({ error: "Unknown channel." }, { status: 400 });
  }

  return Response.json(
    { messages: listMessages(channel) },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Message body is not valid JSON." }, { status: 400 });
  }

  const parsed = parsePostBody(body);
  if (!parsed.ok) {
    return Response.json({ error: parsed.error }, { status: 400 });
  }

  const messages = postHumanMessage(parsed);
  return Response.json({ messages }, { status: 201, headers: { "Cache-Control": "no-store" } });
}
