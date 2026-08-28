// Processador de Áudio Imobiliário — parte com BD e IA.
//
// A IA só interpreta. Quem escreve na base de dados são os Domain Services
// (TOOL_REGISTRY), e só depois do consultor confirmar a proposta inteira.

import { callGateway, V2_MODEL_DEFAULT } from "../v2/gateway.server";
import { TOOL_REGISTRY, type DomainContext, resolvePropertyOrAsk } from "../v2/domain.server";
import { createPendingAction, markPendingActionStatus, type PendingActionRow } from "../memory.server";
import { looksConfidential } from "../culture/confidential";
import {
  coerceBreakdown,
  emptyPersonLink,
  formatBreakdownDone,
  formatBreakdownProposal,
  type AudioBreakdown,
  type BreakdownItem,
  type BreakdownPersonCandidate,
  type BreakdownPersonLink,
} from "./audio-breakdown";
import { lisbonYmd } from "../lisbon-day";

export const AUDIO_BREAKDOWN_INTENT = "audio_breakdown";

export function todayLisbonYmd(): string {
  return lisbonYmd(new Date());
}

const SYSTEM = `És o motor de separação de notas de voz de um consultor imobiliário português.
Recebes a transcrição de um áudio informal e comprido. Separa-o nos itens distintos que contém.

Devolve APENAS JSON válido:
{"subject": "assunto curto ou null", "items": [{"kind":"fact|follow_up|note","text":"...","person_name":"ou null","property_hint":"ou null","due_date":"YYYY-MM-DD ou null","due_time":"HH:MM ou null","confidential":true|false}]}

Regras:
- "fact": informação nova e objetiva sobre um imóvel, pessoa ou negócio (preço, área, estado, condições).
- "follow_up": algo a fazer ou a agendar (ligar, visitar, enviar, marcar). Usa datas absolutas; hoje é {{TODAY}} (Europa/Lisboa).
- "note": impressão, contexto ou comentário pessoal. Marca confidential=true quando é uma opinião crua, uma fragilidade do cliente ou algo que o consultor nunca diria ao próprio cliente, ou quando ele diz "isto é confidencial"/"só para mim".
- Um item por assunto. Não inventes nada que não esteja no áudio. Nunca juntes um facto com uma tarefa no mesmo item.
- Escreve o texto de cada item em PT-PT natural, curto, na 3.ª pessoa (sem "eu").
- No máximo 8 itens.`;

export async function analyseAudioTranscript(transcript: string): Promise<AudioBreakdown | null> {
  const res = await callGateway({
    model: V2_MODEL_DEFAULT,
    temperature: 0.1,
    responseFormat: { type: "json_object" },
    messages: [
      { role: "system", content: SYSTEM.replace("{{TODAY}}", todayLisbonYmd()) },
      { role: "user", content: transcript.slice(0, 8000) },
    ],
  });
  const raw = res.ok ? String(res.message?.content ?? "") : "";
  if (!raw) return null;
  let parsed: any = null;
  try { parsed = JSON.parse(raw); } catch {
    const m = raw.match(/\{[\s\S]*\}/);
    if (m) { try { parsed = JSON.parse(m[0]); } catch { /* noop */ } }
  }
  if (!parsed) return null;
  const breakdown = coerceBreakdown(parsed);
  // Rede de segurança: se o consultor disse a palavra, é confidencial mesmo
  // que o modelo não a tenha marcado.
  if (looksConfidential(transcript)) {
    for (const it of breakdown.items) {
      if (it.kind === "note" && looksConfidential(it.text)) it.confidential = true;
    }
  }
  return breakdown.items.length >= 2 ? breakdown : null;
}

/** Cria a proposta única (um só pending_action com todos os itens). */
export async function proposeAudioBreakdown(
  ctx: DomainContext,
  transcript: string,
  breakdown: AudioBreakdown,
  audioFileId?: string | null,
): Promise<string> {
  // A resolução de contactos acontece ANTES da proposta: o que ficar em
  // dúvida vai perguntado na mesma confirmação.
  const links = await resolveBreakdownPeople(ctx, breakdown);
  const withLinks: AudioBreakdown = { ...breakdown, links };
  await createPendingAction(ctx.supabase, {
    userId: ctx.userId,
    channel: ctx.channel,
    intent: AUDIO_BREAKDOWN_INTENT,
    originalContent: transcript.slice(0, 4000),
    payload: { ...(withLinks as unknown as Record<string, any>), audio_file_id: audioFileId ?? null },
    confidence: 0.8,
    sourceMessageId: ctx.sourceMessageId ?? null,
  });
  return formatBreakdownProposal(withLinks);
}

/**
 * Resolução de contacto de cada item — mesma regra de confiança do resto do
 * produto (`resolvePersonForWrite`): só liga sozinho quando é inequívoco.
 *
 * Caso real: um áudio que diz "Manuel", havendo "Manuel Silva" e "Manuela
 * Dias" na conta, ligava à Manuela por pesquisa de substring. Agora a dúvida
 * sobe à confirmação do áudio e é o consultor que escolhe.
 */
