import { isChannel, isSpecialistName } from "@/lib/constants";
import { mentionedSpecialists, type SpecialistStreamEvent } from "@/lib/message";
import { answerSpecialist } from "@/lib/specialists";

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "O pedido não é JSON válido." }, { status: 400 });
  }

  if (!body || typeof body !== "object") {
    return Response.json({ error: "Falta o conteúdo da mensagem." }, { status: 400 });
  }

  const record = body as Record<string, unknown>;
  const channel = typeof record.channel === "string" ? record.channel : "";
  const agent = typeof record.agent === "string" ? record.agent : "";
  const content = typeof record.content === "string" ? record.content.trim() : "";

  if (!isChannel(channel)) return Response.json({ error: "Canal desconhecido." }, { status: 400 });
  if (!isSpecialistName(agent)) return Response.json({ error: "Especialista desconhecido." }, { status: 400 });
  if (!content) return Response.json({ error: "Escreve uma mensagem antes de enviar." }, { status: 400 });
  if (!mentionedSpecialists(content).includes(agent)) {
    return Response.json({ error: "Esse especialista não foi mencionado." }, { status: 400 });
  }

  const encoder = new TextEncoder();
  const pending: SpecialistStreamEvent[] = [];
  let settled = false;
  let wake: (() => void) | null = null;
  let started = false;

  const send = (event: SpecialistStreamEvent) => {
    pending.push(event);
    wake?.();
    wake = null;
  };

  const stream = new ReadableStream({
    async pull(controller) {
      if (!started) {
        started = true;
        answerSpecialist({
          channel,
          agent,
          content,
          onDelta: (text) => send({ type: "delta", text }),
        }).then(
          (message) => {
            send({ type: "message", message });
            settled = true;
            wake?.();
            wake = null;
          },
          (error: unknown) => {
            const detail = error instanceof Error ? error.message : "O especialista não conseguiu responder.";
            const safe = /api key|bearer|authorization/i.test(detail)
              ? "O pedido ao modelo falhou."
              : detail.slice(0, 300);
            send({ type: "error", error: safe });
            settled = true;
            wake?.();
            wake = null;
          },
        );
      }

      while (pending.length === 0 && !settled) {
        await new Promise<void>((resolve) => {
          if (pending.length > 0 || settled) {
            resolve();
            return;
          }
          wake = resolve;
        });
      }

      const event = pending.shift();
      if (!event) {
        controller.close();
        return;
      }
      controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}
