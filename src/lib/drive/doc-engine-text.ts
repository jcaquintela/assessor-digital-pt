// Traduz a leitura de um documento (caderneta, certidão, licença…) numa frase
// natural em PT-PT, para o motor de raciocínio saber do que se trata em vez de
// perguntar "a que se refere?".

export interface DocEngineReading {
  doc_type?: string | null;
  artigo_matricial?: string | null;
  fracao?: string | null;
  morada?: string | null;
  nif?: string | null;
  expires_on?: string | null;
}

function ptDate(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

/**
 * Devolve null quando não há nada identificável — nesse caso o fluxo normal
 * (pergunta de classificação) segue como antes.
 */
export function documentToEngineText(
  reading: DocEngineReading,
  caption?: string | null,
): string | null {
  const tipo = reading.doc_type?.trim();
  const detalhes: string[] = [];
  if (reading.artigo_matricial) detalhes.push(`artigo matricial ${reading.artigo_matricial}`);
  if (reading.fracao) detalhes.push(`fração ${reading.fracao}`);
  if (reading.morada) detalhes.push(`morada ${reading.morada}`);
  if (reading.nif) detalhes.push(`NIF ${reading.nif}`);
  if (!tipo && !detalhes.length) return null;

  const bits: string[] = [];
  bits.push(`Recebi ${tipo ? `um documento: ${tipo}` : "um documento"}${detalhes.length ? ` (${detalhes.join(", ")})` : ""}.`);
  if (reading.expires_on) bits.push(`Validade até ${ptDate(reading.expires_on)}.`);
  const cap = caption?.trim();
  if (cap) bits.push(cap);
  return bits.join(" ");
}

/** Texto que ajuda a encontrar o imóvel/pessoa certos ao ligar o ficheiro. */
export function docLinkText(
  reading: DocEngineReading & { visible_text?: string | null },
): string | null {
  const parts = [
    reading.doc_type,
    reading.morada,
    reading.artigo_matricial,
    reading.fracao,
    reading.nif,
    reading.visible_text,
  ].filter(Boolean) as string[];
  const text = parts.join("\n").trim();
  return text ? text.slice(0, 20000) : null;
}
