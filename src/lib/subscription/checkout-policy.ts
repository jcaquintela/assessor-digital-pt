import { PLAN_OFFERS } from "./billing-plans";
import { isStagingEnv, readRuntimeEnv, resolveAppBaseUrl } from "@/lib/env/app-url";

// Regras do servidor para abrir um checkout. O navegador só escolhe entre o
// que está aqui; qualquer outro preço ou endereço de regresso é recusado.

export const CHECKOUT_PRICE_ALLOWLIST: ReadonlySet<string> = new Set(PLAN_OFFERS.map((o) => o.priceId));

export function isCheckoutPriceAllowed(priceId: string | null | undefined): boolean {
  return typeof priceId === "string" && CHECKOUT_PRICE_ALLOWLIST.has(priceId);
}

/** Confirma que o preço devolvido pelo Stripe é o pedido e está vendável. */
export function stripePriceProblem(
  price: { active?: boolean; lookup_key?: string | null; type?: string; currency?: string } | null | undefined,
  requested: string,
): string | null {
  if (!price) return "Price not found";
  if (price.lookup_key !== requested) return "Price mismatch";
  if (price.active === false) return "Price inactive";
  if (price.type && price.type !== "recurring") return "Price is not a subscription";
  if (price.currency && price.currency.toLowerCase() !== "eur") return "Price currency not allowed";
  return null;
}

const PROJECT_ID = "bf908ebc-1146-4c4f-a804-92bbc45c4e1a";
const EXACT_HOSTS = new Set(["app.meuafonso.com", "assessor-digital-pt.lovable.app"]);

export function isAllowedReturnUrl(raw: string | null | undefined, env = readRuntimeEnv()): boolean {
  if (!raw) return false;
  let u: URL;
  try { u = new URL(raw); } catch { return false; }
  if (u.username || u.password) return false;
  if (u.protocol === "http:") return u.hostname === "localhost" || u.hostname === "127.0.0.1";
  if (u.protocol !== "https:") return false;
  const host = u.hostname.toLowerCase();
  if (isStagingEnv(env)) {
    // Staging: só regressa ao próprio staging; os hosts de produção são recusados.
    try { return host === new URL(resolveAppBaseUrl(env)).hostname.toLowerCase(); } catch { return false; }
  }
  if (EXACT_HOSTS.has(host)) return true;
  if (host.includes(PROJECT_ID) && (host.endsWith(".lovable.app") || host.endsWith(".lovableproject.com"))) return true;
  return false;
}

export const CHECKOUT_FLAG = "billing.checkout_enabled.v1";

export type PlanConfigRow = { tier: string; status: string | null; pricing_mode: string | null };

/** Só planos publicados e pagos têm checkout; "sob consulta" nunca. */
export function sellablePriceIds(configs: PlanConfigRow[]): string[] {
  const paid = new Set(configs.filter((c) => c.status === "published" && c.pricing_mode === "paid").map((c) => c.tier));
  return PLAN_OFFERS.filter((o) => paid.has(o.tier)).map((o) => o.priceId);
}

export function onRequestTiers(configs: PlanConfigRow[]): string[] {
  return configs.filter((c) => c.status === "published" && c.pricing_mode === "on_request").map((c) => c.tier);
}

/** Checkout novo só com o interruptor ligado — exceto testes em modo de teste. */
export function checkoutGateProblem(ctx: { flagOn: boolean; env: string; isTestAccount: boolean }): string | null {
  if (ctx.flagOn) return null;
  if (ctx.env === "sandbox" && ctx.isTestAccount) return null;
  return "As novas subscrições estão temporariamente indisponíveis.";
}
