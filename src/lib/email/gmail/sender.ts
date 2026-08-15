// Correspondência de remetente por email — passo determinístico que corre
// ANTES de qualquer resolução por nome.
//
// Razão: um email traz o endereço do remetente, que é identificador único.
// Adivinhar a pessoa pelo nome "Ana" quando temos ana.silva@x.pt na ficha
// seria inventar trabalho e arriscar o mesmo erro do caso "Manuel".

export type EmailAddress = { email: string; name: string | null };

/** Normalização usada para comparar com `people.email_normalized`. */
export function normalizeEmail(input: string | null | undefined): string {
  return String(input ?? "").trim().toLowerCase();
}

/** Extrai "Ana Silva <ana@x.pt>" ou "ana@x.pt". */
export function parseFromHeader(raw: string | null | undefined): EmailAddress | null {
  const s = String(raw ?? "").trim();
  if (!s) return null;
  const angled = s.match(/^(.*?)<\s*([^>\s]+@[^>\s]+)\s*>$/);
  if (angled) {
    const name = angled[1]!.replace(/^["']|["']$/g, "").trim();
    return { email: normalizeEmail(angled[2]), name: name || null };
  }
  const bare = s.match(/[^\s<>,;]+@[^\s<>,;]+/);
  if (!bare) return null;
  return { email: normalizeEmail(bare[0]), name: null };
}