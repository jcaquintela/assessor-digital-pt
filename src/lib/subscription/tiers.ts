// Fonte única para regras de gating por tier. Não lê da BD — recebe o valor
// vindo de `effective_tier()` e devolve capacidades. Cliente e servidor
// importam daqui para nunca divergirem.

export type SubscriptionTier = "base" | "consultor" | "pro" | "hub";
export type AutonomyLevel = "conservador" | "balanced" | "proativo";

const TIER_RANK: Record<SubscriptionTier, number> = {
  base: 0,
  consultor: 1,
  pro: 2,
  hub: 3,
};

export function normalizeTier(t: string | null | undefined): SubscriptionTier {
  return t && t in TIER_RANK ? (t as SubscriptionTier) : "base";
}

export function tierAtLeast(
  t: string | null | undefined,
  min: SubscriptionTier,
): boolean {
  return TIER_RANK[normalizeTier(t)] >= TIER_RANK[min];
}

// -------- Autonomia --------
// base       → conservador
// consultor  → equilibrado (balanced)
// pro        → equilibrado (balanced)
// hub / beta → proativo
export const AUTONOMY_CAP_BY_TIER: Record<SubscriptionTier, AutonomyLevel> = {
  base: "conservador",
  consultor: "balanced",
  pro: "balanced",
  hub: "proativo",
};

const AUTONOMY_RANK: Record<AutonomyLevel, number> = {
  conservador: 0,
  balanced: 1,
  proativo: 2,
};

export function isAutonomyLevel(v: unknown): v is AutonomyLevel {
  return typeof v === "string" && v in AUTONOMY_RANK;
}

export function allowedAutonomyLevels(
  tier: string | null | undefined,
): AutonomyLevel[] {
  const cap = AUTONOMY_CAP_BY_TIER[normalizeTier(tier)];
  const capRank = AUTONOMY_RANK[cap];
  return (Object.keys(AUTONOMY_RANK) as AutonomyLevel[]).filter(
    (l) => AUTONOMY_RANK[l] <= capRank,
  );
}

// Aplica o teto: se a preferência guardada é mais alta que o tier permite,
// devolve o teto (sem alterar o valor guardado). Preserva a preferência
// original para quando o consultor voltar a subir de plano.
export function capAutonomy(
  storedLevel: string | null | undefined,
  tier: string | null | undefined,
): AutonomyLevel {
  const t = normalizeTier(tier);
  const cap = AUTONOMY_CAP_BY_TIER[t];
  const cur: AutonomyLevel = isAutonomyLevel(storedLevel) ? storedLevel : cap;
  return AUTONOMY_RANK[cur] > AUTONOMY_RANK[cap] ? cap : cur;
}

// -------- Módulos visíveis --------
// path do menu → tier mínimo requerido.
export const MODULE_MIN_TIER: Record<string, SubscriptionTier> = {
  "/imoveis": "consultor",
  "/prospecao": "consultor",
  "/negocio": "pro",
};

export function isModuleVisible(
  path: string,
  tier: string | null | undefined,
): boolean {
  const min = MODULE_MIN_TIER[path];
  if (!min) return true;
  return tierAtLeast(tier, min);
}

// -------- Canais permitidos --------
// WhatsApp só a partir de 'consultor'. Base fica em Telegram.
export function canUseWhatsApp(tier: string | null | undefined): boolean {
  return tierAtLeast(tier, "consultor");
}

export function tierLabel(t: string | null | undefined): string {
  switch (normalizeTier(t)) {
    case "consultor": return "Consultor";
    case "pro": return "Pro";
    case "hub": return "Hub";
    default: return "Base";
  }
}