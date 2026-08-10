// Segmentação de áudio em temas — parte com IA e base de dados.
//
// Regra da casa: a IA só interpreta. Quem escreve são os Domain Services, e
// só depois do consultor confirmar a proposta. Aqui acrescenta-se o que
// faltava: um áudio pode conter VÁRIOS temas, e uma lead nunca é um registo
// solto — é Pessoa → Imóvel → Oportunidade ligados por chave estrangeira.

import { callGateway, V2_MODEL_DEFAULT } from "../v2/gateway.server";
import { TOOL_REGISTRY, type DomainContext } from "../v2/domain.server";
import { createPendingAction, markPendingActionStatus, type PendingActionRow } from "../memory.server";
import { looksConfidential } from "../culture/confidential";
import { foldLike, foldText } from "@/lib/search/normalize";
import {
  AMBIGUITY_THRESHOLD,
  coerceThemes,
  emptyLinks,
  formatThemesDone,
  formatThemesProposal,
  isLeadTheme,
  type AudioTheme,
  type AudioThemesPayload,
  type ThemeCandidate,
  type ThemeLinks,
  type ThemeWriteResult,
} from "./audio-themes";

export const AUDIO_THEMES_INTENT = "audio_themes";

export function todayLisbonYmd(): string {
  const p = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Lisbon", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date());
  const m: Record<string, string> = {};
  for (const x of p) m[x.type] = x.value;
  return `${m.year}-${m.month}-${m.day}`;
}

const SYSTEM = `És o motor de leitura de notas de voz de um consultor imobiliário português.
Recebes a transcrição de um áudio informal. Separa-o nos TEMAS independentes que contém.

Um tema = um conjunto coerente de entidades + uma intenção. Temas sem relação entre si ficam separados.

Devolve APENAS JSON válido:
{"themes":[{
 "kind":"lead|deal_update|task|note|visit|follow_up",
 "title":"frase curta em PT-PT",
 "person":{"name":"ou null","phone":"ou null","role":"proprietario|comprador|referencia|outro|null"},
 "property":{"typology":"T3 ou null","location":"zona ou null","address":"ou null","features":"ou null","price":null},
 "opportunity":{"intent":"vender|comprar|arrendar|avaliar|null","motivation":"ou null","urgency":"alta|media|baixa|null","deadline":"YYYY-MM-DD ou null"},
 "next_action":{"type":"ligar|visitar|enviar|outro","text":"...","date":"YYYY-MM-DD ou null","time":"HH:MM ou null"},
 "note":"ou null","confidential":true|false,"confidence":0.0
}]}

Regras:
- Hoje é {{TODAY}} (Europa/Lisboa). Converte "quarta", "amanhã" em datas absolutas.
- "quer vender/comprar/arrendar" é sempre kind="lead" com person + property + opportunity preenchidos.
- Um lembrete solto ("marca-me lembrete para ligar à Dra. Maria") é kind="task" com next_action e, quando muito, person.
- Não inventes nada. Campos ausentes ficam null. Máximo 6 temas.
- confidential=true quando é opinião crua, fragilidade do cliente, ou o consultor diz "isto é só para mim".
- confidence entre 0 e 1: quão certo estás da extração deste tema.`;

export async function analyseAudioThemes(transcript: string): Promise<AudioTheme[]> {
  const res = await callGateway({
    model: V2_MODEL_DEFAULT,
    temperature: 0.1,
    responseFormat: { type: "json_object" },
    messages: [
      { role: "system", content: SYSTEM.replace("{{TODAY}}", todayLisbonYmd()) },
      { role: "user", content: String(transcript ?? "").slice(0, 8000) },
    ],
  });
  const raw = res.ok ? String(res.message?.content ?? "") : "";
  if (!raw) return [];
  let parsed: any = null;
  try { parsed = JSON.parse(raw); } catch {
    const m = raw.match(/\{[\s\S]*\}/);
    if (m) { try { parsed = JSON.parse(m[0]); } catch { /* noop */ } }
  }
  if (!parsed) return [];
  const themes = coerceThemes(parsed);
  if (looksConfidential(transcript)) {
    for (const t of themes) if (t.note) t.confidential = true;
  }
  return themes;
}

// ---- Deduplicação ----------------------------------------------------------

