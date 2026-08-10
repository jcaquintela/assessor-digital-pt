// Comando "descartar" — módulo puro (sem I/O).
//
// Regra de confiança: quando o consultor manda descartar o último input,
// nada desse input pode ficar guardado — nem o ficheiro, nem a transcrição,
// nem o que o Afonso extraiu dele. A resposta é sempre a mesma, exacta, para
// não haver dúvida sobre o que aconteceu.

function norm(s: string): string {
  return String(s ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

// Só comandos inequívocos e curtos. "Apaga o seguimento do Nuno" é outra
// coisa (uma acção sobre um registo concreto) e não pode entrar aqui.
const DISCARD_RE =
  /^(?:por favor[,\s]+)?(?:descarta(?:r|s)?|descartado|deita(?:r)? fora|esquece(?:r)?|apaga(?:r)?|elimina(?:r)?|cancela(?:r)?|anula(?:r)?)(?:\s+(?:isso|isto|tudo|essa|esse|o audio|a mensagem|o ficheiro|isso tudo|tudo isso))?[.!]*$|^nao (?:guardes|guardar|registes|registar) nada[.!]*$/;

/** O consultor está a mandar descartar o último input? */
export function isDiscardCommand(raw: string | null | undefined): boolean {
  const t = norm(raw ?? "").replace(/\s+/g, " ");
  if (!t || t.length > 60) return false;
  return DISCARD_RE.test(t);
}

/** Resposta única e literal a um descarte concluído. */
export const DISCARD_DONE_REPLY = "Descartado. Nada foi guardado.";

/** Nada havia para descartar — mesmo princípio: nada ficou guardado. */
export const DISCARD_NOTHING_REPLY = "Descartado. Nada foi guardado.";

/** Pergunta opcional antes de descartar, quando algo do input tem valor. */
export function askKeepBeforeDiscard(what: string): string {
  const w = String(what ?? "").trim();
  return w
    ? `Queres que guarde só ${w} antes de descartar o resto?`
    : "Queres que guarde alguma coisa antes de descartar o resto?";
}