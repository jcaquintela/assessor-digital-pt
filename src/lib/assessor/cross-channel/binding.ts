// "Sim" no outro canal: a que pergunta se refere?
//
// Com a conversa partilhada, uma pergunta feita no WhatsApp pode ser
// respondida no Telegram. O perigo é uma resposta cega ("sim", "ok", "não")
// cair numa pergunta que o consultor NÃO está a ver no canal onde respondeu
// (ex.: no WhatsApp vê a proposta A; entretanto no Telegram nasceu a B, que
// substituiu a A; o "sim" no WhatsApp confirmaria a B sem ele saber).
//
// Regra: uma resposta cega só pode resolver pendentes cuja pergunta foi
// mostrada NESTE canal. Se houver um pendente em aberto que só foi mostrado
// noutro canal, o Afonso volta a mostrá-lo aqui e espera — nunca executa.
//
// Módulo puro (sem I/O).

import { isConfirmation, isRejection } from "../culture/short-answers";
import { channelLabelPt } from "./scope";

export interface PendingLite {
  id: string;
  channel: string;
  intent: string;
  status?: string;
  presented_channels?: string[] | null;
  current_question?: string | null;
  pending_question?: string | null;
  structured_payload?: Record<string, any> | null;
  original_content?: string | null;
  created_at: string;
  updated_at?: string | null;
  resolved_channel?: string | null;
}

export const ACTIVE_PENDING_STATUSES = [
  "pending_confirmation",
  "collecting_information",
  "correction_pending",
] as const;

// Respostas curtas que, sozinhas, não dizem a que pergunta se referem.
const BLIND_LEAD_RE =
  /^\s*(sim|s|ok|okay|okey|pode(s)?|avan[çc]a|confirm[oa]|certo|perfeito|bora|vamos|exato|exacto|claro|n[ãa]o|nao|cancela|esquece|deixa|nope)(?![\p{L}])/iu;
const BLIND_MAX_LEN = 40;

export function isBlindAnswer(text: string | null | undefined): boolean {
  const t = String(text ?? "").trim();
  if (!t) return false;
  if (isConfirmation(t) || isRejection(t)) return true;
  return t.length <= BLIND_MAX_LEN && BLIND_LEAD_RE.test(t);
}

/** Canais onde a pergunta já foi mostrada. Vazio = só a origem. */
export function presentedChannels(p: Pick<PendingLite, "channel" | "presented_channels">): string[] {
  const list = Array.isArray(p.presented_channels) ? p.presented_channels.filter(Boolean) : [];
  return list.length ? list : [p.channel];
}

export function wasPresentedIn(p: Pick<PendingLite, "channel" | "presented_channels">, channel: string): boolean {
  return presentedChannels(p).includes(channel);
}

export type BindingDecision =
  | { kind: "proceed" }
  | { kind: "bind"; pendingIds: string[] }
  | { kind: "represent"; pending: PendingLite }
  | { kind: "already_resolved"; pending: PendingLite; resolvedChannel: string };

function newest<T extends { created_at: string }>(rows: T[]): T {
  return [...rows].sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))[0];
}

export function decideBinding(args: {
  text: string;
  channel: string;
  active: PendingLite[];
  recentlyResolved?: PendingLite[];
}): BindingDecision {
  if (!isBlindAnswer(args.text)) return { kind: "proceed" };
  const active = args.active ?? [];
  const notHere = active.filter((p) => !wasPresentedIn(p, args.channel));
  if (notHere.length) return { kind: "represent", pending: newest(notHere) };
  if (active.length) return { kind: "bind", pendingIds: active.map((p) => p.id) };
  const resolved = (args.recentlyResolved ?? []).find(
    (p) => !!p.resolved_channel && p.resolved_channel !== args.channel && wasPresentedIn(p, args.channel),
  );
  if (resolved) return { kind: "already_resolved", pending: resolved, resolvedChannel: String(resolved.resolved_channel) };
  return { kind: "proceed" };
}

function firstLine(s: string): string {
  return String(s ?? "").split(/\n/)[0].trim();
}

/** Volta a mostrar no canal atual a pergunta feita noutro canal. */
export function representText(p: PendingLite, describe?: (p: PendingLite) => string): string {
  const where = channelLabelPt(p.channel);
  const q = String(p.current_question ?? p.pending_question ?? "").trim().slice(0, 600);
  if (q) return `Antes de avançar, confirma aqui: no ${where} ficou em aberto isto — ${q}`;
  const what = firstLine(describe ? describe(p) : p.original_content ?? "") || "uma proposta";
  return `Antes de avançar, confirma aqui: no ${where} ficou em aberto ${what.charAt(0).toLowerCase()}${what.slice(1)}. Avanço?`;
}

export function alreadyResolvedText(resolvedChannel: string): string {
  return `Isso já ficou tratado: respondeste no ${channelLabelPt(resolvedChannel)}.`;
}

export const BUSY_TEXT =
  "Já estou a tratar dessa resposta na outra conversa — não repito para não fazer o mesmo duas vezes.";
