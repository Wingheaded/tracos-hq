"use client";

import { useEffect, useState } from "react";
import { LEAD_SEGMENT_LABEL, LEAD_STATUS_LABEL, type LeadTableRow } from "@/lib/message";

function sourceLabel(url: string) {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
    return { href: parsed.toString(), label: parsed.hostname.replace(/^www\./, "") };
  } catch {
    return null;
  }
}

export function LeadTable({
  rows,
  busy,
  onPropose,
}: {
  rows: LeadTableRow[];
  busy: boolean;
  onPropose: (ids: number[]) => void;
}) {
  const [selected, setSelected] = useState<number[]>([]);

  useEffect(() => {
    setSelected((current) => current.filter((id) => rows.some((row) => row.id === id && row.status === "new")));
  }, [rows]);

  function toggle(id: number) {
    setSelected((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));
  }

  return (
    <div className="mt-3">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[40rem] border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-line text-xs text-muted">
              <th className="w-8 py-2 pr-2 font-medium">
                <span className="sr-only">Selecionar</span>
              </th>
              <th className="py-2 pr-3 font-medium">Empresa</th>
              <th className="py-2 pr-3 font-medium">Cidade</th>
              <th className="py-2 pr-3 font-medium">Porque encaixa</th>
              <th className="py-2 pr-3 font-medium">Segmentos</th>
              <th className="py-2 font-medium">Fonte</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const source = sourceLabel(row.sourceUrl);
              const locked = row.status !== "new";
              return (
                <tr key={row.id} className="border-b border-line/80 align-top">
                  <td className="py-2 pr-2">
                    <input
                      type="checkbox"
                      checked={locked ? false : selected.includes(row.id)}
                      disabled={locked || busy}
                      aria-label={`Selecionar ${row.company}`}
                      onChange={() => toggle(row.id)}
                      className="mt-1 accent-olive"
                    />
                  </td>
                  <td className="py-2 pr-3">
                    <p>{row.company}</p>
                    {locked ? <p className="text-xs text-muted">{LEAD_STATUS_LABEL[row.status]}</p> : null}
                  </td>
                  <td className="py-2 pr-3">{row.city || "—"}</td>
                  <td className="py-2 pr-3 leading-5">{row.whyItFits || "—"}</td>
                  <td className="py-2 pr-3">
                    {row.segments.length > 0
                      ? row.segments.map((segment) => LEAD_SEGMENT_LABEL[segment] ?? segment).join(", ")
                      : "—"}
                  </td>
                  <td className="py-2">
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
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <button
        type="button"
        onClick={() => onPropose(selected)}
        disabled={busy || selected.length === 0}
        className="mt-3 rounded-md bg-brass px-3 py-1.5 text-sm font-medium text-olive disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-olive"
      >
        {busy ? "A propor…" : "Propor selecionadas"}
      </button>
    </div>
  );
}
