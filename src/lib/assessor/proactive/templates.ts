// Templates WhatsApp para mensagens iniciadas pelo Afonso.
//
// A Meta só deixa passar texto livre dentro da janela de 24h desde a última
// mensagem do consultor. Fora dessa janela é obrigatório um template
// aprovado. Enquanto não houver aprovação, o push proativo fora da janela
// fica bloqueado (ver `templatesApproved()` em push.server.ts).

export const TEMPLATE_MORNING = "afonso_prioridades_dia";
export const TEMPLATE_CHECKIN = "afonso_resultado_seguimento";
export const TEMPLATE_LANG = "pt_PT";

/** Corpo do template da manhã: {{1}} = nome, {{2}} = lista de prioridades. */
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

/** Corpo do check-in: {{1}} = seguimento. Botões de resposta rápida vêm do template. */
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