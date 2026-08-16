// Router semântico central do Assessor.
//
// Interpreta cada mensagem do consultor (com contexto compacto) e devolve
// uma decisão estruturada — intenção, domínio, referências, entidades e
// necessidade de confirmação/pesquisa. O motor determinístico (engine.server.ts)
// executa a partir daqui: pesquisa dados reais, valida datas, valida idempotência,
// escreve na base de dados, e só depois responde. Nunca é a IA a executar.
//
// A implementação usa o Lovable AI Gateway com output JSON (chat completions),
// seguindo o mesmo estilo do `transcribe.server.ts` — sem SDK adicional.
// Server-only.

const GATEWAY = "https://ai.gateway.lovable.dev/v1/chat/completions";

export const ROUTER_MODEL_DEFAULT = "google/gemini-3.6-flash";

// -------- Tipos públicos --------

export type ConversationAct =
  | "greeting"
  | "question"
  | "command"
  | "confirmation"
  | "rejection"
  | "correction"
  | "continuation"
  | "casual"
  | "unknown";

export type RouterIntent =
  | "create_event"
  | "create_follow_up"
  | "query_agenda"
  | "query_person"
  | "query_property"
  | "query_misc"
  | "create_property"
  | "update_property"
  | "record_interaction"
  | "classify_file"
  | "miscellaneous"
  | "smalltalk"
  | "none";

export type RouterDestination =
  | "agenda"
  | "follow_ups"
  | "people"
  | "properties"
  | "interactions"
  | "files"
  | "financial"
  | "miscellaneous"
  | "none";

export type ReplyIntent =
  | "ask"
  | "confirm"
  | "answer"
  | "acknowledge"
  | "execute"
  | "none";

export interface RouterReferences {
  person: string | null;
  property: string | null;
  file: string | null;
  previous_action: string | null;
}

export interface RouterEntities {
  event_type?: string | null;
  title?: string | null;
  person_name?: string | null;
  person_title?: string | null;
  property_reference?: string | null;
  property_type?: string | null;
  property_value?: number | null;
  location?: string | null;
  date?: string | null;
  start_time?: string | null;
  duration_minutes?: number | null;
  reminder_minutes?: number | null;
  notes?: string | null;
  period?: "today" | "tomorrow" | "week" | "next_week" | "range" | "past" | null;
  [k: string]: unknown;
}

export interface RouterDecision {
  conversation_act: ConversationAct;
  intent: RouterIntent;
  destination: RouterDestination;
  is_new_topic: boolean;
  is_continuation: boolean;
  is_correction: boolean;
  requires_database_lookup: boolean;
  requires_confirmation: boolean;
  should_persist: boolean;
  confidence: number;
  references: RouterReferences;
  entities: RouterEntities;
  missing_fields: string[];
  reply_intent: ReplyIntent;
  reply?: string | null;
}

export interface RouterInputMessage {
  role: "user" | "assessor";
  content: string;
}

export interface RouterInput {
  content: string;
  now: Date;
  timezone?: string;
  userName?: string | null;
  assessorName?: string | null;
  recent?: RouterInputMessage[];
  pendingAction?: {
    intent: string;
    entities: Record<string, unknown>;
    current_question?: string | null;
    pending_question?: string | null;
  } | null;
  activeEntity?: {
    type: "property" | "person" | "file" | null;
    id?: string | null;
    label?: string | null;
  } | null;
  factualSummary?: string | null;
}

export interface RouterTelemetry {
  model: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  latencyMs: number;
}

export interface RouterResult {
  ok: boolean;
  decision?: RouterDecision;
  error?: string;
  telemetry: RouterTelemetry;
}

// -------- Prompt --------

