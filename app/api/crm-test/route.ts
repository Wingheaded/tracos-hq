import { crmGetClient, crmSearch } from "@/lib/pipedrive";

export async function GET(request: Request) {
  const query = new URL(request.url).searchParams.get("q")?.trim() ?? "";
  if (!query) {
    return Response.json({ error: "Falta o parâmetro q." }, { status: 400 });
  }

  try {
    const matches = await crmSearch(query);
    const organizationId =
      matches.find((match) => match.type === "organization")?.id ??
      matches.find((match) => match.organizationId)?.organizationId ??
      null;
    const client = organizationId ? await crmGetClient(organizationId) : null;
    return Response.json({ query, matches, client }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "O pedido ao Pipedrive falhou.";
    const status = message === "O cliente não foi encontrado no Pipedrive." ? 404 : 502;
    return Response.json({ error: message }, { status });
  }
}
