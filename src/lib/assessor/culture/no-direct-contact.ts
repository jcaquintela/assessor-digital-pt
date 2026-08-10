// Guardrail cultural: o Afonso NUNCA contacta terceiros (proprietários,
// clientes, compradores, inquilinos, leads). Toda a comunicação para fora é
// sempre um rascunho apresentado ao consultor, que é quem envia.
//
// Esta camada não muda comportamento — o motor já só prepara rascunhos — mas
// impede que a *linguagem* anuncie uma acção que o Afonso não executa
// ("Vou contactar o proprietário..." → "Preparo-te uma mensagem para...").

// Palavras que identificam um terceiro (nunca o consultor).
const THIRD_PARTY_WORD =
  "propriet[áa]ri[oa]s?|dono|dona|client[ea]s?|comprador(?:es|a)?|vendedor(?:es|a)?|inquilin[oa]s?|arrendat[áa]ri[oa]s?|leads?|senhor(?:a)?|sr\\.?|sra\\.?|d\\.|dona";

// Verbos de contacto para fora, na 1.ª pessoa (futuro, presente ou passado).
const CONTACT_VERB =
  "contact\\w*|lig\\w*|telefon\\w*|fal\\w*|escrev\\w*|avis\\w*|mand\\w*|envi\\w*|ped\\w*|responde\\w*|acompanh\\w*";

const FIRST_PERSON = "vou|vou j[áa]|j[áa]\\s+vou|irei|vamos|posso|eu";

// "Vou contactar o proprietário ...", "Já liguei ao Sr. Coelho ...",
// "Envio uma mensagem à proprietária ..."
const ANNOUNCE_RE = new RegExp(
  `\\b(?:(?:${FIRST_PERSON})\\s+)?(?:${CONTACT_VERB})\\s+` +
    `(?:uma\\s+mensagem\\s+|uma\\s+sms\\s+|um\\s+email\\s+|um\\s+wh?atsapp\\s+)?` +
    `(?:a|ao|à|aos|às|com|para|para\\s+o|para\\s+a)?\\s*` +
    `(?:o|a|os|as)?\\s*(?:${THIRD_PARTY_WORD})\\b`,
  "i",
);

// Formulações já correctas (o consultor é quem envia) não são reescritas.
const SAFE_RE =
  /\b(rascunho|envias\s+tu|para\s+enviares|preparo|preparei|preparar|sugiro|sugest[ãa]o|deixo-te|deixei-te|queres\s+que\s+prepare)\b/i;

/**
 * Verdadeiro quando o texto anuncia contacto directo do Afonso com um
 * terceiro. Usado nos testes golden e na sanitização.
 */
export function announcesDirectThirdPartyContact(text?: string | null): boolean {
  const s = String(text ?? "").trim();
  if (!s) return false;
  return s
    .split(/(?<=[.!?])\s+/)
    .some((sentence) => ANNOUNCE_RE.test(sentence) && !SAFE_RE.test(sentence));
}

/**
 * Reescreve o anúncio de contacto directo em linguagem verdadeira:
 * "Vou contactar o proprietário X para pedir a caderneta."
 * → "Preparo-te uma mensagem para o proprietário X para pedir a caderneta. Envias tu."
 */
export function enforceNoDirectContact(text?: string | null): string {
  const original = String(text ?? "");
  if (!original.trim()) return "";
  let changed = false;

  const rewritten = original
    .split(/(?<=[.!?])(\s+)/)
    .map((chunk) => {
      if (!chunk.trim() || SAFE_RE.test(chunk) || !ANNOUNCE_RE.test(chunk)) return chunk;
      changed = true;
      return chunk.replace(ANNOUNCE_RE, (match) => {
        const target = match.replace(
          new RegExp(`^.*?(?=(?:o|a|os|as)?\\s*(?:${THIRD_PARTY_WORD})\\b)`, "i"),
          "",
        );
        return `Preparo-te uma mensagem para ${target.trim()}`;
      });
    })
    .join("");

  if (!changed) return original;
  const out = rewritten.replace(/\s{2,}/g, " ").trim();
  return /envias\s+tu/i.test(out) ? out : `${out.replace(/[.\s]*$/, "")}. Envias tu.`;
}
