import { PLAN_OFFERS } from "./billing-plans";

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

export function isAllowedReturnUrl(raw: string | null | undefined): boolean {
  if (!raw) return false;
  let u: URL;
  try { u = new URL(raw); } catch { return false; }
  if (u.username || u.password) return false;
  if (u.protocol === "http:") return u.hostname === "localhost" || u.hostname === "127.0.0.1";
  if (u.protocol !== "https:") return false;
  const host = u.hostname.toLowerCase();
  if (EXACT_HOSTS.has(host)) return true;
  if (host.includes(PROJECT_ID) && (host.endsWith(".lovable.app") || host.endsWith(".lovableproject.com"))) return true;
  return false;
}