function buildSystemPrompt(input: RouterInput): string {
  const tz = input.timezone || "Europe/Lisbon";
  const nowStr = input.now.toLocaleString("pt-PT", { timeZone: tz });
  const assessorName = input.assessorName || "Afonso";
  const userName = input.userName || "consultor";
  return [
    `És o "${assessorName}", o assessor pessoal digital de um consultor imobiliário chamado ${userName}. Falas português europeu.`,
    `Não és um formulário nem um CRM. O consultor fala contigo em linguagem natural, muitas vezes por WhatsApp. A tua tarefa é COMPREENDER a mensagem no contexto e devolver JSON estruturado. Nunca escrevas texto fora do JSON.`,
    `Agora: ${nowStr} (${tz}). Semana começa à segunda-feira.`,
    ``,
    `DOMÍNIO IMOBILIÁRIO — compreende naturalmente: angariação, proprietário, comprador, visita, reunião de angariação, CPU, CRP, caderneta predial, certificado energético, escritura, reserva, proposta, comissão, partilha, imóvel activo, imóvel em angariação, seguimento, visita de avaliação, tipologias (T0..T6, V3, V4).`,
    ``,
    `REGRAS DE INTERPRETAÇÃO:`,
    `1. "conversation_act" descreve o ATO conversacional: greeting, question, command, confirmation ("sim/ok" quando há pending), rejection ("não/esquece/cancela"), correction ("afinal", "não é X, é Y", "mas é amanhã"), continuation, casual, unknown.`,
    `2. "intent" e "destination" identificam O QUE FAZER e ONDE guardar. Nunca inventes intent — usa "none" quando não fores capaz de justificar.`,
    `3. "requires_database_lookup" = true quando a resposta natural depende de consultar dados reais (agenda, pessoa, imóvel, ficheiro). O backend fará a pesquisa; NUNCA inventes dados.`,
    `4. "requires_confirmation" = true quando vais CRIAR/ALTERAR/ELIMINAR algo. O backend cria uma acção pendente e o utilizador confirma.`,
    `5. "should_persist" = true apenas quando há conteúdo profissional útil para guardar. Nunca guardes saudações ou desabafos sem valor.`,
    `6. "references" resolve alusões: "esse imóvel"→property (label da entidade activa), "o dono"→person (proprietário do imóvel activo), "a outra"→previous_action. Se não conseguires resolver, deixa null e acrescenta o nome do campo em "missing_fields".`,
    `7. "entities" contém APENAS o que aparece na mensagem (ou é resolvido pelo contexto imediato). Nunca copies valores da acção pendente. Para agenda preenche "period" (today/tomorrow/week/next_week/range/past).`,
    `8. Datas: nunca escrevas "amanhã" no campo date — usa YYYY-MM-DD só quando conseguires calcular. Caso contrário deixa date=null e o backend resolve a partir do texto.`,
    `9. "confidence" ∈ [0,1]. < 0.5 = pouco certo.`,
    `10. "reply_intent": ask, confirm, answer, acknowledge, execute, none.`,
    `11. "reply" OPCIONAL. Para respostas conversacionais curtas (greeting/thanks/casual sem ação) podes devolver 1 frase curta em PT-PT. Para tudo o que envolva dados reais deixa reply="" — o backend responde com base na BD.`,
    ``,
    `EXEMPLOS:`,
    `- "Que agendamentos tenho esta semana?" → intent=query_agenda, destination=agenda, requires_database_lookup=true, entities.period="week", reply="".`,
    `- "E amanhã?" (depois de agenda) → intent=query_agenda, is_continuation=true, entities.period="tomorrow".`,
    `- "Lembra-me de ligar ao dono desse imóvel amanhã às 12h" → intent=create_follow_up, references.property="<activeEntity>", references.person="proprietário", requires_confirmation=true.`,
    `- "Tenho outra visita" → intent=create_event, is_new_topic=true, missing_fields=["date","start_time"], reply_intent=ask.`,
    `- "É sobre o imóvel de Canelas" → conversation_act=continuation, references.property="Canelas".`,
    `- "Afinal é às 15h" → conversation_act=correction, is_correction=true, entities.start_time="15:00".`,
    `- "O documento é a CPU da Moradia Boavista" → intent=classify_file, references.file="documento", entities.property_reference="Moradia Boavista".`,
    `- "O que sabes do Paulo?" → intent=query_person, entities.person_name="Paulo".`,
    `- "Guarda isto para eu ver depois" → intent=miscellaneous, should_persist=true.`,
    `- "Hoje foi um dia difícil." → conversation_act=casual, intent=smalltalk, should_persist=false, reply="Estou aqui."`,
    `- "Olá" → conversation_act=greeting, intent=smalltalk, reply="Olá."`,
    `- "Obrigado" / "Ok" (sem pending) → conversation_act=casual, intent=smalltalk, should_persist=false.`,
    ``,
    `Devolve APENAS o objecto JSON, sem texto adicional, sem markdown.`,
  ].join("\n");
}

