// Mensagens sugeridas para o consultor copiar/reenviar.
//
// Problema real: o Afonso mandava a introdução e o rascunho no mesmo balão
// ("sugiro algo simples: _Boa tarde..._"). No WhatsApp, um long-press
// seleciona a mensagem inteira, por isso o consultor tinha de andar a
// escolher texto a partir do meio do balão. Regra: o texto sugerido sai
// SEMPRE numa mensagem só dele, limpo de itálicos e aspas.
//
// Módulo puro: quem produz o rascunho pode marcá-lo explicitamente com
// SUGGESTION_MARKER; quando não o faz, tentamos reconhecer o padrão.

export const SUGGESTION_MARKER = "[[SUGESTAO]]";
/**
 * Pergunta que tem de sair DEPOIS do texto sugerido, em bolha própria.
 * Caso real: o corpo de um email e o "posso enviar?" não podem partilhar
 * balão — quem faz long-press para copiar apanharia a pergunta pelo meio.
 */
export const QUESTION_MARKER = "[[PERGUNTA]]";

export interface SplitSuggestion {
  intro: string;
  suggestion: string;
  /** Terceira bolha, opcional: a pergunta de confirmação. */
  question?: string;
}

/** Intro + texto sugerido + pergunta de confirmação, em três bolhas. */
export function withSuggestionAndQuestion(
  intro: string,
  suggestion: string,
  question: string,
): string {
  const base = withSuggestion(intro, suggestion);
  const q = String(question ?? "").trim();
  if (!q || !String(suggestion ?? "").trim()) return base;
  return `${base}\n${QUESTION_MARKER}\n${q}`;
}

/** Marca um texto como sugestão para o pipeline o separar no envio. */
export function withSuggestion(intro: string, suggestion: string): string {
  const i = String(intro ?? "").trim();
  const s = String(suggestion ?? "").trim();
  if (!s) return i;
  return `${i}\n${SUGGESTION_MARKER}\n${s}`.trim();
}

function stripWrappers(raw: string): string {
  let out = String(raw ?? "").trim();
  // Itálicos/aspas por linha (o modelo às vezes envolve cada parágrafo).
  out = out
    .split("\n")
    .map((l) =>
      l
        .trim()
        .replace(/^_([^_]+)_$/, "$1")
        .replace(/^\*([^*]+)\*$/, "$1")
        .replace(/^["“”«‘]([\s\S]+)["“”»’]$/, "$1"),
    )
    .join("\n")
    .trim();
  // Marcadores a envolver o bloco inteiro.
  for (let i = 0; i < 3; i++) {
    const next = out
      // Marcador simétrico (backreference): **x** -> x, _x_ -> x, sem
      // deixar um asterisco órfão quando as pontas não coincidem.
      .replace(/^([_*]{1,2})([\s\S]+)\1$/, "$2")
      .replace(/^["“”«‘]([\s\S]+)["“”»’]$/, "$1")
      .trim();
    if (next === out) break;
    out = next;
  }
  return out.trim();
}

/**
 * Normalização única do texto sugerido: o que é enviado no canal, o que fica
 * guardado e o que o botão "Copiar" põe na área de transferência têm de ser
 * exatamente a mesma string.
 * - CRLF/CR -> \n
 * - remove itálicos/asteriscos/aspas a envolver o texto
 * - tira espaços no fim de cada linha (e NBSP -> espaço normal)
 * - colapsa 3+ quebras em no máximo uma linha em branco
 */
export function normalizeSuggestedText(raw: string | null | undefined): string {
  const base = String(raw ?? "")
    .replace(/\r\n?/g, "\n")
    .replace(/\u00a0/g, " ");
  return stripWrappers(base)
    .split("\n")
    .map((l) => l.replace(/[ \t]+$/g, "").replace(/^[ \t]+/g, ""))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// Frases que anunciam um rascunho ("sugiro algo simples:", "podes enviar:").
const LEAD_IN_RE =
  /^(?<intro>[\s\S]*?(?:sugiro|proponho|deixo|escreve|envia|manda|podes\s+(?:enviar|mandar|copiar)|fica\s+assim|guião|rascunho|mensagem)[^\n:]*:)\s*(?<body>[\s\S]+)$/i;

/**
 * Separa a introdução do texto sugerido. Devolve `null` quando a resposta é
 * conversa normal — nesse caso nada muda no envio.
 */
export function splitSuggestedMessage(reply: string | null | undefined): SplitSuggestion | null {
  const text = String(reply ?? "").replace(/\r\n/g, "\n").trim();
  if (!text) return null;

  const marked = text.indexOf(SUGGESTION_MARKER);
  if (marked >= 0) {
    const intro = text.slice(0, marked).trim();
    const rest = text.slice(marked + SUGGESTION_MARKER.length);
    const qAt = rest.indexOf(QUESTION_MARKER);
    const question = qAt >= 0 ? rest.slice(qAt + QUESTION_MARKER.length).trim() : "";
    const suggestion = normalizeSuggestedText(qAt >= 0 ? rest.slice(0, qAt) : rest);
    if (!suggestion) return null;
    return question ? { intro, suggestion, question } : { intro, suggestion };
  }

  const m = LEAD_IN_RE.exec(text);
  if (!m?.groups) return null;
  const intro = m.groups["intro"]!.trim();
  const rawBody = m.groups["body"]!.trim();
  // Só separamos quando o corpo vem visivelmente marcado como texto para
  // copiar (itálico/aspas) ou quando é claramente um bloco à parte.
  const looksQuoted = /^[_*"“«]/.test(rawBody) || rawBody.startsWith("\n");
  const body = normalizeSuggestedText(rawBody);
  if (!body || body.length < 15) return null;
  if (!looksQuoted && !/\n/.test(rawBody)) return null;
  if (!intro) return null;
  return { intro, suggestion: body };
}

/** Remove o marcador quando não vale a pena separar (ex.: histórico). */
export function stripSuggestionMarker(reply: string | null | undefined): string {
  return String(reply ?? "")
    .split(SUGGESTION_MARKER)
    .join("\n")
    .split(QUESTION_MARKER)
    .join("\n").replace(/\n{3,}/g, "\n\n").trim();
}