// Definições por conversa — módulo puro.
//
// Regra: leitura de tudo; escrita só das preferências reversíveis. Plano,
// pagamentos, ligar/desligar contas e fusão de contas nunca se mexem por
// conversa — o Afonso explica e aponta o caminho no painel.

import {
  AUTONOMY_LABEL,
  isAutonomyLevel,
  type AutonomyLevel,
} from "@/lib/subscription/tiers";

export type SettingKey =
  | "morning_time"
  | "morning_days"
  | "evening_time"
  | "evening_review_detail"
  | "evening_checkin_time"
  | "max_daily_nudges"
  | "quiet_hours_start"
  | "quiet_hours_end"
  | "reminder_lead_minutes"
  | "autonomy_level";

export interface EditableSetting {
  label: string;
  /** Autonomia muda o comportamento do Afonso: confirmação sempre explícita. */
  highImpact?: boolean;
}

export const EDITABLE_SETTINGS: Record<SettingKey, EditableSetting> = {
  morning_time: { label: "a hora do briefing da manhã" },
  morning_days: { label: "os dias do briefing" },
  evening_time: { label: "a hora do resumo de fim de dia" },
  evening_review_detail: { label: "o detalhe do resumo de fim de dia" },
  evening_checkin_time: { label: "a hora do check-in da tarde" },
  max_daily_nudges: { label: "o teto de avisos por dia" },
  quiet_hours_start: { label: "o início das horas de silêncio" },
  quiet_hours_end: { label: "o fim das horas de silêncio" },
  reminder_lead_minutes: { label: "a antecedência dos lembretes" },
  autonomy_level: { label: "o nível de autonomia", highImpact: true },
};

export interface BlockedSetting {
  label: string;
  where: string;
}

/** Só no painel — o Afonso nunca escreve nestes campos. */
export const BLOCKED_SETTINGS: Record<string, BlockedSetting> = {
  plan: { label: "o plano", where: "/subscricao" },
  billing: { label: "os dados de pagamento", where: "/subscricao" },
  oauth_calendar: { label: "a ligação ao calendário", where: "/definicoes" },
  oauth_email: { label: "a ligação ao email", where: "/definicoes" },
  channel_link: { label: "a ligação dos canais", where: "/definicoes" },
  merge_accounts: { label: "a fusão de contas", where: "/definicoes" },
};

export function blockedMessage(key: string): string {
  const b = BLOCKED_SETTINGS[key];
  if (!b) return "Isso não consigo mudar por aqui — vê no painel, em /definicoes.";
  return `Isso não mexo por conversa: ${b.label} muda-se no painel, em ${b.where}.`;
}

const EDITABLE_ALIASES: Array<[RegExp, SettingKey]> = [
  [/\b(hora|horas)\b.*\bbriefing\b|\bbriefing\b.*\bhora\b|briefing.*manh[ãa]/i, "morning_time"],
  [/dias?\s+(do|de)\s+briefing|briefing.*dias/i, "morning_days"],
  [/detalhe|detalhado|curto|resumido|mais\s+curto/i, "evening_review_detail"],
  [/hora.*(resumo|fim\s+de\s+dia)|(resumo|fim\s+de\s+dia).*hora/i, "evening_time"],
  [/check[-\s]?in/i, "evening_checkin_time"],
  [/teto|m[áa]ximo.*avisos|avisos.*dia|limite.*avisos/i, "max_daily_nudges"],
  [/sil[êe]ncio.*(fim|acaba|termina)|fim.*sil[êe]ncio/i, "quiet_hours_end"],
  [/sil[êe]ncio|n[ãa]o\s+me\s+mandes\s+nada\s+depois/i, "quiet_hours_start"],
  [/anteced[êe]ncia|lembrete.*minutos|minutos.*antes/i, "reminder_lead_minutes"],
  [/autonomia|proativo|conservador|equilibrado/i, "autonomy_level"],
];

const BLOCKED_ALIASES: Array<[RegExp, string]> = [
  [/plano|subscri[çc][ãa]o|tier|upgrade|pro\b|team\b/i, "plan"],
  [/pagamento|cart[ãa]o|factura|fatura|stripe|cobran[çc]a/i, "billing"],
  [/google\s*calendar|calend[áa]rio.*(ligar|desligar)|ligar.*calend[áa]rio/i, "oauth_calendar"],
  [/gmail|outlook|ligar.*email|desligar.*email/i, "oauth_email"],
  [/whatsapp|telegram|ligar.*canal|desligar.*canal/i, "channel_link"],
  [/fundir|fus[ãa]o.*conta|juntar.*conta/i, "merge_accounts"],
];