function buildUserPrompt(input: RouterInput): string {
  const parts: string[] = [];
  if (input.factualSummary) parts.push(`Resumo factual: ${input.factualSummary}`);
  if (input.activeEntity && input.activeEntity.type) {
    parts.push(
      `Entidade activa: ${input.activeEntity.type}${
        input.activeEntity.label ? ` (${input.activeEntity.label})` : ""
      }${input.activeEntity.id ? ` id=${input.activeEntity.id}` : ""}`,
    );
  }
  if (input.pendingAction) {
    const p = input.pendingAction;
    parts.push(
      `Acção pendente: intent=${p.intent}${p.current_question ? ` a aguardar=${p.current_question}` : ""}${
        p.pending_question ? ` pergunta="${p.pending_question}"` : ""
      }`,
    );
  }
  const recent = (input.recent ?? []).slice(-6);
  if (recent.length) {
    parts.push("Últimas mensagens:");
    for (const m of recent) {
      parts.push(`- ${m.role === "user" ? "Consultor" : "Assessor"}: ${m.content}`);
    }
  }
  parts.push(`Mensagem actual: ${input.content}`);
  parts.push(`Devolve o JSON.`);
  return parts.join("\n");
}

// -------- Normalização defensiva --------

export function coerceDecision(raw: unknown): RouterDecision {
  const d = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const entities = (d.entities && typeof d.entities === "object" ? d.entities : {}) as RouterEntities;
  const rref = (d.references && typeof d.references === "object" ? d.references : {}) as Partial<RouterReferences>;
  return {
    conversation_act: (d.conversation_act as ConversationAct) ?? "unknown",
    intent: (d.intent as RouterIntent) ?? "none",
    destination: (d.destination as RouterDestination) ?? "none",
    is_new_topic: Boolean(d.is_new_topic),
    is_continuation: Boolean(d.is_continuation),
    is_correction: Boolean(d.is_correction),
    requires_database_lookup: Boolean(d.requires_database_lookup),
    requires_confirmation: Boolean(d.requires_confirmation),
    should_persist: Boolean(d.should_persist),
    confidence: typeof d.confidence === "number" ? d.confidence : 0,
    references: {
      person: rref.person ?? null,
      property: rref.property ?? null,
      file: rref.file ?? null,
      previous_action: rref.previous_action ?? null,
    },
    entities,
    missing_fields: Array.isArray(d.missing_fields) ? d.missing_fields.map(String) : [],
    reply_intent: (d.reply_intent as ReplyIntent) ?? "none",
    reply: typeof d.reply === "string" ? (d.reply as string) : null,
  };
}

function extractJsonString(payload: any): string | null {
  const choice = payload?.choices?.[0];
  const content = choice?.message?.content;
  if (typeof content === "string" && content.trim()) return content;
  return null;
}

/**
 * Tenta ler o JSON do router mesmo quando a resposta vem cortada.
 * A causa mais comum de "invalid json from router" é o modelo atingir o
 * limite de tokens a meio do objeto: nesse caso fechamos os parêntesis em
 * falta em vez de deitar fora a interpretação toda.
 */