function phoneTail(input: string | null | undefined): string | null {
  const digits = String(input ?? "").replace(/\D+/g, "");
  return digits.length >= 9 ? digits.slice(-9) : digits.length >= 6 ? digits : null;
}

function nameScore(query: string, candidate: string): number {
  const a = foldText(query);
  const b = foldText(candidate);
  if (!a || !b) return 0;
  if (a === b) return 0.95;
  if (b.startsWith(a) || a.startsWith(b)) return 0.85;
  if (b.includes(a) || a.includes(b)) return 0.7;
  const at = new Set(a.split(" ").filter(Boolean));
  const bt = b.split(" ").filter(Boolean);
  const hits = bt.filter((t) => at.has(t)).length;
  return hits ? Math.min(0.75, 0.45 + hits * 0.15) : 0;
}

/** Melhor candidato só quando é claramente melhor; caso contrário, pergunta-se. */
function pick(cands: ThemeCandidate[]): { match: ThemeCandidate | null; ambiguous: ThemeCandidate[] } {
  const sorted = [...cands].sort((a, b) => b.score - a.score);
  const best = sorted[0];
  if (!best) return { match: null, ambiguous: [] };
  const second = sorted[1];
  const tooClose = second && best.score - second.score < 0.15;
  if (best.score >= AMBIGUITY_THRESHOLD && !tooClose) return { match: best, ambiguous: [] };
  const plausible = sorted.filter((c) => c.score >= 0.5).slice(0, 3);
  if (plausible.length > 1) return { match: null, ambiguous: plausible };
  return { match: null, ambiguous: [] };
}

async function findPeopleCandidates(ctx: DomainContext, theme: AudioTheme): Promise<ThemeCandidate[]> {
  const name = theme.person?.name ?? "";
  const tail = phoneTail(theme.person?.phone);
  const out = new Map<string, ThemeCandidate>();

  if (tail) {
    const { data } = await ctx.supabase
      .from("people").select("id, name, phone")
      .eq("user_id", ctx.userId).is("archived_at", null)
      .ilike("phone", `%${tail}%`).limit(5);
    for (const r of ((data as any[]) ?? [])) out.set(r.id, { id: r.id, label: r.name, score: 1 });
  }
  if (name.trim().length >= 2) {
    const { data } = await ctx.supabase
      .from("people").select("id, name")
      .eq("user_id", ctx.userId).is("archived_at", null)
      .ilike("name_norm", `%${foldLike(name.split(" ")[0] ?? name)}%`)
      .order("updated_at", { ascending: false }).limit(8);
    for (const r of ((data as any[]) ?? [])) {
      const score = nameScore(name, r.name);
      const prev = out.get(r.id);
      if (!prev || prev.score < score) out.set(r.id, { id: r.id, label: r.name, score: Math.max(prev?.score ?? 0, score) });
    }
  }
  return [...out.values()].filter((c) => c.score > 0);
}

async function findPropertyCandidates(ctx: DomainContext, theme: AudioTheme): Promise<ThemeCandidate[]> {
  const p = theme.property;
  const zone = p?.location ?? p?.address ?? null;
  if (!zone) return [];
  const { data } = await ctx.supabase
    .from("properties").select("id, title, typology, location, address")
    .eq("user_id", ctx.userId).is("archived_at", null)
    .ilike("search_norm", `%${foldLike(zone)}%`)
    .order("updated_at", { ascending: false }).limit(8);
  const out: ThemeCandidate[] = [];
  for (const r of ((data as any[]) ?? [])) {
    let score = 0.6; // zona bate
    if (p?.typology && foldText(r.typology) === foldText(p.typology)) score = 0.9;
    else if (p?.typology && r.typology) score = 0.4;
    out.push({ id: r.id, label: r.title, score });
  }
  return out;
}