export async function resolveBreakdownPeople(
  ctx: DomainContext,
  breakdown: AudioBreakdown,
): Promise<BreakdownPersonLink[]> {
  const { resolvePersonForWrite } = await import("@/lib/people/resolve-person.server");
  const cache = new Map<string, BreakdownPersonLink>();
  const out: BreakdownPersonLink[] = [];
  for (const item of breakdown.items) {
    const name = String(item.person_name ?? "").trim();
    if (name.length < 2) { out.push(emptyPersonLink()); continue; }
    const key = name.toLowerCase();
    const cached = cache.get(key);
    if (cached) { out.push(cached); continue; }
    let link: BreakdownPersonLink = emptyPersonLink();
    try {
      const res = await resolvePersonForWrite(ctx as any, "", { nameOverride: name });
      if ((res.status === "linked" || res.status === "confirm_exact") && res.personId) {
        link = { person_id: res.personId, candidates: [] };
      } else if (res.status !== "none") {
        link = { person_id: null, candidates: (res.candidates ?? []).slice(0, 4) as BreakdownPersonCandidate[] };
      }
    } catch { /* sem resolução, fica por associar */ }
    cache.set(key, link);
    out.push(link);
  }
  return out;
}

async function execItem(
  ctx: DomainContext,
  item: BreakdownItem,
  link: BreakdownPersonLink,
): Promise<{ kind: "fact" | "follow_up" | "note"; record: { table: string; id: string } | null } | null> {
  const personId = link.person_id;
  // Mesma disciplina da resolução de pessoa em áudio: só ligamos ao imóvel
  // quando a morada é a mesma. "Provável" ("Boavista 120" vs "Boavista 12")
  // fica por associar em vez de escrever no imóvel errado.
  const propertyId = item.property_hint
    ? (await resolvePropertyOrAsk({ ...ctx, sourceMessageId: null }, item.property_hint)).id
    : null;

  if (item.kind === "follow_up") {
    const res = await TOOL_REGISTRY.create_follow_up(ctx, {
      title: item.text,
      type: "tarefa",
      due_date: item.due_date ?? todayLisbonYmd(),
      due_time: item.due_time ?? null,
      priority: "media",
      person_id: personId,
      property_id: propertyId,
    });
    if (!res.ok) return null;
    const id = (res.data as any)?.follow_up?.id ?? null;
    return { kind: "follow_up", record: id ? { table: "follow_ups", id: String(id) } : null };
  }

  const res = await TOOL_REGISTRY.save_interaction(ctx, {
    summary: item.text,
    person_id: personId,
    property_id: propertyId,
    interaction_type: item.kind === "fact" ? "facto" : "nota",
    is_confidential: item.kind === "note" && item.confidential === true,
  });
  if (!res.ok) return null;
  const id = (res.data as any)?.interaction?.id ?? null;
  return {
    kind: item.kind === "fact" ? "fact" : "note",
    record: id ? { table: "interactions", id: String(id) } : null,
  };
}

/** Executa todos os itens da proposta depois de um "sim". */
export async function executeAudioBreakdown(
  ctx: DomainContext,
  pending: PendingActionRow,
): Promise<string> {
  const breakdown = coerceBreakdown(pending.structured_payload ?? {});
  // Áudio com dois compromissos do mesmo assunto em datas diferentes: cada
  // item é um registo próprio — não se reaproveita o primeiro (Iolanda, 13/08).
  const { breakdownHasSeparateDates } = await import("./multi-date-turn");
  const separateDates = breakdownHasSeparateDates(breakdown.items as any[]);
  const created = { facts: 0, followUps: 0, notes: 0 };
  const records: { table: string; id: string }[] = [];
  const links = breakdown.links ?? [];
  for (const [index, item] of breakdown.items.entries()) {
    try {
      const out = await execItem({
        ...ctx,
        pendingActionId: pending.id,
        sameTurnSeparateDates: separateDates || ctx.sameTurnSeparateDates,
      } as DomainContext, item, links[index] ?? emptyPersonLink());
      if (!out) continue;
      if (out.record) records.push(out.record);
      if (out.kind === "fact") created.facts += 1;
      else if (out.kind === "follow_up") created.followUps += 1;
      else if (out.kind === "note") created.notes += 1;
    } catch { /* um item falhado não trava os restantes */ }
  }
  // Deixa o rasto do que foi criado: um "descartar" a seguir tem de conseguir
  // apagar exactamente estes registos.
  try {
    const { recordCreatedRecords } = await import("./discard.server");
    await recordCreatedRecords(ctx.supabase, pending.id, records);
  } catch { /* noop */ }
  const anything = created.facts + created.followUps + created.notes > 0;
  await markPendingActionStatus(ctx.supabase, pending.id, anything ? "executed" : "failed", {
    error_message: anything ? null : "audio_breakdown_no_items",
  });
  return formatBreakdownDone(created);
}