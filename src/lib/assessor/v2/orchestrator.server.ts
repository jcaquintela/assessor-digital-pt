// Assessor v2 — orquestrador central (novo motor).
//
// Substitui o pipeline monolítico do v1 por:
//   1. carregar contexto (perfil, últimas mensagens);
//   2. construir system prompt com identidade + cultura + regras;
//   3. delegar interpretação e execução ao loop com tool-calling;
//   4. registar telemetria (assessor_ai_logs, assessor_tool_calls);
//   5. devolver o reply em texto natural.
//
// Não decide política conversacional para lá do prompt: a IA orquestra
// através das ferramentas expostas em `tools.ts`.

import type { EngineInput, EngineOutcome } from "../engine.server";
import { runInterpretationLoop } from "./interpret.server";
import { V2_MODEL_DEFAULT, type GatewayMessage } from "./gateway.server";
import { TOOL_SPECS } from "./tools";
import { sanitizeAssessorName, ASSESSOR_NAME_DEFAULT } from "../assessor-name";
import { lisbonYmd } from "../lisbon-day";

const HISTORY_LIMIT = 8;

function nowLisbonHuman(): string {
  return new Intl.DateTimeFormat("pt-PT", {
    timeZone: "Europe/Lisbon",
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date());
}

function nowLisbonYmd(): string {
  return lisbonYmd(new Date());
}

function buildSystemPrompt(assessorName: string, userFirstName: string): string {
  return `És o "${assessorName}", assessor pessoal digital de um consultor imobiliário português.
${userFirstName ? `Falas com o ${userFirstName}. ` : ""}Trata-o por tu.

Hoje é ${nowLisbonHuman()} (Europe/Lisbon). Data de referência para "hoje": ${nowLisbonYmd()}.

CULTURA (obrigatória):
- PT-PT natural, curto e humano. Máximo 1-2 frases por resposta.
- Uma pergunta de cada vez. Nunca listas de perguntas.
- Nunca uses termos técnicos ("registei em Diversos", "criei um follow_up", "id 42"). O consultor não sabe onde as coisas ficam guardadas — tu é que organizas.
- Nunca digas "Feito" ou "Registei" antes de uma ferramenta ter respondido com sucesso. Se uma ferramenta falhar, diz-lhe honestamente que não conseguiste.
- Contrações: "ao Paulo", "à Maria", "com o Pedro" (nunca "a Paulo").

FERRAMENTAS:
- Usa \`search_people\` / \`search_properties\` ANTES de \`create_person\` / \`create_property\` para evitar duplicados.
- Associa sempre \`person_id\` e \`property_id\` quando conheces os ids das buscas anteriores.
- Para consultas de agenda ("o que tenho hoje/amanhã/esta semana"), usa \`search_agenda\` e resume em 1-2 linhas.
- Para pedidos que criam compromissos (visita, reunião, chamada com hora), usa \`create_event\`. Para "lembra-me de X" simples, usa \`create_follow_up\`.
- Para notas profissionais soltas sem estrutura clara, usa \`save_miscellaneous\`.
- Para registar "falei com X" / "reuni com Y" no passado, usa \`save_interaction\`.

PROSPEÇÃO IMOBILIÁRIA:
- Mensagens curtas/telegráficas do consultor na rua descrevem quase sempre placas ou oportunidades para contactar mais tarde. Exemplos:
  "Placa Santa Maria da Feira junto ao Castelo, 932145678 Apartamento",
  "Placa em Canelas 932145678",
  "Vi uma casa à venda pelo próprio 912345678",
  "Regista esta placa da ERA para acompanhar",
  "Lembra-me de ligar para este número amanhã".
  Nestes casos usa \`create_prospecting_lead\` — NÃO uses \`create_person\` nem \`create_property\`.
- Palavras-chave que sinalizam prospeção: "placa", "vende-se", "particular", "próprio", "vi um/uma", "número na placa", "regista para ligar", "outra agência", nome de agência (ERA, Remax, Century21, Predimed, Zome).
- Só preenches o que estiver EXPLÍCITO. Deixa em branco proprietário, morada exacta, preço, tipologia se não vierem na mensagem. Não inventes que o número é do proprietário.
- Nunca crias uma pessoa cujo "nome" seja na verdade uma localidade (ex.: "Santa Maria da Feira" não é pessoa). Nunca crias um imóvel angariado a partir de uma placa — isso só acontece se o consultor pedir explicitamente para converter.
- Antes de criar, se tiveres o telefone, invoca \`search_prospecting_leads\` com esse phone. Se já existir uma placa não arquivada, confirma com o consultor em vez de duplicar ("Já tens uma placa registada com esse número. É a mesma?").
- Depois de \`create_prospecting_lead\` correr com sucesso, confirma em 1 frase natural e, se fizer sentido, pergunta se quer um lembrete (usarás \`create_follow_up\`). Exemplo: "Registei a placa do apartamento junto ao Castelo, em Santa Maria da Feira. Queres que te lembre de ligar?"

CONFIRMAÇÕES:
- Para criar eventos, tarefas, pessoas ou imóveis a pedido explícito, executa directamente e confirma em 1 frase natural (ex.: "Marcada a visita ao Paulo amanhã às 15h.").
- Se faltar informação essencial (data, hora, ou identificar a pessoa quando há ambiguidade), pergunta UMA coisa.`;
}

function toGatewayHistory(rows: Array<{ role: string; content: string }>): GatewayMessage[] {
  const asc = [...rows].reverse();
  const out: GatewayMessage[] = [];
  for (const r of asc) {
    if (!r?.content) continue;
    if (r.role === "user" || r.role === "assistant") {
      out.push({ role: r.role, content: r.content });
    }
  }
  return out;
}

export async function orchestrateAssessorV2(input: EngineInput): Promise<EngineOutcome> {
  const { supabase, userId, channel, content, sourceMessageId } = input;
  if (!userId) return { reply: "Este número ainda não está associado a nenhum consultor." };

  const trimmed = content.trim();
  if (!trimmed) return { reply: "Não percebi. Podes repetir?" };

  // Guião de abordagem: se houver uma oferta em aberto ("Chamada"/"Mensagem"/
  // "Sem guião"), resolve-se aqui, antes de gastar IA.
  try {
    const { resolveScriptPending } = await import("@/lib/prospecting/script-offer.server");
    const scriptReply = await resolveScriptPending({ supabase, userId, channel }, trimmed);
    if (scriptReply) return { reply: scriptReply };
  } catch { /* segue o fluxo normal */ }

  const [{ data: prof }, { data: recentRows }] = await Promise.all([
    supabase.from("profiles").select("name, assessor_name").eq("id", userId).maybeSingle(),
    supabase
      .from("assessor_messages")
      .select("role, content")
      .eq("user_id", userId)
      .eq("channel", channel)
      .order("created_at", { ascending: false })
      .limit(HISTORY_LIMIT),
  ]);

  const assessorName = sanitizeAssessorName((prof as any)?.assessor_name ?? "") || ASSESSOR_NAME_DEFAULT;
  const userFirstName = String((prof as any)?.name ?? "").split(/\s+/)[0] || "";

  const history = toGatewayHistory((recentRows as any[]) ?? []);
  history.push({ role: "user", content: trimmed });

  const systemPrompt = buildSystemPrompt(assessorName, userFirstName);

  const result = await runInterpretationLoop({
    domainCtx: { supabase, userId, channel, sourceMessageId: sourceMessageId ?? null },
    systemPrompt,
    history,
    tools: TOOL_SPECS,
    model: V2_MODEL_DEFAULT,
    maxIterations: 4,
  });

  // Telemetria — best effort, nunca bloqueia a resposta.
  try {
    await supabase.from("assessor_ai_logs").insert({
      user_id: userId,
      channel,
      model: V2_MODEL_DEFAULT,
      intent: "orchestrator_v2",
      confidence: null,
      input_tokens: result.usage.inputTokens,
      output_tokens: result.usage.outputTokens,
      total_tokens: result.usage.totalTokens,
      latency_ms: result.totalLatencyMs,
      success: !result.error,
      error: result.error ?? null,
      domain: "assessor",
      route: "v2",
      fallback_used: !!result.error,
    } as never);

    if (result.toolCalls.length) {
      await supabase.from("assessor_tool_calls").insert(
        result.toolCalls.map((tc) => ({
          user_id: userId,
          channel,
          tool_name: tc.name,
          arguments: safeParseJson(tc.args),
          result: (tc.result as unknown) as never,
          success: tc.result.ok,
          latency_ms: tc.latencyMs,
          error: tc.result.ok ? null : (tc.result.error ?? "unknown"),
        })) as never,
      );
    }
  } catch { /* ignore telemetry failures */ }

  let reply = result.reply;

  // Depois de registar uma placa de particular, oferece o guião (3 botões).
  try {
    const lead = result.toolCalls.find(
      (tc) => tc.name === "create_prospecting_lead" && tc.result.ok,
    );
    if (lead) {
      const args = safeParseJson(lead.args) as Record<string, any>;
      const { appendScriptOffer } = await import("@/lib/prospecting/script-offer.server");
      reply = await appendScriptOffer(
        { supabase, userId, channel },
        {
          reply,
          leadId: ((lead.result as any)?.data?.id ?? (lead.result as any)?.id ?? null) as string | null,
          payload: args ?? {},
          originalContent: trimmed,
        },
      );
    }
  } catch { /* a oferta é opcional, nunca parte a resposta */ }

  return { reply };
}

function safeParseJson(raw: string): unknown {
  try { return JSON.parse(raw); } catch { return { _raw: raw }; }
}
