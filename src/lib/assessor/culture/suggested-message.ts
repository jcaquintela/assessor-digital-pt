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

export interface SplitSuggestion {
  intro: string;
  suggestion: string;
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
  // Itálico/negrito do WhatsApp ou Markdown à volta de todo o bloco.
  for (let i = 0; i < 3; i++) {
    const next = out
      .replace(/^[_*]{1,2}([\s\S]+)[_*]{1,2}$/m, "$1")
      .replace(/^["“”«]([\s\S]+)["“”»]$/m, "$1")
      .trim();
    if (next === out) break;
    out = next;
  }
  // Itálicos por linha (o modelo às vezes envolve cada parágrafo).
  out = out
    .split("\n")
    .map((l) => l.trim().replace(/^_([^_]+)_$/, "$1").replace(/^\*([^*]+)\*$/, "$1"))
    .join("\n");
  return out.trim();
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
    const suggestion = stripWrappers(text.slice(marked + SUGGESTION_MARKER.length));
    if (!suggestion) return null;
    return { intro, suggestion };
  }

  const m = LEAD_IN_RE.exec(text);
  if (!m?.groups) return null;
  const intro = m.groups["intro"]!.trim();
  const rawBody = m.groups["body"]!.trim();
  // Só separamos quando o corpo vem visivelmente marcado como texto para
  // copiar (itálico/aspas) ou quando é claramente um bloco à parte.
  const looksQuoted = /^[_*"“«]/.test(rawBody) || rawBody.startsWith("\n");
  const body = stripWrappers(rawBody);
  if (!body || body.length < 15) return null;
  if (!looksQuoted && !/\n/.test(rawBody)) return null;
  if (!intro) return null;
  return { intro, suggestion: body };
}

/** Remove o marcador quando não vale a pena separar (ex.: histórico). */
export function stripSuggestionMarker(reply: string | null | undefined): string {
  return String(reply ?? "").split(SUGGESTION_MARKER).join("\n").replace(/\n{3,}/g, "\n\n").trim();
}