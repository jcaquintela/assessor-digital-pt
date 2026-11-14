// AFONSO 2.0 — ambiente STAGING independente (preparação, sem efeito em produção).
//
// Staging só é considerado isolado quando corre num projeto/backend próprio,
// com credenciais de teste próprias. Este módulo NÃO cria isolamento: apenas
// verifica, a partir das variáveis do processo, se o ambiente onde corre é de
// facto separado da produção e diz o que falta. Sem APP_ENV=staging o
// ambiente é tratado como produção e nada muda no comportamento atual.

type Env = Record<string, string | undefined>;

/** Backend, projeto e endereços da produção (V1). Staging nunca os pode usar. */
export const PRODUCTION_BACKEND_REFS: readonly string[] = ["ydwthwusdlxlgyreulsd"];
export const PRODUCTION_PROJECT_ID = "bf908ebc-1146-4c4f-a804-92bbc45c4e1a";
export const PRODUCTION_HOSTS: readonly string[] = ["app.meuafonso.com", "meuafonso.com", "assessor-digital-pt.lovable.app"];
export const PRODUCTION_TELEGRAM_BOT = "afonsoaibot";

export type DeploymentEnv = "production" | "staging";
export type CheckStatus = "ok" | "fail" | "manual";

export interface StagingCheck {
  id: string;
  status: CheckStatus;
  detail: string;
}

export interface StagingReport {
  env: DeploymentEnv;
  /** true só quando nenhuma verificação falha. "manual" exige confirmação humana registada à parte. */
  isolated: boolean;
  checks: StagingCheck[];
}

const norm = (v: string | undefined) => (v ?? "").trim().toLowerCase();

export function deploymentEnv(env: Env): DeploymentEnv {
  return norm(env.APP_ENV) === "staging" ? "staging" : "production";
}

function touchesProduction(value: string): boolean {
  const v = norm(value);
  if (!v) return false;
  return (
    PRODUCTION_BACKEND_REFS.some((r) => v.includes(r)) ||
    v.includes(PRODUCTION_PROJECT_ID) ||
    PRODUCTION_HOSTS.some((h) => v === h || v.includes(`//${h}`) || v.includes(`.${h}`))
  );
}

/** Lista de destinatários permitidos em staging (números só com dígitos, chat ids). */
export function stagingAllowlist(env: Env): Set<string> {
  return new Set(
    (env.STAGING_ALLOWED_RECIPIENTS ?? "")
      .split(",")
      .map((s) => s.replace(/[^0-9a-z-]/gi, "").toLowerCase())
      .filter(Boolean),
  );
}

/**
 * Em produção devolve sempre true (comportamento atual inalterado).
 * Em staging só deixa sair mensagens para destinatários de teste declarados.
 */
export function isStagingRecipientAllowed(env: Env, recipient: string): boolean {
  if (deploymentEnv(env) !== "staging") return true;
  const key = recipient.replace(/[^0-9a-z-]/gi, "").toLowerCase();
  return key.length > 0 && stagingAllowlist(env).has(key);
}

export function checkStagingIsolation(env: Env): StagingReport {
  const checks: StagingCheck[] = [];
  const add = (id: string, status: CheckStatus, detail: string) => checks.push({ id, status, detail });

  const isStaging = deploymentEnv(env) === "staging";
  add("app_env", isStaging ? "ok" : "fail", isStaging ? "APP_ENV=staging" : "APP_ENV não é staging");

  const backendValues = [env.SUPABASE_URL, env.VITE_SUPABASE_URL, env.SUPABASE_PROJECT_ID, env.VITE_SUPABASE_PROJECT_ID];
  const anyBackend = backendValues.some((v) => norm(v));
  if (!anyBackend) add("backend_separado", "fail", "endereço do backend desconhecido");
  else if (backendValues.some((v) => touchesProduction(v ?? "")))
    add("backend_separado", "fail", "o backend é o da produção");
  else add("backend_separado", "ok", "backend diferente do da produção");

  const liveStripe = Object.entries(env).some(
    ([k, v]) => k.toUpperCase().includes("STRIPE") && (/^(sk|rk|pk)_live_/.test((v ?? "").trim()) || k.toUpperCase().includes("LIVE")),
  );
  add("stripe_so_teste", liveStripe ? "fail" : "ok", liveStripe ? "existe credencial Stripe de produção" : "sem credenciais Stripe de produção");

  const bot = norm(env.TELEGRAM_BOT_USERNAME).replace(/^@/, "");
  if (!bot) add("telegram_bot_teste", "fail", "TELEGRAM_BOT_USERNAME por definir (cairia no bot de produção)");
  else if (bot === PRODUCTION_TELEGRAM_BOT) add("telegram_bot_teste", "fail", "é o bot de produção");
  else add("telegram_bot_teste", "ok", "bot de teste próprio");

  const waDeclared = norm(env.STAGING_WHATSAPP_PHONE_NUMBER_ID);
  const waUsed = norm(env.WHATSAPP_PHONE_NUMBER_ID);
  if (!waUsed && !waDeclared) add("whatsapp_numero_teste", "fail", "sem número WhatsApp de teste");
  else if (!waDeclared || waDeclared !== waUsed)
    add("whatsapp_numero_teste", "fail", "o número usado não é o número de teste declarado");
  else add("whatsapp_numero_teste", "manual", "número de teste declarado; confirmar na Meta que não é o de produção");

  add(
    "destinatarios_restritos",
    stagingAllowlist(env).size > 0 ? "ok" : "fail",
    stagingAllowlist(env).size > 0 ? "envios limitados a destinatários de teste" : "STAGING_ALLOWED_RECIPIENTS vazio",
  );

  const appUrl = norm(env.STAGING_APP_URL);
  if (!appUrl) add("url_staging", "fail", "STAGING_APP_URL por definir");
  else if (touchesProduction(appUrl)) add("url_staging", "fail", "o endereço é o da produção");
  else add("url_staging", "ok", "endereço próprio de staging");

  return { env: isStaging ? "staging" : "production", isolated: checks.every((c) => c.status !== "fail"), checks };
}
