// Nome curto e legível para ficheiros do Drive.
// Regras puras: o resumo do modelo é limpo e limitado a 3-5 palavras, nunca a
// transcrição literal do áudio.

const MAX_WORDS = 5;
const MIN_WORDS = 2;

const PREFIX: Record<string, string> = {
  audio: "Nota de voz",
  imagem: "Foto",
  prospecao: "Placa",
};

function stripJunk(raw: string): string {
  return String(raw ?? "")
    .replace(/^["'`\s]+|["'`\s.]+$/g, "")
    .replace(/^(t[íi]tulo|nome|resumo)\s*[:\-]\s*/i, "")
    .replace(/\s+/g, " ")
    .replace(/[\\/:*?"<>|]+/g, "")
    .trim();
}

/**
 * Limpa e limita o resumo do modelo. Devolve null quando não dá para fazer um
 * nome decente — nesse caso mantém-se o nome anterior.
 */
export function cleanShortName(raw: string | null | undefined): string | null {
  const s = stripJunk(String(raw ?? ""));
  if (!s) return null;
  const words = s.split(" ").filter(Boolean).slice(0, MAX_WORDS);
  if (words.length < MIN_WORDS) return null;
  const out = words.join(" ").replace(/[.,;:!?]+$/, "");
  if (out.length < 6) return null;
  return (out.charAt(0).toUpperCase() + out.slice(1)).slice(0, 70);
}

/**
 * Nome final: resumo limpo, com prefixo de tipo quando ajuda a reconhecer o
 * ficheiro na lista ("Nota de voz · Visita Canedo quinta-feira").
 */
export function composeShortName(
  classification: string | null | undefined,
  summary: string | null | undefined,
): string | null {
  const clean = cleanShortName(summary);
  if (!clean) return null;
  const prefix = PREFIX[String(classification ?? "")];
  if (!prefix) return clean;
  if (clean.toLowerCase().startsWith(prefix.toLowerCase())) return clean;
  return `${prefix} · ${clean}`.slice(0, 90);
}

/** Quantas palavras tem o nome (sem contar o prefixo de tipo). */
export function nameWordCount(name: string): number {
  const body = name.includes("·") ? name.split("·").slice(1).join(" ") : name;
  return body.trim().split(/\s+/).filter(Boolean).length;
}
