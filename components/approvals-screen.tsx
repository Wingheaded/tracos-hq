"use client";

import { LeadsAdmin } from "@/components/leads-admin";
import Link from "next/link";
import { useEffect, useState, useSyncExternalStore, type FormEvent } from "react";
import type { ApprovalRecord } from "@/lib/approval";
import { formatApprovalDate } from "@/lib/dates";
import { USERS, type UserName } from "@/lib/constants";
import type { NoteOffer } from "@/lib/message";

const speakerListeners = new Set<() => void>();

function subscribeSpeaker(listener: () => void) {
  speakerListeners.add(listener);
  return () => speakerListeners.delete(listener);
}

function speakerSnapshot(): UserName {
  const saved = localStorage.getItem("tracos-user");
  if (saved === "Paulo" || saved === "Nelson" || saved === "José") return saved;
  return "Paulo";
}

function speakerServerSnapshot(): UserName {
  return "Paulo";
}

function chooseSpeaker(next: UserName) {
  localStorage.setItem("tracos-user", next);
  speakerListeners.forEach((listener) => listener());
}

function textValue(payload: Record<string, unknown>, key: string) {
  const value = payload[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

const TYPE_LABEL = { note: "nota", activity: "atividade", lead: "lead" } as const;
const STATUS_LABEL = { pending: "pendente", approved: "aprovada", rejected: "rejeitada" } as const;

function headline(approval: ApprovalRecord) {
  if (approval.type === "activity") return textValue(approval.payload, "subject") ?? "Atividade";
  if (approval.type === "lead") return textValue(approval.payload, "company") ?? textValue(approval.payload, "title") ?? "Lead";
  return textValue(approval.payload, "content") ?? "Nota";
}

function detail(approval: ApprovalRecord) {
  const parts: string[] = [];
  const due = textValue(approval.payload, "due_date");
  if (due) parts.push(formatApprovalDate(due));
  const city = textValue(approval.payload, "city");
  if (city) parts.push(city);
  const contact = textValue(approval.payload, "contact");
  if (contact) parts.push(contact);
  const website = textValue(approval.payload, "website");
  if (website) parts.push(website);
  if (typeof approval.payload.deal_id === "number") parts.push(`negócio ${approval.payload.deal_id}`);
  const pipedriveId = approval.payload.pipedrive_id;
  if (typeof pipedriveId === "number" || (typeof pipedriveId === "string" && pipedriveId.trim())) {
    parts.push(`Pipedrive #${pipedriveId}`);
  }
  return parts.join(" · ");
}

export function ApprovalsScreen() {
  const actor = useSyncExternalStore(subscribeSpeaker, speakerSnapshot, speakerServerSnapshot);
  const [approvals, setApprovals] = useState<ApprovalRecord[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [leadForm, setLeadForm] = useState({ company: "", city: "", contact: "", website: "" });
  const [duplicate, setDuplicate] = useState<{ message: string; messageId: number; noteOffer: NoteOffer } | null>(null);
  const [tab, setTab] = useState<"approvals" | "leads">("approvals");

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/approvals", { signal: controller.signal })
      .then(async (response) => {
        const data = (await response.json()) as { approvals?: ApprovalRecord[]; error?: string };
        if (!response.ok) throw new Error(data.error ?? "Não foi possível carregar as aprovações.");
        setApprovals(data.approvals ?? []);
      })
      .catch((cause: unknown) => {
        if (cause instanceof DOMException && cause.name === "AbortError") return;
        setError(cause instanceof Error ? cause.message : "Não foi possível carregar as aprovações.");
        setApprovals([]);
      });
    return () => controller.abort();
  }, []);

  async function createTest() {
    setBusy("test");
    setError(null);
    try {
      const response = await fetch("/api/approvals/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ createdBy: actor }),
      });
      const data = (await response.json()) as { approval?: ApprovalRecord; error?: string };
      if (!response.ok || !data.approval) throw new Error(data.error ?? "Não foi possível criar a aprovação de teste.");
      setApprovals((current) => [data.approval!, ...(current ?? [])]);
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : "Não foi possível criar a aprovação de teste.");
    } finally {
      setBusy(null);
    }
  }

  async function addLead(event: FormEvent) {
    event.preventDefault();
    const company = leadForm.company.trim();
    if (!company) return;
    setBusy("lead");
    setError(null);
    setDuplicate(null);
    try {
      const response = await fetch("/api/approvals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "lead",
          payload: {
            company,
            city: leadForm.city.trim(),
            contact: leadForm.contact.trim(),
            website: leadForm.website.trim(),
          },
          reason: `Nova lead para ${company}.`,
          createdBy: actor,
          channel: "leads",
        }),
      });
      const data = (await response.json()) as {
        approval?: ApprovalRecord;
        duplicate?: { message: string; messageId: number; noteOffer: NoteOffer };
        error?: string;
      };
      if (!response.ok) throw new Error(data.error ?? "Não foi possível adicionar a lead.");
      if (data.duplicate) {
        setDuplicate(data.duplicate);
        return;
      }
      if (!data.approval) throw new Error("Não foi possível adicionar a lead.");
      setApprovals((current) => [data.approval!, ...(current ?? [])]);
      setLeadForm({ company: "", city: "", contact: "", website: "" });
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : "Não foi possível adicionar a lead.");
    } finally {
      setBusy(null);
    }
  }

  async function proposeOfferedNote() {
    if (!duplicate) return;
    setBusy("note");
    setError(null);
    try {
      const response = await fetch("/api/approvals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "note",
          payload: {
            content: duplicate.noteOffer.content,
            org_id: duplicate.noteOffer.org_id,
            person_id: duplicate.noteOffer.person_id,
            lead_id: duplicate.noteOffer.lead_id,
          },
          reason: "Nota sobre um registo que já está no Pipedrive.",
          createdBy: actor,
          messageId: duplicate.messageId,
        }),
      });
      const data = (await response.json()) as { approval?: ApprovalRecord; error?: string };
      if (!response.ok || !data.approval) throw new Error(data.error ?? "Não foi possível propor a nota.");
      setApprovals((current) => [data.approval!, ...(current ?? [])]);
      setDuplicate({ ...duplicate, noteOffer: { ...duplicate.noteOffer, proposed: true } });
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : "Não foi possível propor a nota.");
    } finally {
      setBusy(null);
    }
  }

  async function decide(id: number, decision: "approve" | "reject") {
    setBusy(`${decision}-${id}`);
    setError(null);
    try {
      const response = await fetch(`/api/approvals/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision, decidedBy: actor }),
      });
      const data = (await response.json()) as { approval?: ApprovalRecord; error?: string };
      if (!response.ok || !data.approval) throw new Error(data.error ?? "Não foi possível decidir a aprovação.");
      setApprovals((current) => (current ?? []).map((item) => (item.id === id ? data.approval! : item)));
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : "Não foi possível decidir a aprovação.");
    } finally {
      setBusy(null);
    }
  }

  const pending = (approvals ?? []).filter((item) => item.status === "pending");
  const decided = (approvals ?? []).filter((item) => item.status !== "pending");

  return (
    <div className="min-h-dvh bg-paper text-ink">
      <header className="border-b border-line bg-olive text-mist">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-4 px-4 py-4">
          <div>
            <p className="font-display text-2xl leading-none text-white">Traços</p>
            <p className="mt-1 text-sm text-mist/75">Administração</p>
          </div>
          <Link href="/" className="text-sm text-white underline-offset-2 hover:underline">
            Conversa
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div role="tablist" aria-label="Administração" className="flex gap-4">
            <button
              type="button"
              role="tab"
              aria-selected={tab === "approvals"}
              onClick={() => setTab("approvals")}
              className={`border-b-2 px-1 pb-2 text-sm font-medium ${tab === "approvals" ? "border-olive" : "border-transparent text-muted"}`}
            >
              Aprovações
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === "leads"}
              onClick={() => setTab("leads")}
              className={`border-b-2 px-1 pb-2 text-sm font-medium ${tab === "leads" ? "border-olive" : "border-transparent text-muted"}`}
            >
              Leads
            </button>
          </div>
          <label className="flex items-center gap-2 text-sm text-muted" htmlFor="decider">
            A falar como
            <select
              id="decider"
              value={actor}
              onChange={(event) => chooseSpeaker(event.target.value as UserName)}
              className="rounded-md border border-line bg-white px-2 py-1 text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brass"
            >
              {USERS.map((user) => (
                <option key={user} value={user}>
                  {user}
                </option>
              ))}
            </select>
          </label>
        </div>

        {tab === "leads" ? <LeadsAdmin /> : null}
        {tab === "approvals" ? (
        <>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted">Notas, atividades e leads do CRM pendentes. Nada é escrito no Pipedrive até aprovares.</p>
          <button
            type="button"
            onClick={() => void createTest()}
            disabled={busy !== null}
            className="rounded-md border border-olive px-3 py-2 text-sm font-medium text-olive disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brass"
          >
            {busy === "test" ? "A criar…" : "Criar aprovação de teste"}
          </button>
        </div>

        <form onSubmit={(event) => void addLead(event)} className="mt-6 grid gap-3 border-t border-line pt-4 sm:grid-cols-2">
          <h2 className="text-sm font-medium sm:col-span-2">Adicionar lead</h2>
          <label className="text-sm text-muted">
            Empresa
            <input
              value={leadForm.company}
              onChange={(event) => setLeadForm((current) => ({ ...current, company: event.target.value }))}
              required
              className="mt-1 w-full rounded-md border border-line bg-white px-2 py-1.5 text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brass"
            />
          </label>
          <label className="text-sm text-muted">
            Cidade
            <input
              value={leadForm.city}
              onChange={(event) => setLeadForm((current) => ({ ...current, city: event.target.value }))}
              className="mt-1 w-full rounded-md border border-line bg-white px-2 py-1.5 text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brass"
            />
          </label>
          <label className="text-sm text-muted">
            Contacto
            <input
              value={leadForm.contact}
              onChange={(event) => setLeadForm((current) => ({ ...current, contact: event.target.value }))}
              className="mt-1 w-full rounded-md border border-line bg-white px-2 py-1.5 text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brass"
            />
          </label>
          <label className="text-sm text-muted">
            Site
            <input
              value={leadForm.website}
              onChange={(event) => setLeadForm((current) => ({ ...current, website: event.target.value }))}
              className="mt-1 w-full rounded-md border border-line bg-white px-2 py-1.5 text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brass"
            />
          </label>
          <div className="sm:col-span-2">
            <button
              type="submit"
              disabled={busy !== null}
              className="rounded-md border border-olive px-3 py-2 text-sm font-medium text-olive disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brass"
            >
              {busy === "lead" ? "A adicionar…" : "Adicionar lead"}
            </button>
          </div>
        </form>

        {duplicate ? (
          <div className="mt-4">
            <p className="text-sm leading-6">{duplicate.message}</p>
            <p className="mt-1 text-sm text-muted">Também publicado em #leads.</p>
            {duplicate.noteOffer.proposed ? (
              <p className="mt-2 text-sm text-muted">Nota proposta. Está à espera nas Aprovações.</p>
            ) : (
              <button
                type="button"
                onClick={() => void proposeOfferedNote()}
                disabled={busy !== null}
                className="mt-2 rounded-md bg-brass px-3 py-1.5 text-sm font-medium text-olive disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-olive"
              >
                {busy === "note" ? "A propor…" : "Propor uma nota"}
              </button>
            )}
          </div>
        ) : null}

        {error ? <p className="mt-3 text-sm text-olive">{error}</p> : null}

        {approvals === null ? (
          <p className="mt-8 text-sm text-muted">A carregar aprovações…</p>
        ) : pending.length === 0 && decided.length === 0 ? (
          <p className="mt-8 max-w-md text-sm leading-6 text-muted">
            Ainda não há aprovações. Cria uma atividade de teste para o negócio da Casa Maré.
          </p>
        ) : (
          <div className="mt-6 space-y-8">
            <ApprovalList title="Pendentes" items={pending} busy={busy} onDecide={decide} />
            <ApprovalList title="Decididas" items={decided} busy={busy} onDecide={decide} />
          </div>
        )}
        </>
        ) : null}
      </main>
    </div>
  );
}

function ApprovalList({
  title,
  items,
  busy,
  onDecide,
}: {
  title: string;
  items: ApprovalRecord[];
  busy: string | null;
  onDecide: (id: number, decision: "approve" | "reject") => void;
}) {
  if (items.length === 0) return null;
  return (
    <section>
      <h2 className="text-sm text-muted">{title}</h2>
      <ul className="mt-2 divide-y divide-line border-y border-line">
        {items.map((approval) => {
          const meta = detail(approval);
          return (
            <li key={approval.id} className="py-4">
              <p className="text-xs text-muted">
                {TYPE_LABEL[approval.type]} · {STATUS_LABEL[approval.status]}
                {approval.created_by ? ` · ${approval.created_by}` : ""}
              </p>
              <p className="mt-1 text-[15px] leading-6">{headline(approval)}</p>
              {meta ? <p className="mt-1 text-sm text-muted">{meta}</p> : null}
              {approval.reason ? <p className="mt-1 text-sm leading-6 text-muted">{approval.reason}</p> : null}
              {approval.status === "pending" ? (
                <div className="mt-3 flex gap-2">
                  <button
                    type="button"
                    onClick={() => onDecide(approval.id, "approve")}
                    disabled={busy !== null}
                    className="rounded-md bg-brass px-3 py-1.5 text-sm font-medium text-olive disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-olive"
                  >
                    {busy === `approve-${approval.id}` ? "A aprovar…" : "Aprovar"}
                  </button>
                  <button
                    type="button"
                    onClick={() => onDecide(approval.id, "reject")}
                    disabled={busy !== null}
                    className="rounded-md border border-line px-3 py-1.5 text-sm disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brass"
                  >
                    {busy === `reject-${approval.id}` ? "A rejeitar…" : "Rejeitar"}
                  </button>
                </div>
              ) : approval.decided_by ? (
                <p className="mt-2 text-xs text-muted">Decidida por {approval.decided_by}</p>
              ) : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
