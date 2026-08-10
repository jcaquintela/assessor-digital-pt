// Vocabulário de confirmação controlado — módulo puro (sem I/O).
//
// Uma confirmação descreve a ACÇÃO EXECUTADA no backend, nunca o tema da
// conversa. Guardar um registo não é enviar nada a ninguém: qualquer verbo
// de comunicação ("enviei", "partilhei", "para a equipa") numa confirmação
// de escrita local é uma promessa falsa. E "Feito." sozinho não diz o quê
// nem onde — o consultor não consegue verificar.

export interface WriteConfirmation {
  /** tipo de objecto guardado: "a sugestão", "o erro", "o seguimento". */
  object: string;
  /** título/resumo curto do que ficou guardado. */
  title?: string | null;
  /** destino verificável no dashboard: "Sugestões, no dashboard". */
  destination: string;
  /** notas extra ("Anexo incluído."). */
  extras?: string[];
  /** acrescenta "Não enviei nada a ninguém." (escrita puramente local). */
  localOnly?: boolean;
}

function shortTitle(raw: string | null | undefined, max = 80): string {
  const t = String(raw ?? "").replace(/\s+/g, " ").trim();
  if (!t) return "";
  return t.length <= max ? t : `${t.slice(0, max - 1)}…`;
}

/** "Guardei a sugestão 'x' em Sugestões, no dashboard. Não enviei nada a ninguém." */
export function buildWriteConfirmation(c: WriteConfirmation): string {
  const title = shortTitle(c.title);
  const what = title ? `${c.object} "${title}"` : c.object;
  const parts = [`Guardei ${what} em ${c.destination}.`];
  for (const e of c.extras ?? []) {
    const t = String(e ?? "").trim();
    if (t) parts.push(t.endsWith(".") ? t : `${t}.`);
  }
  if (c.localOnly !== false) parts.push("Não enviei nada a ninguém.");
  return parts.join(" ");
}

// Verbos/expressões que implicam comunicação a terceiros.
const DELIVERY_RE =
  /\b(enviei|enviado|enviámos|enviamos|mandei|partilhei|partilhado|comuniquei|avisei|reencaminhei|encaminhei)\b|\b(?:para\s+a|à|a)\s+equipa\b|\bequipa\s+(?:já\s+)?(?:recebeu|vai)\b/i;

/** A frase promete comunicação a terceiros? */
export function claimsDelivery(text: string | null | undefined): boolean {
  const t = String(text ?? "");
  // Negações explícitas ("não enviei nada a ninguém", "…a clientes nem a
  // terceiros") são o contrário de uma promessa de envio.
  const cleaned = t
    .replace(/n[ãa]o\s+enviei\s+nada\s+a\s+ningu[ée]m/gi, "")
    .replace(/n[ãa]o\s+enviei\s+nada\s+a\s+clientes\s+nem\s+a\s+terceiros/gi, "")
    // "a equipa do Afonso" é a equipa do produto (painel interno), não um
    // terceiro do consultor — dizer que ela vê a sugestão não é uma promessa
    // de envio a clientes ou proprietários.
    .replace(/(?:para\s+|à\s+|a\s+)?equipa\s+do\s+afonso/gi, "");
  return DELIVERY_RE.test(cleaned);
}

// "Feito." / "Ok." / "Está." — confirmação opaca.
const BARE_ACK_RE =
  /^\s*(feito|pronto|ok(ay)?|est[áa]|est[áa]\s+feito|registado|guardado|certo)\s*[.!]?\s*$/i;

export function isBareAck(text: string | null | undefined): boolean {
  return BARE_ACK_RE.test(String(text ?? ""));
}

/**
 * Garante que uma confirmação de escrita diz o quê + onde e não promete
 * envio nenhum. Quando o texto gerado falha, substitui-o pelo template.
 */
export function enforceWriteConfirmation(
  reply: string | null | undefined,
  action: WriteConfirmation,
): string {
  const text = String(reply ?? "").trim();
  if (!text || isBareAck(text) || claimsDelivery(text)) return buildWriteConfirmation(action);
  // Diz alguma coisa de útil, mas não diz onde ficou: acrescenta o destino.
  if (!text.includes(action.destination)) {
    return `${text.replace(/[.!]?$/, ".")} ${buildWriteConfirmation(action)}`.trim();
  }
  return text;
}

/**
 * Uma pergunta de confirmação tem de descrever a acção real. "Confirmas que
 * registo isto para a equipa?" promete envio; a versão correcta diz onde
 * fica guardado.
 */
export function enforceConfirmationQuestion(
  question: string,
  fallback: string,
): string {
  return claimsDelivery(question) ? fallback : question;
}