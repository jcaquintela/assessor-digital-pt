// Falhas de "entidade não encontrada" nas ferramentas de atualização.
//
// São a assinatura típica de um id inventado pelo modelo: o consultor pediu
// uma alteração e nada ficou gravado. Aqui isolamos a deteção e a amostra do
// input (sem PII completa) para o painel de admin poder alertar.

export const NOT_FOUND_ERRORS = [
  "pessoa_nao_encontrada",
  "imovel_nao_encontrado",
  "registo_nao_encontrado",
  "rotina_nao_encontrada",
] as const;

export type NotFoundError = (typeof NOT_FOUND_ERRORS)[number];

const ENTITY_BY_ERROR: Record<string, string> = {
  pessoa_nao_encontrada: "pessoa",
  imovel_nao_encontrado: "imóvel",
  registo_nao_encontrado: "registo",
  rotina_nao_encontrada: "rotina",
};

/** `true` quando o erro da ferramenta é de entidade inexistente. */
export function isEntityNotFound(error: string | null | undefined): boolean {
  if (!error) return false;
  const e = error.toLowerCase();
  return NOT_FOUND_ERRORS.some((k) => e.includes(k));
}

export function notFoundEntity(error: string | null | undefined): string | null {
  if (!error) return null;
  const e = error.toLowerCase();
  const hit = NOT_FOUND_ERRORS.find((k) => e.includes(k));
  return hit ? ENTITY_BY_ERROR[hit]! : null;
}

function maskValue(key: string, value: unknown): unknown {
  if (typeof value === "number" || typeof value === "boolean" || value === null) return value;
  if (typeof value !== "string") return "[…]";
  const k = key.toLowerCase();
  if (k.includes("email")) {
    const [u, d] = value.split("@");
    return d ? `${(u ?? "").slice(0, 2)}…@${d}` : "…";
  }
  if (k.includes("phone") || k.includes("telefone")) {
    return value.length > 4 ? `…${value.slice(-4)}` : "…";
  }
  return value.length > 60 ? `${value.slice(0, 60)}…` : value;
}

/**
 * Amostra do input que provocou a falha: chaves preservadas, valores curtos
 * e contactos mascarados. Serve para perceber o padrão sem expor dados.
 */
export function inputSample(args: unknown, maxKeys = 6): Record<string, unknown> | null {
  if (!args || typeof args !== "object" || Array.isArray(args)) return null;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(args as Record<string, unknown>)) {
    if (Object.keys(out).length >= maxKeys) {
      out["…"] = `+${Object.keys(args as object).length - maxKeys} campos`;
      break;
    }
    out[k] = maskValue(k, v);
  }
  return out;
}
