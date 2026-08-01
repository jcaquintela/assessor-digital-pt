// Templates WhatsApp para mensagens iniciadas pelo Afonso.
//
// A Meta só deixa passar texto livre dentro da janela de 24h desde a última
// mensagem do consultor. Fora dessa janela é obrigatório um template
// aprovado. Enquanto não houver aprovação, o push proativo fora da janela
// fica bloqueado (ver `templatesApproved()` em push.server.ts).

export const TEMPLATE_MORNING = "afonso_prioridades_dia";
export const TEMPLATE_CHECKIN = "afonso_resultado_seguimento";
export const TEMPLATE_PLAN_ACTIVATED = "afonso_plano_ativado";
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
 * "Como correu \"{{1}}\"? Toca num botão para registar o resultado."
 *
 * Nota: o WhatsApp rejeita templates cujo corpo comece ou termine numa
 * variável. A pergunta no início e o pedido no final garantem texto fixo
 * nos dois extremos.
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