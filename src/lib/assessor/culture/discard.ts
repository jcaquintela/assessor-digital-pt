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

const DISCARD_RE = new RegExp(
  [
    "^(descarta|descartar|descartas|descartado|deita fora|deitar fora)\\b",
    "\\b(descarta|descartar|descartado)\\b",
    "\\b(apaga|apagar|elimina|eliminar|apaga isso|apaga tudo)\\b",
    "\\b(esquece|esquecer|esquece isso|esquece tudo)\\b",
    "\\b(cancela isso|cancela tudo|anula isso)\\b",
    "\\b(nao guardes|nao guardar|nao registes|nao fica nada)\\b",
  ].join("|"),
);

/** O consultor está a mandar descartar o último input? */
export function isDiscardCommand(raw: string | null | undefined): boolean {
  const t = norm(raw ?? "");
  if (!t || t.length > 140) return false;
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