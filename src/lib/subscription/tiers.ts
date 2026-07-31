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
// pro        → proativo
// hub / beta → proativo
export const AUTONOMY_CAP_BY_TIER: Record<SubscriptionTier, AutonomyLevel> = {
  base: "conservador",
  consultor: "balanced",
  pro: "proativo",
  hub: "proativo",
};

export const AUTONOMY_LABEL: Record<AutonomyLevel, string> = {
  conservador: "Conservador",
  balanced: "Equilibrado",
  proativo: "Proativo",
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

// Etiquetas dos módulos que o plano pode abrir/fechar (mesmos paths do menu).
export const MODULE_LABEL: Record<string, string> = {
  "/hoje": "Hoje",
  "/pessoas": "Pessoas",
  "/drive": "Drive",
  "/diversos": "Diversos",
  "/imoveis": "Imóveis",
  "/prospecao": "Prospeção",
  "/negocio": "Faturação",
};

// Resumo do que um plano inclui. Deriva TUDO de MODULE_MIN_TIER e
// AUTONOMY_CAP_BY_TIER — não duplicar estas regras em componentes.
export function planSummary(tier: string | null | undefined): {
  tier: SubscriptionTier;
  autonomyCap: AutonomyLevel;
  autonomyLabel: string;
  modules: { path: string; label: string; available: boolean; min: SubscriptionTier }[];
} {
  const t = normalizeTier(tier);
  const cap = AUTONOMY_CAP_BY_TIER[t];
  return {
    tier: t,
    autonomyCap: cap,
    autonomyLabel: AUTONOMY_LABEL[cap],
    modules: Object.keys(MODULE_LABEL).map((path) => ({
      path,
      label: MODULE_LABEL[path],
      available: isModuleVisible(path, t),
      min: MODULE_MIN_TIER[path] ?? "base",
    })),
  };
}

// -------- Canais permitidos --------
// WhatsApp só a partir de 'consultor'. Base fica em Telegram.
export function canUseWhatsApp(tier: string | null | undefined): boolean {
  return tierAtLeast(tier, "consultor");
}

// Nome visível do plano. O valor guardado na BD continua 'hub' — só a
// etiqueta mostrada ao utilizador/admin muda para "Team".
export const TIER_DISPLAY_NAME: Record<SubscriptionTier, string> = {
  base: "Base",
  consultor: "Consultor",
  pro: "Pro",
  hub: "Team",
};

export function tierLabel(t: string | null | undefined): string {
  return TIER_DISPLAY_NAME[normalizeTier(t)];
}