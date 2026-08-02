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
 * Fim do período experimental: {{1}} = primeiro nome, {{2}} = dias que faltam.
 *
 * Texto exato a submeter à Meta (categoria Utility):
 * "Olá {{1}}. O teu período experimental termina em {{2}} dias. Depois disso,
 * continuas a usar o Afonso pelo Telegram, sem perderes nada do que já
 * organizámos — só voltas ao WhatsApp quando quiseres continuar a pagar."
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
    "Depois disso, continuas a usar o Afonso pelo Telegram, sem perderes nada do que já " +
    "organizámos — só voltas ao WhatsApp quando quiseres continuar a pagar."
  );
}

/** Aviso curto no momento em que o período experimental termina. */
export function trialExpiredText(name: string) {
  return (
    `Olá${name ? ` ${name}` : ""}. O período experimental terminou. Continuas comigo pelo ` +
    "Telegram e não perdeste nada do que já organizámos — quando quiseres retomar o plano, diz-me."
  );
}