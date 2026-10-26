const WEEKDAY_INDEX: Record<string, number> = {
  domingo: 0,
  sunday: 0,
  segunda: 1,
  "segunda-feira": 1,
  monday: 1,
  terca: 2,
  "terca-feira": 2,
  tuesday: 2,
  quarta: 3,
  "quarta-feira": 3,
  wednesday: 3,
  quinta: 4,
  "quinta-feira": 4,
  thursday: 4,
  sexta: 5,
  "sexta-feira": 5,
  friday: 5,
  sabado: 6,
  saturday: 6,
};

const WEEKDAY =
  "segunda-feira|terca-feira|quarta-feira|quinta-feira|sexta-feira|segunda|terca|quarta|quinta|sexta|sabado|domingo|monday|tuesday|wednesday|thursday|friday|saturday|sunday";

type LisbonDate = {
  year: number;
  month: number;
  day: number;
  weekday: number;
};

type Hit = {
  iso: string;
  today: boolean;
};

export function lisbonDate(now = new Date()): LisbonDate {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Lisbon",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
  }).formatToParts(now);
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "";
  const weekday = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }[value("weekday")];
  if (weekday === undefined) throw new Error("Não foi possível ler o dia em Lisboa.");
  return {
    year: Number(value("year")),
    month: Number(value("month")),
    day: Number(value("day")),
    weekday,
  };
}