/** A placa já registada é a âncora: uma lead nova sobre a mesma placa não abre negócio novo. */
async function findProspectingLead(ctx: DomainContext, theme: AudioTheme): Promise<any | null> {
  const tail = phoneTail(theme.person?.phone);
  const zone = theme.property?.location ?? theme.property?.address ?? null;
  const base = () => ctx.supabase
    .from("prospecting_leads")
    .select("id, title, phone, location, typology, related_property_id, related_person_id, status")
    .eq("user_id", ctx.userId)
    .not("status", "in", "(archived,no_interest)")
    .order("created_at", { ascending: false })
    .limit(5);
  if (tail) {
    const { data } = await base().ilike("phone", `%${tail}%`);
    const hit = ((data as any[]) ?? [])[0];
    if (hit) return hit;
  }
  if (zone) {
    const { data } = await base().ilike("search_norm", `%${foldLike(zone)}%`);
    const list = ((data as any[]) ?? []).filter((r) =>
      !theme.property?.typology || !r.typology || foldText(r.typology) === foldText(theme.property.typology));
    if (list.length === 1) return list[0];
  }
  return null;
}

async function findOpportunity(
  ctx: DomainContext,
  opts: { propertyId?: string | null; personId?: string | null },
): Promise<{ id: string; title: string } | null> {
  if (!opts.propertyId && !opts.personId) return null;
  let q = ctx.supabase
    .from("opportunities").select("id, title, stage, property_id, person_id")
    .eq("user_id", ctx.userId).is("archived_at", null)
    .neq("stage", "concluido")
    .order("updated_at", { ascending: false }).limit(1);
  if (opts.propertyId) q = q.eq("property_id", opts.propertyId);
  else if (opts.personId) q = q.eq("person_id", opts.personId);
  const { data } = await q;
  const hit = ((data as any[]) ?? [])[0];
  return hit ? { id: hit.id, title: hit.title ?? "negócio" } : null;
}

/** Procura, para cada tema, o que já existe. Nunca escreve nada. */
export async function resolveThemeLinks(ctx: DomainContext, themes: AudioTheme[]): Promise<ThemeLinks[]> {
  const out: ThemeLinks[] = [];
  for (const theme of themes) {
    const links = emptyLinks();
    try {
      if (theme.person?.name || theme.person?.phone) {
        const { match, ambiguous } = pick(await findPeopleCandidates(ctx, theme));
        if (match) { links.person_id = match.id; links.person_label = match.label; }
        links.ambiguous_people = ambiguous;
      }
      if (theme.property) {
        const { match, ambiguous } = pick(await findPropertyCandidates(ctx, theme));
        if (match) { links.property_id = match.id; links.property_label = match.label; }
        links.ambiguous_properties = ambiguous;
      }
      const lead = await findProspectingLead(ctx, theme);
      if (lead) {
        links.lead_id = lead.id;
        links.lead_label = lead.title ?? "placa";
        if (!links.property_id && lead.related_property_id) {
          links.property_id = lead.related_property_id;
          links.property_label = links.property_label ?? lead.title ?? null;
        }
        if (!links.person_id && lead.related_person_id) links.person_id = lead.related_person_id;
      }
      const opp = await findOpportunity(ctx, { propertyId: links.property_id, personId: links.person_id });
      if (opp) { links.opportunity_id = opp.id; links.opportunity_label = opp.title; }
    } catch { /* um tema sem ligações continua a ser proposto */ }
    out.push(links);
  }
  return out;
}

// ---- Proposta --------------------------------------------------------------

export async function proposeAudioThemes(
  ctx: DomainContext,
  transcript: string,
  themes: AudioTheme[],
  links: ThemeLinks[],
  audioFileId?: string | null,
): Promise<string> {
  const payload: AudioThemesPayload = {
    themes,
    links,
    audio_file_id: audioFileId ?? null,
    source_message_id: ctx.sourceMessageId ?? null,
    extracted_at: new Date().toISOString(),
  };
  await createPendingAction(ctx.supabase, {
    userId: ctx.userId,
    channel: ctx.channel,
    intent: AUDIO_THEMES_INTENT,
    originalContent: String(transcript ?? "").slice(0, 4000),
    payload: payload as unknown as Record<string, any>,
    confidence: themes.length ? themes.reduce((a, t) => a + t.confidence, 0) / themes.length : 0.6,
    sourceMessageId: ctx.sourceMessageId ?? null,
  });
  return formatThemesProposal(themes, links);
}