export type SettingClassification =
  | { kind: "editable"; key: SettingKey }
  | { kind: "blocked"; key: string; message: string; where: string }
  | { kind: "unknown" };

/** Aceita a chave técnica ou a forma natural dita pelo consultor. */
export function classifySetting(raw: unknown): SettingClassification {
  const text = typeof raw === "string" ? raw.trim() : "";
  if (!text) return { kind: "unknown" };
  if (text in EDITABLE_SETTINGS) return { kind: "editable", key: text as SettingKey };
  if (text in BLOCKED_SETTINGS) {
    return { kind: "blocked", key: text, message: blockedMessage(text), where: BLOCKED_SETTINGS[text].where };
  }
  for (const [re, key] of BLOCKED_ALIASES) {
    if (re.test(text)) {
      return { kind: "blocked", key, message: blockedMessage(key), where: BLOCKED_SETTINGS[key].where };
    }
  }
  for (const [re, key] of EDITABLE_ALIASES) if (re.test(text)) return { kind: "editable", key };
  return { kind: "unknown" };
}

const DETAIL_ALIASES: Record<string, string> = {
  curto: "curto", "mais curto": "curto", resumido: "curto", breve: "curto",
  normal: "normal", equilibrado: "normal", medio: "normal", médio: "normal",
  detalhado: "detalhado", completo: "detalhado", longo: "detalhado", "mais detalhado": "detalhado",
};

const AUTONOMY_ALIASES: Record<string, AutonomyLevel> = {
  conservador: "conservador", cauteloso: "conservador", prudente: "conservador",
  equilibrado: "balanced", balanced: "balanced", normal: "balanced",
  proativo: "proativo", "proactivo": "proativo", agressivo: "proativo",
};

const WEEKDAYS: Record<string, number> = {
  domingo: 0, segunda: 1, terca: 2, terça: 2, quarta: 3, quinta: 4, sexta: 5, sabado: 6, sábado: 6,
};

