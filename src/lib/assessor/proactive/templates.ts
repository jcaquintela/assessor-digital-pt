// Templates WhatsApp para mensagens iniciadas pelo Afonso.
//
// A Meta só deixa passar texto livre dentro da janela de 24h desde a última
// mensagem do consultor. Fora dessa janela é obrigatório um template
// aprovado. Enquanto não houver aprovação, o push proativo fora da janela
// fica bloqueado (ver `templatesApproved()` em push.server.ts).

export const TEMPLATE_MORNING = "afonso_prioridades_dia";
export const TEMPLATE_CHECKIN = "afonso_resultado_seguimento";
export const TEMPLATE_CHECKIN_V2 = "afonso_resultado_seguimento_corrigido";
export const TEMPLATE_PLAN_ACTIVATED = "afonso_plano_ativado";
export const TEMPLATE_PLAN_TRIAL_START = "afonso_plano_trial";
export const TEMPLATE_TRIAL_ENDING = "afonso_periodo_experimental";
export const TEMPLATE_LANG = "pt_PT";

/**
 * Corpo do template da manhã: {{1}} = nome, {{2}} = lista de prioridades.
 *
 * Texto exato a submeter à Meta para aprovação:
 * "Bom dia, {{1}}. As tuas prioridades de hoje: {{2}}. Bom trabalho."
 *
 * Nota: o WhatsApp rejeita templates cujo corpo comece ou termine numa
 * variável. O sufixo ". Bom trabalho." garante que o template termina em
 * texto fixo.
 */
export function morningTemplatePayload(name: string, list: string) {
  return {
    type: "template",
    template: {
      name: TEMPLATE_MORNING,
      language: { code: TEMPLATE_LANG },
      components: [
        { type: "body", parameters: [
          { type: "text", text: name },
          { type: "text", text: list },
        ] },
      ],
    },
  } as Record<string, unknown>;
}

/**
 * Corpo do check-in: {{1}} = seguimento. Botões de resposta rápida vêm do
 * template (máx. 3 opções: "Correu bem", "Precisa seguimento", "Sem efeito").
 *
 * Texto exato a submeter à Meta para aprovação:
 * "Como correu \"{{1}}\"? Toca num botao para registar o resultado."
 *
 * Nota: o WhatsApp rejeita templates cujo corpo comece ou termine numa
 * variável. A pergunta no início e o pedido no final garantem texto fixo
 * nos dois extremos.
 *
 * DEPRECATED: mantém-se activo enquanto a versão corrigida (v2) não for
 * aprovada pela Meta.
 */
export function checkinTemplatePayload(title: string) {
  return {
    type: "template",
    template: {
      name: TEMPLATE_CHECKIN,
      language: { code: TEMPLATE_LANG },
      components: [
        { type: "body", parameters: [{ type: "text", text: title }] },
      ],
    },
  } as Record<string, unknown>;
}

/**
 * Versão corrigida do check-in: "botão" com til.
 * Submetido como template separado para não interromper o check-in enquanto
 * a nova versão não é aprovada.
 */
export function checkinTemplatePayloadV2(title: string) {
  return {
    type: "template",
    template: {
      name: TEMPLATE_CHECKIN_V2,
      language: { code: TEMPLATE_LANG },
      components: [
        { type: "body", parameters: [{ type: "text", text: title }] },
      ],
    },
  } as Record<string, unknown>;
}

/** Escolhe o template de check-in a usar: v2 se aprovado, senão v1. */
export async function resolveCheckinTemplatePayload(
  title: string,
  isV2Approved: () => Promise<boolean>,
): Promise<Record<string, unknown>> {
  if (await isV2Approved()) return checkinTemplatePayloadV2(title);
  return checkinTemplatePayload(title);
}

/**
 * Plano ativado: {{1}} = primeiro nome, {{2}} = nome do plano.
 *
 * Texto exato submetido à Meta (categoria Utility):
 * "Boas notícias, {{1}}! O teu plano {{2}} já está ativo. Já podes usar
 * tudo o que isso inclui."
 */
export function planActivatedTemplatePayload(name: string, plan: string) {
  return {
    type: "template",
    template: {
      name: TEMPLATE_PLAN_ACTIVATED,
      language: { code: TEMPLATE_LANG },
      components: [
        { type: "body", parameters: [
          { type: "text", text: name },
          { type: "text", text: plan },
        ] },
      ],
    },
  } as Record<string, unknown>;
}

/** Mesma mensagem em texto normal (Telegram, ou WhatsApp dentro das 24h). */
export function planActivatedText(name: string, plan: string) {
  return `Boas notícias, ${name}! O teu plano ${plan} já está ativo. Já podes usar tudo o que isso inclui.`;
}

/**
 * Subida para Consultor/Pro com WhatsApp ligado e período experimental de
 * 14 dias a arrancar. NÃO repete o aviso de IA: quem recebe isto já teve o
 * primeiro contacto. Texto único e fixo, definido pelo produto.
 *
 * Texto exato submetido à Meta (categoria Utility), {{1}} = plano.
 */