export function readThemesPayload(raw: unknown): AudioThemesPayload {
  const p = (raw ?? {}) as any;
  const themes = coerceThemes({ themes: p.themes });
  const links = Array.isArray(p.links)
    ? themes.map((_, i) => ({ ...emptyLinks(), ...(p.links[i] ?? {}) }))
    : themes.map(() => emptyLinks());
  return {
    themes,
    links,
    audio_file_id: p.audio_file_id ?? null,
    source_message_id: p.source_message_id ?? null,
    extracted_at: p.extracted_at ?? null,
  };
}

// ---- Execução (só depois do "sim") ----------------------------------------

const ROLE_TO_RELATIONSHIP: Record<string, string> = {
  proprietario: "proprietario",
  comprador: "comprador",
  referencia: "referencia",
  outro: "outro",
};

function propertyTitle(theme: AudioTheme): string {
  const p = theme.property;
  const bits = [p?.typology, p?.location ? `em ${p.location}` : p?.address].filter(Boolean);
  return (bits.join(" ") || theme.title).slice(0, 200);
}

function dealTitle(theme: AudioTheme): string {
  const intent = theme.opportunity?.intent ?? "vender";
  const who = theme.person?.name ? ` — ${theme.person.name}` : "";
  const verb = intent === "vender" ? "Venda" : intent === "comprar" ? "Compra" : intent === "arrendar" ? "Arrendamento" : "Avaliação";
  return `${verb} ${propertyTitle(theme)}${who}`.slice(0, 200);
}

