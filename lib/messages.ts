import { getDb } from "@/lib/db";
import { isChannel, isUserName, type Channel, type UserName } from "@/lib/constants";
import type { Message } from "@/lib/message";

const ECHO_MENTION = /(?:^|\s)@Echo\b/i;

export function listMessages(channel: Channel): Message[] {
  const db = getDb();
  return db
    .prepare(
      `SELECT id, channel, author, author_type, content, meta_json, created_at
       FROM messages
       WHERE channel = ?
       ORDER BY id ASC`,
    )
    .all(channel) as Message[];
}

export function postHumanMessage(input: {
  channel: Channel;
  author: UserName;
  content: string;
}): Message[] {
  const db = getDb();
  const insert = db.prepare(
    `INSERT INTO messages (channel, author, author_type, content, meta_json, created_at)
     VALUES (@channel, @author, @author_type, @content, @meta_json, @created_at)`,
  );
  const read = db.prepare(
    `SELECT id, channel, author, author_type, content, meta_json, created_at
     FROM messages
     WHERE id = ?`,
  );

  const save = db.transaction((channel: Channel, author: UserName, content: string) => {
    const created: Message[] = [];
    const human = insert.run({
      channel,
      author,
      author_type: "human",
      content,
      meta_json: null,
      created_at: new Date().toISOString(),
    });
    created.push(read.get(human.lastInsertRowid) as Message);

    if (ECHO_MENTION.test(content)) {
      const heard = content.replace(/@Echo\b/gi, "").replace(/\s+/g, " ").trim();
      const echo = insert.run({
        channel,
        author: "Echo",
        author_type: "agent",
        content: heard.length > 0 ? heard : "Echo.",
        meta_json: null,
        created_at: new Date().toISOString(),
      });
      created.push(read.get(echo.lastInsertRowid) as Message);
    }

    return created;
  });

  return save(input.channel, input.author, input.content);
}

export function insertAgentMessage(input: {
  channel: Channel;
  author: string;
  content: string;
  meta?: Record<string, unknown> | null;
}): Message {
  const db = getDb();
  const inserted = db
    .prepare(
      `INSERT INTO messages (channel, author, author_type, content, meta_json, created_at)
       VALUES (@channel, @author, 'agent', @content, @meta_json, @created_at)`,
    )
    .run({
      channel: input.channel,
      author: input.author,
      content: input.content,
      meta_json: input.meta ? JSON.stringify(input.meta) : null,
      created_at: new Date().toISOString(),
    });
  return db
    .prepare(
      `SELECT id, channel, author, author_type, content, meta_json, created_at
       FROM messages
       WHERE id = ?`,
    )
    .get(inserted.lastInsertRowid) as Message;
}

export function readMessage(id: number): Message | null {
  if (!Number.isInteger(id) || id <= 0) return null;
  const row = getDb()
    .prepare(
      `SELECT id, channel, author, author_type, content, meta_json, created_at
       FROM messages
       WHERE id = ?`,
    )
    .get(id) as Message | undefined;
  return row ?? null;
}

export function markNoteOfferProposed(messageId: number) {
  if (!Number.isInteger(messageId) || messageId <= 0) return;
  const db = getDb();
  const row = db.prepare(`SELECT meta_json FROM messages WHERE id = ?`).get(messageId) as
    | { meta_json: string | null }
    | undefined;
  if (!row?.meta_json) return;
  try {
    const meta = JSON.parse(row.meta_json) as { noteOffer?: { proposed?: boolean } };
    if (!meta.noteOffer || typeof meta.noteOffer !== "object") return;
    meta.noteOffer.proposed = true;
    db.prepare(`UPDATE messages SET meta_json = ? WHERE id = ?`).run(JSON.stringify(meta), messageId);
  } catch {
    return;
  }
}

export function parsePostBody(body: unknown):
  | { ok: true; channel: Channel; author: UserName; content: string }
  | { ok: false; error: string } {
  if (!body || typeof body !== "object") {
    return { ok: false, error: "Falta o conteúdo da mensagem." };
  }

  const record = body as Record<string, unknown>;
  const channel = typeof record.channel === "string" ? record.channel : "";
  const author = typeof record.author === "string" ? record.author : "";
  const content = typeof record.content === "string" ? record.content.trim() : "";

  if (!isChannel(channel)) return { ok: false, error: "Canal desconhecido." };
  if (!isUserName(author)) return { ok: false, error: "Quem fala não é reconhecido." };
  if (!content) return { ok: false, error: "Escreve uma mensagem antes de enviar." };
  if (content.length > 4000) {
    return { ok: false, error: "A mensagem é demasiado longa (4000 caracteres)." };
  }

  return { ok: true, channel, author, content };
}
