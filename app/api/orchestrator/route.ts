import { isChannel, isUserName } from "@/lib/constants";
import { mentionsOrchestrator, type SpecialistStreamEvent } from "@/lib/message";
import { answerOrchestrator } from "@/lib/orchestrator";

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
  const author = typeof record.author === "string" ? record.author : "";
  const content = typeof record.content === "string" ? record.content.trim() : "";

  if (!isChannel(channel)) return Response.json({ error: "Canal desconhecido." }, { status: 400 });
  if (!isUserName(author)) return Response.json({ error: "Quem fala não é reconhecido." }, { status: 400 });
  if (!content) return Response.json({ error: "Escreve uma mensagem antes de enviar." }, { status: 400 });
  if (!mentionsOrchestrator(content)) {
    return Response.json({ error: "O Orchestrator não foi mencionado." }, { status: 400 });
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
        answerOrchestrator({
          channel,
          content,
          createdBy: author,
          onConsulted: (names) => send({ type: "consulted", names }),
          onStatus: (text) => send({ type: "status", text }),
          onDelta: (text) => send({ type: "delta", text }),
        }).then(
          (message) => {
            send({ type: "message", message });
            settled = true;
            wake?.();
            wake = null;
          },
          (error: unknown) => {
            const detail = error instanceof Error ? error.message : "O Orchestrator não conseguiu responder.";
            const safe = /api key|bearer|authorization|token/i.test(detail)
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
