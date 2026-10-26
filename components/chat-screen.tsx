"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { AGENTS, CHANNELS, USERS, type Channel, type UserName } from "@/lib/constants";
import { consultedNames, mentionedSpecialists, noteOffer, type Message, type NoteOffer, type SpecialistStreamEvent } from "@/lib/message";

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

function formatTime(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

type ChatMessage = Message & { pending?: boolean };

const EMPTY_MESSAGES: ChatMessage[] = [];

type LoadState = {
  channel: Channel;
  messages: ChatMessage[];
  error: string | null;
};

async function readSpecialistStream(
  response: Response,
  onEvent: (event: SpecialistStreamEvent) => void,
) {
  if (!response.body) throw new Error("The specialist reply had no stream.");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const chunks = buffer.split("\n\n");
    buffer = chunks.pop() ?? "";
    for (const chunk of chunks) {
      const line = chunk.trim();
      if (!line.startsWith("data:")) continue;
      onEvent(JSON.parse(line.slice(5).trim()) as SpecialistStreamEvent);
    }
  }
}

export function ChatScreen() {
  const [channel, setChannel] = useState<Channel>("general");
  const author = useSyncExternalStore(subscribeSpeaker, speakerSnapshot, speakerServerSnapshot);
  const [loaded, setLoaded] = useState<LoadState | null>(null);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [offerBusy, setOfferBusy] = useState<number | null>(null);
  const threadRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const channelRef = useRef(channel);
  const generation = useRef(0);
  const replyAbort = useRef<AbortController | null>(null);
  const pendingId = useRef(0);

  useEffect(() => {
    channelRef.current = channel;
    return () => {
      replyAbort.current?.abort();
    };
  }, [channel]);

  const active = CHANNELS.find((item) => item.id === channel) ?? CHANNELS[0];
  const showing = loaded?.channel === channel ? loaded : null;
  const messages = showing?.messages ?? EMPTY_MESSAGES;
  const loading = showing === null;
  const error = sendError ?? showing?.error ?? null;

  useEffect(() => {
    const controller = new AbortController();
    const requested = channel;
    const generationAtStart = ++generation.current;

    fetch(`/api/messages?channel=${requested}`, { signal: controller.signal })
      .then(async (response) => {
        const data = (await response.json()) as { messages?: Message[]; error?: string };
        if (!response.ok) throw new Error(data.error ?? "Could not load messages.");
        if (generation.current !== generationAtStart) return;
        setLoaded({ channel: requested, messages: data.messages ?? [], error: null });
      })
      .catch((cause: unknown) => {
        if (cause instanceof DOMException && cause.name === "AbortError") return;
        if (generation.current !== generationAtStart) return;
        setLoaded({
          channel: requested,
          messages: [],
          error: cause instanceof Error ? cause.message : "Could not load messages.",
        });
      });

    return () => controller.abort();
  }, [channel]);

  useEffect(() => {
    const thread = threadRef.current;
    if (!thread) return;
    thread.scrollTop = thread.scrollHeight;
  }, [messages, channel]);

  function mention(name: string) {
    setDraft((current) => {
      const spacer = current.length === 0 || current.endsWith(" ") ? "" : " ";
      return `${current}${spacer}@${name} `;
    });
    composerRef.current?.focus();
  }

  function openChannel(next: Channel) {
    setSendError(null);
    setChannel(next);
  }

  async function proposeNote(message: ChatMessage, offer: NoteOffer) {
    setOfferBusy(message.id);
    setSendError(null);
    try {
      const response = await fetch("/api/approvals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "note",
          payload: {
            content: offer.content,
            org_id: offer.org_id,
            person_id: offer.person_id,
            lead_id: offer.lead_id,
          },
          reason: "Note on an existing Pipedrive record.",
          createdBy: author,
          channel,
          messageId: message.id,
        }),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(data.error ?? "Could not propose the note.");
      setLoaded((current) => {
        if (!current) return current;
        return {
          ...current,
          messages: current.messages.map((item) => {
            if (item.id !== message.id || !item.meta_json) return item;
            const meta = JSON.parse(item.meta_json) as { noteOffer?: NoteOffer };
            if (!meta.noteOffer) return item;
            return { ...item, meta_json: JSON.stringify({ ...meta, noteOffer: { ...meta.noteOffer, proposed: true } }) };
          }),
        };
      });
    } catch (cause: unknown) {
      setSendError(cause instanceof Error ? cause.message : "Could not propose the note.");
    } finally {
      setOfferBusy(null);
    }
  }

  async function sendMessage() {
    const content = draft.trim();
    if (!content || sending) return;
    const target = channel;
    const generationAtStart = ++generation.current;
    replyAbort.current?.abort();
    const abort = new AbortController();
    replyAbort.current = abort;

    setSending(true);
    setSendError(null);
    try {
      const response = await fetch("/api/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channel: target, author, content }),
        signal: abort.signal,
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(data.error ?? "Could not send the message.");

      const listed = await fetch(`/api/messages?channel=${target}`, { signal: abort.signal });
      const payload = (await listed.json()) as { messages?: Message[]; error?: string };
      if (!listed.ok) throw new Error(payload.error ?? "Could not load messages.");
      if (channelRef.current !== target || generation.current !== generationAtStart) return;
      setLoaded({ channel: target, messages: payload.messages ?? [], error: null });
      setDraft("");

      for (const agent of mentionedSpecialists(content)) {
        if (channelRef.current !== target || generation.current !== generationAtStart) return;
        const tempId = --pendingId.current;
        setLoaded((current) => {
          if (!current || current.channel !== target) return current;
          return {
            ...current,
            messages: [
              ...current.messages,
              {
                id: tempId,
                channel: target,
                author: agent,
                author_type: "agent",
                content: "",
                meta_json: null,
                created_at: new Date().toISOString(),
                pending: true,
              },
            ],
          };
        });

        const streamed = await fetch("/api/specialists", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ channel: target, agent, content }),
          signal: abort.signal,
        });
        if (!streamed.ok) {
          const failure = (await streamed.json().catch(() => ({}))) as { error?: string };
          throw new Error(failure.error ?? "The specialist could not answer.");
        }

        await readSpecialistStream(streamed, (event) => {
          if (channelRef.current !== target || generation.current !== generationAtStart) return;
          if (event.type === "error") throw new Error(event.error);
          setLoaded((current) => {
            if (!current || current.channel !== target) return current;
            return {
              ...current,
              messages: current.messages.map((message) => {
                if (message.id !== tempId) return message;
                if (event.type === "delta") return { ...message, content: message.content + event.text };
                if (event.type === "message") return event.message;
                return message;
              }),
            };
          });
        });
      }
    } catch (cause: unknown) {
      if (cause instanceof DOMException && cause.name === "AbortError") return;
      if (channelRef.current === target) {
        setSendError(cause instanceof Error ? cause.message : "Could not send the message.");
      }
    } finally {
      if (replyAbort.current === abort) {
        setSending(false);
        composerRef.current?.focus();
      }
    }
  }

  return (
    <div className="flex h-dvh flex-col bg-paper text-ink md:flex-row">
      <aside className="flex shrink-0 flex-col border-b border-olive-2 bg-olive text-mist md:w-64 md:border-b-0 md:border-r">
        <div className="px-4 py-4">
          <p className="font-display text-[1.7rem] leading-none text-white">Traços</p>
          <p className="mt-1 text-sm text-mist/75">Internal workspace</p>
          <Link href="/admin" className="mt-3 inline-block text-sm text-mist/80 underline-offset-2 hover:text-white hover:underline">
            Approvals
          </Link>
        </div>

        <nav aria-label="Channels" className="flex gap-1 overflow-x-auto px-3 pb-3 md:flex-col md:overflow-visible md:px-2">
          {CHANNELS.map((item) => {
            const selected = item.id === channel;
            return (
              <button
                key={item.id}
                type="button"
                aria-current={selected ? "page" : undefined}
                onClick={() => openChannel(item.id)}
                className={`rounded-md px-3 py-2 text-left text-sm whitespace-nowrap focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brass ${
                  selected ? "bg-olive-2 text-white" : "text-mist/80 hover:bg-olive-2/70 hover:text-white"
                }`}
              >
                {item.label}
              </button>
            );
          })}
        </nav>

        <div className="hidden min-h-0 flex-1 flex-col px-2 pb-3 md:flex">
          <p className="px-2 pt-3 pb-1 text-sm text-mist/60">Agents</p>
          <ul className="min-h-0 flex-1 space-y-0.5 overflow-y-auto">
            {AGENTS.map((agent) => (
              <li key={agent.name}>
                <button
                  type="button"
                  onClick={() => mention(agent.name)}
                  className="flex w-full items-baseline justify-between gap-3 rounded-md px-2 py-1.5 text-left hover:bg-olive-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brass"
                >
                  <span className="text-sm text-white">{agent.name}</span>
                  <span className="truncate text-xs text-mist/55">{agent.detail}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      </aside>

      <section className="flex min-h-0 min-w-0 flex-1 flex-col">
        <header className="border-b border-line px-4 py-3 md:px-6">
          <h1 className="font-display text-2xl leading-none">{active.label}</h1>
          <p className="mt-1 text-sm text-muted">{active.hint}</p>
        </header>

        <div ref={threadRef} className="min-h-0 flex-1 overflow-y-auto px-4 py-2 md:px-6">
          {loading ? (
            <p className="py-8 text-sm text-muted">Loading messages…</p>
          ) : messages.length === 0 ? (
            <p className="max-w-md py-8 text-sm leading-6 text-muted">
              No messages in {active.label} yet. Mention @Echo, or a specialist: @Daniel, @Tomás, @Maya, @André, @Inês.
            </p>
          ) : (
            <ol>
              {messages.map((message) => {
                const consulted = consultedNames(message.meta_json);
                const offer = noteOffer(message.meta_json);
                return (
                  <li key={message.id} className="grid grid-cols-[6.5rem_1fr] gap-3 border-b border-line/80 py-3">
                    <div>
                      <p className="text-sm font-medium">{message.author}</p>
                      <time className="text-xs text-muted" dateTime={message.created_at}>
                        {formatTime(message.created_at)}
                      </time>
                    </div>
                    <div className={message.author_type === "agent" ? "border-l-2 border-olive pl-3" : undefined}>
                      <p className="whitespace-pre-wrap text-[15px] leading-6">
                        {message.content || (message.pending ? "…" : "")}
                      </p>
                      {consulted.length > 0 ? (
                        <p className="mt-1 text-xs text-muted">Consulted: {consulted.join(", ")}</p>
                      ) : null}
                      {offer?.proposed ? (
                        <p className="mt-2 text-sm text-muted">Note proposed. It is waiting in Approvals.</p>
                      ) : offer ? (
                        <button
                          type="button"
                          onClick={() => void proposeNote(message, offer)}
                          disabled={offerBusy === message.id}
                          className="mt-2 rounded-md bg-brass px-3 py-1.5 text-sm font-medium text-olive disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-olive"
                        >
                          {offerBusy === message.id ? "Proposing…" : "Propose a note"}
                        </button>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
        </div>

        <form
          className="border-t border-line px-4 py-3 md:px-6"
          onSubmit={(event) => {
            event.preventDefault();
            void sendMessage();
          }}
        >
          <label className="mb-2 flex items-center gap-2 text-sm text-muted" htmlFor="speaker">
            Speaking as
            <select
              id="speaker"
              value={author}
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
          <div className="flex items-end gap-2">
            <textarea
              ref={composerRef}
              value={draft}
              rows={2}
              aria-label={`Message ${active.label}`}
              placeholder={`Message ${active.label}. Mention @Echo or a specialist.`}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  void sendMessage();
                }
              }}
              className="min-h-16 flex-1 resize-none rounded-md border border-line bg-white px-3 py-2 text-[15px] leading-6 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brass"
            />
            <button
              type="submit"
              disabled={sending || draft.trim().length === 0}
              className="rounded-md bg-brass px-4 py-2 text-sm font-medium text-olive disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-olive"
            >
              {sending ? "Sending…" : "Send"}
            </button>
          </div>
          {error ? <p className="mt-2 text-sm text-olive">{error}</p> : null}
          <div className="mt-3 flex gap-2 overflow-x-auto md:hidden">
            {AGENTS.map((agent) => (
              <button
                key={agent.name}
                type="button"
                onClick={() => mention(agent.name)}
                className="rounded-full border border-line bg-white px-3 py-1 text-xs whitespace-nowrap focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brass"
              >
                @{agent.name}
              </button>
            ))}
          </div>
        </form>
      </section>
    </div>
  );
}