export function planTrialStartText(plan: string) {
  return (
    `Boas notícias — já tens o plano ${plan} ativo, com WhatsApp e tudo o que isso traz. 🎉\n\n` +
    `Tens 14 dias grátis, sem cartão de crédito nenhum. Ao dia 12, pergunto-te se queres continuar ` +
    `(Consultor ou Pro) ou ficar no Nível Base, grátis, pelo Telegram. Se não disseres nada, ao dia 14 ` +
    `passas automaticamente para o Base — sem perderes nada do que já organizámos, só ficas sem os ` +
    `módulos pagos até decidires voltar.`
  );
}

export function planTrialStartTemplatePayload(plan: string) {
  return {
    type: "template",
    template: {
      name: TEMPLATE_PLAN_TRIAL_START,
      language: { code: TEMPLATE_LANG },
      components: [
        { type: "body", parameters: [{ type: "text", text: plan }] },
      ],
    },
  } as Record<string, unknown>;
}

/**
 * Fim do período experimental: {{1}} = primeiro nome, {{2}} = dias que faltam.
 *
 * Texto exato a submeter à Meta (categoria Utility):
 * "Olá {{1}}. O teu período experimental termina em {{2}} dias. A conta é
 * sempre a mesma e nada do que organizámos se perde — só muda o que fica
 * disponível. Diz-me que plano queres continuar a usar."
 */
export function trialEndingTemplatePayload(name: string, days: number) {
  return {
    type: "template",
    template: {
      name: TEMPLATE_TRIAL_ENDING,
      language: { code: TEMPLATE_LANG },
      components: [
        { type: "body", parameters: [
          { type: "text", text: name },
          { type: "text", text: String(days) },
        ] },
      ],
    },
  } as Record<string, unknown>;
}

/** Mesma mensagem em texto normal (Telegram, ou WhatsApp dentro das 24h). */
export function trialEndingText(name: string, days: number) {
  return (
    `Olá${name ? ` ${name}` : ""}. O teu período experimental termina em ${days} dias. ` +
    "A conta é sempre a mesma e nada do que organizámos se perde — só muda o que fica " +
    "disponível. Diz-me com que plano queres continuar: Consultor, Pro ou Base."
  );
}

/** Aviso curto no momento em que o período experimental termina. */
export function trialExpiredText(name: string) {
  return (
    `Olá${name ? ` ${name}` : ""}. O período experimental terminou e a tua conta ficou no plano Base. ` +
    "É a mesma conta de sempre, com o mesmo histórico: nada foi apagado, só ficam disponíveis " +
    "menos funcionalidades. Quando quiseres voltar a abrir tudo, diz-me."
  );
}

/** Dia 7 do período experimental: resumo de valor, sem pedir nada. */
export function trialValueSummaryText(
  name: string,
  stats: { people: number; properties: number; followUps: number },
) {
  const bits: string[] = [];
  if (stats.people > 0) bits.push(`${stats.people} ${stats.people === 1 ? "pessoa" : "pessoas"}`);
  if (stats.properties > 0) bits.push(`${stats.properties} ${stats.properties === 1 ? "imóvel" : "imóveis"}`);
  if (stats.followUps > 0) bits.push(`${stats.followUps} ${stats.followUps === 1 ? "seguimento" : "seguimentos"}`);
  const body = bits.length
    ? `Nestes primeiros 7 dias já organizámos ${bits.join(", ")}.`
    : "Já vamos a meio do período experimental e ainda mal me puseste à prova.";
  return (
    `Olá${name ? ` ${name}` : ""}. ${body} Faltam 7 dias de experiência completa — ` +
    "aproveita para me atirares o trabalho de que menos gostas."
  );
}

/** Dia 12: escolha de plano, com o que acontece se não responderes. */
export function trialChoiceText(name: string) {
  return (
    `Olá${name ? ` ${name}` : ""}. Faltam 2 dias para acabar o período experimental. ` +
    "Diz-me só com que plano queres ficar: *Consultor*, *Pro* ou *Base*. " +
    "Se não me disseres nada, fico automaticamente no Base — a conta e o histórico mantêm-se iguais."
  );
}
/**
 * Cartela de briefing fora da janela de 24h.
 *
 * Template por defeito (submetido à Meta, categoria Utility, pt_PT):
 * "Olá {{1}}. Daqui a 15 minutos tens {{2}}. O que interessa saber: {{3}}. Bom trabalho."
 *
 * O nome do template usado é escolhido no admin (Integrações & flags →
 * "Briefing fora das 24h"), porque a Meta pode aprovar um nome diferente.
 */
export const TEMPLATE_MEETING_BRIEFING = "afonso_briefing_compromisso";

export function meetingBriefingTemplatePayload(
  templateName: string,
  params: string[],
  language: string = TEMPLATE_LANG,
) {
  return {
    type: "template",
    template: {
      name: templateName,
      language: { code: language },
      components: params.length
        ? [{ type: "body", parameters: params.map((text) => ({ type: "text", text })) }]
        : [],
    },
  } as Record<string, unknown>;
}