export function parseRouterJson(raw: string): unknown | null {
  const attempt = (s: string): unknown | null => {
    try { return JSON.parse(s); } catch { return null; }
  };
  const direct = attempt(raw);
  if (direct) return direct;

  const start = raw.indexOf("{");
  if (start < 0) return null;
  const body = raw.slice(start);

  const braced = body.match(/\{[\s\S]*\}/);
  if (braced) {
    const parsed = attempt(braced[0]);
    if (parsed) return parsed;
  }

  // Reparação de truncatura: fecha string aberta e parêntesis em falta.
  let inString = false;
  let escaped = false;
  const stack: string[] = [];
  for (const ch of body) {
    if (escaped) { escaped = false; continue; }
    if (ch === "\\") { escaped = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (ch === "{" || ch === "[") stack.push(ch);
    else if (ch === "}" || ch === "]") stack.pop();
  }
  let repaired = body;
  if (inString) repaired += '"';
  repaired = repaired.replace(/,\s*$/, "").replace(/:\s*$/, ": null");
  while (stack.length) repaired += stack.pop() === "[" ? "]" : "}";
  return attempt(repaired);
}

// -------- Chamada --------

export async function interpretAssessorMessage(input: RouterInput): Promise<RouterResult> {
  const started = Date.now();
  const model = ROUTER_MODEL_DEFAULT;
  const emptyTelemetry: RouterTelemetry = {
    model,
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
    latencyMs: 0,
  };
  const key = process.env.LOVABLE_API_KEY;
  if (!key) {
    return { ok: false, error: "LOVABLE_API_KEY missing", telemetry: emptyTelemetry };
  }

  const buildBody = (maxTokens: number) => ({
    model,
    messages: [
      { role: "system", content: buildSystemPrompt(input) },
      { role: "user", content: buildUserPrompt(input) },
    ],
    response_format: { type: "json_object" },
    max_tokens: maxTokens,
    temperature: 0.1,
  });

  // Duas tentativas no máximo: a segunda com mais espaço de resposta, porque
  // a falha típica é o JSON vir cortado a meio.
  const budgets = [900, 1500];
  let lastError = "invalid json from router";
  let lastTelemetry: RouterTelemetry = emptyTelemetry;

  for (const budget of budgets) {
    try {
      const attemptStart = Date.now();
      const res = await fetch(GATEWAY, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Lovable-API-Key": key },
        body: JSON.stringify(buildBody(budget)),
        // Tecto de tempo: uma chamada que não volta não pode prender o turno.
        signal: AbortSignal.timeout(30_000),
      });
      const latencyMs = Date.now() - attemptStart;
      const payload: any = await res.json().catch(() => ({}));
      const inputTokens = Number(payload?.usage?.prompt_tokens ?? 0);
      const outputTokens = Number(payload?.usage?.completion_tokens ?? 0);
      const totalTokens = Number(payload?.usage?.total_tokens ?? inputTokens + outputTokens);
      const telemetry: RouterTelemetry = { model, inputTokens, outputTokens, totalTokens, latencyMs };
      lastTelemetry = telemetry;

      if (!res.ok) {
        lastError = payload?.error?.message || `HTTP ${res.status}`;
        // 429/5xx podem passar numa segunda tentativa; o resto não.
        if (res.status === 429 || res.status >= 500) continue;
        return { ok: false, error: lastError, telemetry };
      }

      const raw = extractJsonString(payload);
      if (!raw) { lastError = "empty router response"; continue; }

      const parsed = parseRouterJson(raw);
      if (parsed) return { ok: true, decision: coerceDecision(parsed), telemetry };
      lastError = "invalid json from router";
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
      lastTelemetry = { ...emptyTelemetry, latencyMs: Date.now() - started };
    }
  }

  return { ok: false, error: lastError, telemetry: lastTelemetry };
}

// Índice de confiança mínima para não pedir esclarecimento adicional.
export const ROUTER_MIN_CONFIDENCE = 0.55;