async function execTheme(
  ctx: DomainContext,
  theme: AudioTheme,
  links: ThemeLinks,
  source: { audioFileId: string | null; extractedAt: string },
  records: { table: string; id: string }[],
): Promise<ThemeWriteResult> {
  const result: ThemeWriteResult = {};

  // 1) Pessoa — liga ao existente ou cria.
  let personId = links.person_id;
  if (!personId && theme.person?.name) {
    const res = await TOOL_REGISTRY.create_person(ctx, {
      name: theme.person.name,
      phone: theme.person.phone ?? null,
      relationship_type: ROLE_TO_RELATIONSHIP[theme.person.role ?? "outro"] ?? "potencial_cliente",
      summary: theme.opportunity?.motivation ?? null,
    });
    if (res.ok) {
      personId = String((res.data as any)?.person?.id ?? "") || null;
      if (personId) { records.push({ table: "people", id: personId }); result.personCreated = true; }
    }
  }
  if (personId) result.personName = theme.person?.name ?? links.person_label ?? null;

  // 2) Imóvel — liga ao existente ou cria, já com o proprietário.
  let propertyId = links.property_id;
  if (!propertyId && theme.property && isLeadTheme(theme)) {
    const res = await TOOL_REGISTRY.create_property(ctx, {
      title: propertyTitle(theme),
      typology: theme.property.typology ?? null,
      location: theme.property.location ?? theme.property.address ?? null,
      owner_person_id: theme.person?.role === "comprador" ? null : personId,
      asking_price: theme.property.price ?? null,
      status: "por_angariar",
    });
    if (res.ok) {
      propertyId = String((res.data as any)?.property?.id ?? "") || null;
      if (propertyId) { records.push({ table: "properties", id: propertyId }); result.propertyCreated = true; }
    }
  } else if (propertyId && personId && theme.person?.role !== "comprador") {
    // Imóvel que já existia (placa) ganha o proprietário agora identificado.
    try {
      await ctx.supabase.from("properties")
        .update({ owner_person_id: personId } as never)
        .eq("id", propertyId).eq("user_id", ctx.userId).is("owner_person_id", null);
    } catch { /* noop */ }
  }
  if (propertyId) result.propertyTitle = links.property_label ?? propertyTitle(theme);

  // 3) Oportunidade — referencia pessoa E imóvel. Nunca duplica a da placa.
  let opportunityId = links.opportunity_id;
  if (opportunityId) {
    result.opportunityTitle = links.opportunity_label;
    result.opportunityLinked = true;
    try {
      const patch: Record<string, unknown> = {};
      if (personId) patch.person_id = personId;
      if (propertyId) patch.property_id = propertyId;
      if (theme.opportunity?.motivation) patch.notes = theme.opportunity.motivation;
      if (Object.keys(patch).length) {
        await ctx.supabase.from("opportunities").update(patch as never)
          .eq("id", opportunityId).eq("user_id", ctx.userId);
      }
    } catch { /* noop */ }
  } else if (isLeadTheme(theme) && theme.opportunity?.intent) {
    const notes = [
      theme.opportunity.motivation ? `Motivação: ${theme.opportunity.motivation}` : null,
      theme.opportunity.urgency ? `Urgência: ${theme.opportunity.urgency}` : null,
      `Origem: áudio${source.audioFileId ? ` (${source.audioFileId})` : ""} · confiança ${theme.confidence.toFixed(2)} · ${source.extractedAt}`,
    ].filter(Boolean).join(" · ");
    const res = await TOOL_REGISTRY.create_deal(ctx, {
      title: dealTitle(theme),
      kind: theme.opportunity.intent === "comprar" ? "compra" : "venda",
      person_id: personId,
      property_id: propertyId,
      value: theme.property?.price ?? 0,
      notes,
    });
    if (res.ok) {
      opportunityId = String((res.data as any)?.id ?? "") || null;
      if (opportunityId) {
        records.push({ table: "opportunities", id: opportunityId });
        result.opportunityTitle = String((res.data as any)?.title ?? dealTitle(theme));
        result.opportunityCreated = (res.data as any)?.duplicate !== true;
      }
    }
  }

  // A placa passa a "opportunity" e fica ligada ao que acabou de nascer.
  if (links.lead_id) {
    try {
      await ctx.supabase.from("prospecting_leads").update({
        status: "opportunity",
        related_person_id: personId ?? null,
        related_property_id: propertyId ?? null,
        contact_name: theme.person?.name ?? null,
      } as never).eq("id", links.lead_id).eq("user_id", ctx.userId);
    } catch { /* noop */ }
  }

  // 4) Próxima acção — liga à oportunidade/pessoa; sozinha fica standalone.
  if (theme.next_action) {
    const res = await TOOL_REGISTRY.create_follow_up(ctx, {
      title: theme.next_action.text,
      type: theme.next_action.type === "visitar" ? "visita" : "tarefa",
      due_date: theme.next_action.date ?? theme.opportunity?.deadline ?? todayLisbonYmd(),
      due_time: theme.next_action.time ?? null,
      priority: theme.opportunity?.urgency === "alta" ? "alta" : "media",
      person_id: personId,
      property_id: propertyId,
      opportunity_id: opportunityId,
    });
    if (res.ok) {
      const id = (res.data as any)?.follow_up?.id ?? null;
      if (id) records.push({ table: "follow_ups", id: String(id) });
      result.followUpTitle = theme.next_action.text;
    }
  }

  // 5) Nota / facto — no histórico, com a marca de confidencial.
  if (theme.note || theme.kind === "note") {
    const res = await TOOL_REGISTRY.save_interaction(ctx, {
      summary: theme.note ?? theme.title,
      person_id: personId,
      property_id: propertyId,
      interaction_type: theme.confidential ? "nota" : "facto",
      is_confidential: theme.confidential === true,
    });
    if (res.ok) {
      const id = (res.data as any)?.interaction?.id ?? null;
      if (id) records.push({ table: "interactions", id: String(id) });
      result.noteSaved = true;
    }
  }

  return result;
}

export async function executeAudioThemes(
  ctx: DomainContext,
  pending: PendingActionRow,
): Promise<string> {
  const payload = readThemesPayload(pending.structured_payload ?? {});
  const records: { table: string; id: string }[] = [];
  const results: ThemeWriteResult[] = [];
  const source = {
    audioFileId: payload.audio_file_id ?? null,
    extractedAt: payload.extracted_at ?? new Date().toISOString(),
  };
  for (let i = 0; i < payload.themes.length; i += 1) {
    try {
      const out = await execTheme(
        { ...ctx, pendingActionId: pending.id } as DomainContext,
        payload.themes[i],
        payload.links[i] ?? emptyLinks(),
        source,
        records,
      );
      results.push(out);
    } catch { /* um tema falhado não trava os restantes */ }
  }
  try {
    const { recordCreatedRecords } = await import("./discard.server");
    await recordCreatedRecords(ctx.supabase, pending.id, records);
  } catch { /* noop */ }
  const anything = records.length > 0;
  await markPendingActionStatus(ctx.supabase, pending.id, anything ? "executed" : "failed", {
    error_message: anything ? null : "audio_themes_no_records",
  });
  return formatThemesDone(results);
}
