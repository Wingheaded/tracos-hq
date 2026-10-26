"use client";

import { useEffect, useState } from "react";
import { LEAD_SEGMENT_LABEL, LEAD_STATUS_LABEL, type LeadBoardSearch } from "@/lib/message";

function formatWhen(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("pt-PT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone: "Europe/Lisbon",
  });
}

function sourceLabel(url: string) {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
    return { href: parsed.toString(), label: parsed.hostname.replace(/^www\./, "") };
  } catch {
    return null;
  }
}

export function LeadsAdmin() {
  const [searches, setSearches] = useState<LeadBoardSearch[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/leads", { signal: controller.signal })
      .then(async (response) => {
        const data = (await response.json()) as { searches?: LeadBoardSearch[]; error?: string };
        if (!response.ok) throw new Error(data.error ?? "Não foi possível carregar as leads.");
        setSearches(data.searches ?? []);
      })
      .catch((cause: unknown) => {
        if (cause instanceof DOMException && cause.name === "AbortError") return;
        setError(cause instanceof Error ? cause.message : "Não foi possível carregar as leads.");
      });
    return () => controller.abort();
  }, []);

  return (
    <div className="mt-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted">Pesquisas do @Leads e o estado de cada empresa.</p>
        <a
          href="/api/leads?format=csv"
          className="rounded-md border border-olive px-3 py-2 text-sm font-medium text-olive focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brass"
        >
          Exportar CSV
        </a>
      </div>

      {error ? <p className="mt-3 text-sm text-olive">{error}</p> : null}
      {searches === null && !error ? <p className="mt-8 text-sm text-muted">A carregar leads…</p> : null}
      {searches && searches.length === 0 ? (
        <p className="mt-8 max-w-md text-sm leading-6 text-muted">Ainda não há pesquisas.</p>
      ) : null}

      <div className="mt-6 space-y-8">
        {searches?.map((search) => (
          <section key={search.id}>
            <h2 className="text-sm font-medium">{search.query}</h2>
            <p className="mt-1 text-xs text-muted">
              {formatWhen(search.createdAt)}
              {search.createdBy ? ` · ${search.createdBy}` : ""}
              {` · ${search.leads.length} ${search.leads.length === 1 ? "empresa" : "empresas"}`}
              {search.fallback ? " · resultados guardados" : ""}
            </p>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[40rem] border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-line text-xs text-muted">
                    <th className="py-2 pr-3 font-medium">Empresa</th>
                    <th className="py-2 pr-3 font-medium">Cidade</th>
                    <th className="py-2 pr-3 font-medium">Porque encaixa</th>
                    <th className="py-2 pr-3 font-medium">Segmentos</th>
                    <th className="py-2 pr-3 font-medium">Fonte</th>
                    <th className="py-2 font-medium">Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {search.leads.map((lead) => {
                    const source = sourceLabel(lead.sourceUrl);
                    return (
                      <tr key={lead.id} className="border-b border-line/80 align-top">
                        <td className="py-2 pr-3">{lead.company}</td>
                        <td className="py-2 pr-3">{lead.city || "—"}</td>
                        <td className="py-2 pr-3 leading-5">{lead.whyItFits || "—"}</td>
                        <td className="py-2 pr-3">
                          {lead.segments.length > 0
                            ? lead.segments.map((segment) => LEAD_SEGMENT_LABEL[segment] ?? segment).join(", ")
                            : "—"}
                        </td>
                        <td className="py-2 pr-3">
                          {source ? (
                            <a
                              href={source.href}
                              target="_blank"
                              rel="noreferrer"
                              className="text-olive underline-offset-2 hover:underline"
                            >
                              {source.label}
                            </a>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td className="py-2">{LEAD_STATUS_LABEL[lead.status]}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