export function isoDate(year: number, month: number, day: number) {
  const date = new Date(Date.UTC(year, month - 1, day));
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function addDays(base: LisbonDate, days: number) {
  return isoDate(base.year, base.month, base.day + days);
}

function upcomingWeekday(base: LisbonDate, target: number, skipToday: boolean) {
  let delta = (target - base.weekday + 7) % 7;
  if (delta === 0 && skipToday) delta = 7;
  return addDays(base, delta);
}

function nextWeekMonday(base: LisbonDate) {
  let delta = (1 - base.weekday + 7) % 7;
  if (delta === 0) delta = 7;
  return addDays(base, delta);
}

function weekdayInNextWeek(base: LisbonDate, target: number) {
  const monday = nextWeekMonday(base);
  const [year, month, day] = monday.split("-").map(Number);
  const fromMonday = target === 0 ? 6 : target - 1;
  return isoDate(year, month, day + fromMonday);
}

function fold(text: string) {
  return text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
}

export function explicitIsoDate(value: string): string | null {
  const trimmed = value.trim();
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
  if (iso) {
    const year = Number(iso[1]);
    const month = Number(iso[2]);
    const day = Number(iso[3]);
    return isoDate(year, month, day) === trimmed ? trimmed : null;
  }
  const local = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(trimmed);
  if (!local) return null;
  const day = Number(local[1]);
  const month = Number(local[2]);
  const year = Number(local[3]);
  const normalized = isoDate(year, month, day);
  const [y, m, d] = normalized.split("-").map(Number);
  return y === year && m === month && d === day ? normalized : null;
}

function weekdayOf(token: string) {
  return WEEKDAY_INDEX[token] ?? null;
}

function collectHits(text: string, now: Date): Hit[] {
  const folded = fold(text);
  const base = lisbonDate(now);
  const pattern = new RegExp(
    [
      String.raw`\bday after tomorrow\b`,
      String.raw`\bdepois de amanha\b`,
      String.raw`\b(?:amanha|tomorrow)\b`,
      String.raw`\b(?:hoje|today)\b`,
      String.raw`\b(?:next week|proxima semana|semana que vem)\b(?:\s*,?\s*(?:on\s+)?)?(${WEEKDAY})\b`,
      String.raw`\b(${WEEKDAY})\b(?:\s+da)?\s+\b(?:proxima semana|next week)\b`,
      String.raw`\b(?:na\s+)?(?:proxima semana|next week|semana que vem)\b`,
      String.raw`\b(?:(?:proxima|next|esta|this|na)\s+)?(${WEEKDAY})\b`,
    ].join("|"),
    "gi",
  );
  const hits: Hit[] = [];
  for (const match of folded.matchAll(pattern)) {
    const raw = match[0];
    const weekday = raw.match(new RegExp(WEEKDAY, "i"))?.[0] ?? "";
    const nextWeek = /next week|proxima semana|semana que vem/.test(raw);
    let iso = "";
    let today = false;
    if (raw === "day after tomorrow" || raw === "depois de amanha") iso = addDays(base, 2);
    else if (raw === "amanha" || raw === "tomorrow") iso = addDays(base, 1);
    else if (raw === "hoje" || raw === "today") {
      iso = addDays(base, 0);
      today = true;
    } else if (weekday && nextWeek) {
      const index = weekdayOf(weekday);
      if (index === null) continue;
      iso = weekdayInNextWeek(base, index);
    } else if (nextWeek) iso = nextWeekMonday(base);
    else if (weekday) {
      const index = weekdayOf(weekday);
      if (index === null) continue;
      iso = upcomingWeekday(base, index, /^(?:proxima|next)\b/.test(raw));
    }
    if (iso) hits.push({ iso, today });
  }
  return hits;
}

export function lisbonDateLine(now = new Date()) {
  const english = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Lisbon",
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(now);
  const portuguese = new Intl.DateTimeFormat("pt-PT", {
    timeZone: "Europe/Lisbon",
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(now);
  return `Today is ${english} (${portuguese}), Europe/Lisbon. When you propose an activity, copy a relative date such as "amanhã", "quinta-feira" or "next week" into due_date and do not convert it to a calendar date. The server resolves it. "next week" or "próxima semana" with no weekday is the Monday of the next week. If the day is not clear, omit due_date. Never guess a date.`;
}

export function formatApprovalDate(value: string) {
  const iso = explicitIsoDate(value);
  if (!iso) return value;
  const [year, month, day] = iso.split("-").map(Number);
  return new Intl.DateTimeFormat("pt-PT", {
    weekday: "long",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, month - 1, day, 12)));
}

const MONTHS_PT = [
  "janeiro",
  "fevereiro",
  "marco",
  "abril",
  "maio",
  "junho",
  "julho",
  "agosto",
  "setembro",
  "outubro",
  "novembro",
  "dezembro",
];
const MONTHS_EN = [
  "january",
  "february",
  "march",
  "april",
  "may",
  "june",
  "july",
  "august",
  "september",
  "october",
  "november",
  "december",
];

function mentionsDate(text: string, iso: string) {
  const [year, month, day] = iso.split("-").map(Number);
  const folded = fold(text);
  const dd = String(day).padStart(2, "0");
  const mm = String(month).padStart(2, "0");
  const numeric = [
    iso,
    `${day}/${month}/${year}`,
    `${dd}/${mm}/${year}`,
    `${day}-${month}-${year}`,
    `${dd}-${mm}-${year}`,
  ];
  if (numeric.some((pattern) => folded.includes(pattern))) return true;
  const portuguese = MONTHS_PT[month - 1];
  const english = MONTHS_EN[month - 1];
  return new RegExp(`\\b${day}\\s+de\\s+${portuguese}\\b|\\b${dd}\\s+de\\s+${portuguese}\\b|\\b${english}\\s+${day}\\b|\\b${day}\\s+${english}\\b`).test(
    folded,
  );
}

function resolvedDates(hits: Hit[]) {
  const dated = hits.some((hit) => !hit.today) ? hits.filter((hit) => !hit.today) : hits;
  return [...new Set(dated.map((hit) => hit.iso))];
}

function withoutDueDate(payload: Record<string, unknown>) {
  const next = { ...payload };
  delete next.due_date;
  return next;
}

export function settleActivityDueDate(payload: Record<string, unknown>, context: string, now = new Date()) {
  const due = typeof payload.due_date === "string" ? payload.due_date.trim() : "";
  const subject = typeof payload.subject === "string" ? payload.subject : "";
  const note = typeof payload.note === "string" ? payload.note : "";
  const fromUser = resolvedDates(collectHits(context, now));
  if (fromUser.length > 1) return withoutDueDate(payload);
  if (fromUser.length === 1) return { ...payload, due_date: fromUser[0] };

  const fromDraft = resolvedDates(collectHits(`${subject}\n${note}\n${due}`, now));
  if (fromDraft.length > 1) return withoutDueDate(payload);
  if (fromDraft.length === 1) return { ...payload, due_date: fromDraft[0] };

  const explicit = due ? explicitIsoDate(due) : null;
  if (explicit && (!context.trim() || mentionsDate(context, explicit))) return { ...payload, due_date: explicit };
  if (!due) return payload;
  return withoutDueDate(payload);
}