function hhmm(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const m = value.trim().toLowerCase().match(/^(\d{1,2})\s*(?:[:h.]\s*(\d{1,2}))?\s*h?$/);
  if (!m) return null;
  const h = Number(m[1]);
  const min = m[2] === undefined ? 0 : Number(m[2]);
  if (h > 23 || min > 59) return null;
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

export type NormalizedValue =
  | { ok: true; value: string | number | number[] | null; display: string }
  | { ok: false; error: string };

/** Converte o que o consultor disse no valor que a coluna aceita. */
export function normalizeSettingValue(key: SettingKey, raw: unknown): NormalizedValue {
  switch (key) {
    case "morning_time":
    case "evening_time":
    case "evening_checkin_time":
    case "quiet_hours_start":
    case "quiet_hours_end": {
      const t = hhmm(raw);
      return t ? { ok: true, value: t, display: t } : { ok: false, error: "hora_invalida" };
    }
    case "evening_review_detail": {
      const k = String(raw ?? "").trim().toLowerCase();
      const v = DETAIL_ALIASES[k];
      return v ? { ok: true, value: v, display: v } : { ok: false, error: "detalhe_invalido" };
    }
    case "max_daily_nudges": {
      const n = Number(raw);
      if (!Number.isFinite(n) || n < 0 || n > 20) return { ok: false, error: "valor_invalido" };
      return { ok: true, value: Math.floor(n), display: `${Math.floor(n)} por dia` };
    }
    case "reminder_lead_minutes": {
      if (raw === null) return { ok: true, value: null, display: "sem antecedência definida" };
      const n = Number(raw);
      if (!Number.isFinite(n) || n < 0 || n > 240) return { ok: false, error: "valor_invalido" };
      return { ok: true, value: Math.floor(n), display: `${Math.floor(n)} minutos antes` };
    }
    case "morning_days": {
      const list = Array.isArray(raw)
        ? raw
        : String(raw ?? "").split(/[,;e]| e /i).map((s) => s.trim()).filter(Boolean);
      const days: number[] = [];
      for (const item of list) {
        const n = typeof item === "number" ? item : Number(item);
        if (Number.isFinite(n) && n >= 0 && n <= 6) { days.push(Math.floor(n)); continue; }
        const key2 = String(item).toLowerCase().replace(/-feira/, "").trim();
        if (key2 in WEEKDAYS) days.push(WEEKDAYS[key2]);
        else return { ok: false, error: "dias_invalidos" };
      }
      if (!days.length) return { ok: false, error: "dias_invalidos" };
      const uniq = [...new Set(days)].sort((a, b) => a - b);
      return { ok: true, value: uniq, display: uniq.map(dayName).join(", ") };
    }
    case "autonomy_level": {
      const k = String(raw ?? "").trim().toLowerCase();
      const v = isAutonomyLevel(k) ? (k as AutonomyLevel) : AUTONOMY_ALIASES[k];
      return v ? { ok: true, value: v, display: AUTONOMY_LABEL[v] } : { ok: false, error: "autonomia_invalida" };
    }
  }
}

export function dayName(n: number): string {
  return ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"][n] ?? String(n);
}

export const CONFIRM_QUESTION = (key: SettingKey, display: string): string =>
  `Queres que passe ${EDITABLE_SETTINGS[key].label} para ${display}? Confirma e eu trato.`;

export const UPDATED_REPLY = (key: SettingKey, display: string): string =>
  `Feito: ${EDITABLE_SETTINGS[key].label} passa a ${display}.`;

export interface SettingsSnapshot {
  tier: string;
  preferences: Record<string, any> | null;
  primaryChannel?: string | null;
  calendarProvider?: string | null;
  mailProvider?: string | null;
}

const TIER_LABEL: Record<string, string> = {
  base: "Base", consultor: "Consultor", pro: "Pro", hub: "Team",
};

/** Resumo legível de tudo — inclui o que só se muda no painel. */
export function formatSettingsSummary(s: SettingsSnapshot): string {
  const p = s.preferences ?? {};
  const lines: string[] = [];
  lines.push(`Plano: ${TIER_LABEL[s.tier] ?? s.tier}`);
  if (s.primaryChannel) lines.push(`Canal principal: ${s.primaryChannel}`);
  lines.push(
    `Briefing da manhã: ${p.morning_briefing_enabled === false ? "desligado" : "ligado"}` +
      `${p.morning_time ? ` às ${String(p.morning_time).slice(0, 5)}` : ""}` +
      `${Array.isArray(p.morning_days) && p.morning_days.length ? ` (${p.morning_days.map(dayName).join(", ")})` : ""}`,
  );
  lines.push(
    `Resumo de fim de dia: ${p.evening_wrap_enabled === false ? "desligado" : "ligado"}` +
      `${p.evening_time ? ` às ${String(p.evening_time).slice(0, 5)}` : ""}` +
      `, detalhe ${p.evening_review_detail ?? "normal"}`,
  );
  lines.push(
    `Check-in da tarde: ${p.evening_checkin_enabled === false ? "desligado" : "ligado"}` +
      `${p.evening_checkin_time ? ` às ${String(p.evening_checkin_time).slice(0, 5)}` : ""}`,
  );
  lines.push(`Avisos: até ${p.max_daily_nudges ?? 0} por dia, push ${p.proactive_push_enabled === false ? "desligado" : "ligado"}`);
  lines.push(
    `Horas de silêncio: ${String(p.quiet_hours_start ?? "22:00").slice(0, 5)} — ${String(p.quiet_hours_end ?? "08:00").slice(0, 5)}`,
  );
  lines.push(
    `Antecedência dos lembretes: ${p.reminder_lead_minutes == null ? "por definir" : `${p.reminder_lead_minutes} min`}`,
  );
  lines.push(
    `Autonomia: ${AUTONOMY_LABEL[(p.autonomy_level ?? "conservador") as AutonomyLevel] ?? p.autonomy_level}`,
  );
  lines.push(`Confirmar envio de documentos: ${p.confirm_document_send === false ? "não" : "sim"}`);
  if (s.calendarProvider) lines.push(`Calendário ligado: ${s.calendarProvider}`);
  if (s.mailProvider) lines.push(`Email ligado: ${s.mailProvider}`);
  return lines.join("\n");
}
