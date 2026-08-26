// Email de iniciativa a um lead/contacto — regras puras (sem I/O).
//
// Decisão de direcção (26/08): o Afonso não lê a caixa de entrada. O que
// acrescenta valor sobre o telemóvel do consultor é COMPOR um email de
// iniciativa a uma pessoa, usando o contexto que já tem (última interacção,
// imóveis, negócio, próxima acção).
//
// Tudo o que envolve autorização de envio continua igual ao rascunho de
// resposta: frase inequívoca, janela de 6h, máximo 3 iterações, auditoria.
// Este módulo só trata do que é determinístico: assunto, textos do canal e
// leitura de um endereço de email escrito pelo consultor.

/** Assunto de um email de saída. NUNCA leva prefixo "Re:". */
export function outboundSubject(args: {
  propertyTitle?: string | null;
  dealLabel?: string | null;
  consultantName?: string | null;
  subjectHint?: string | null;
}): string {
  const hint = String(args.subjectHint ?? "").trim();
  if (hint) return hint.slice(0, 120);

  const prop = String(args.propertyTitle ?? "").trim();
  if (prop) return `Sobre ${prop}`.slice(0, 120);

  const deal = String(args.dealLabel ?? "").trim();
  if (deal) return `Sobre ${deal}`.slice(0, 120);

  const who = String(args.consultantName ?? "").trim();
  return who ? `Contacto de ${who}`.slice(0, 120) : "Contacto";
}

/** Primeiro endereço de email plausível escrito numa frase. */
export function emailFromText(text: string | null | undefined): string | null {
  const m = String(text ?? "").match(/[\w.!#$%&'*+/=?^`{|}~-]+@[\w-]+(?:\.[\w-]+)+/);
  if (!m) return null;
  const addr = m[0].replace(/[.,;:]+$/, "").toLowerCase();
  return /^\S+@\S+\.\S{2,}$/.test(addr) ? addr : null;
}

export function outboundIntro(args: { toName: string; subject: string }): string {
  const alvo = args.toName || "o contacto";
  return `Preparei a mensagem para ${alvo}${args.subject ? ` sobre "${args.subject}"` : ""}. Lê antes de seguir:`;
}

/** Sem email na ficha não inventamos endereço: perguntamos. */
export function missingEmailQuestion(name: string): string {
  return `Não tenho email do ${String(name).trim()}. Qual é o endereço para eu preparar a mensagem?`;
}

export function emailSavedNote(name: string): string {
  return `Guardei o email na ficha do ${String(name).trim()}.`;
}

/**
 * Comunicação do resultado por provedor. Nunca dizemos "enviado" quando só
 * ficou o rascunho na caixa — no Outlook o clique final é sempre do consultor.
 */
export function outboundSendConfirmation(args: {
  toLabel: string;
  manualSend: boolean;
}): string {
  return args.manualSend
    ? `Deixei o rascunho na tua caixa do Outlook, é só carregares em Enviar. A tua autorização fica no histórico.`
    : `Enviado para ${args.toLabel}. Fica no histórico em /comunicacao.`;
}
