// Endereço público da app, remetente de email e bot de Telegram por ambiente.
//
// Produção (sem APP_ENV=staging): devolve exatamente os valores de sempre
// (app.meuafonso.com, ola@meuafonso.com, @AfonsoAIbot), por isso a V1 não muda.
// Staging (APP_ENV=staging): nunca devolve um endereço, remetente ou bot de
// produção. Se a configuração de staging faltar ou apontar para produção,
// falha (StagingConfigError) em vez de cair em silêncio nos valores reais.

import {
  deploymentEnv,
  PRODUCTION_BACKEND_REFS,
  PRODUCTION_HOSTS,
  PRODUCTION_PROJECT_ID,
  PRODUCTION_TELEGRAM_BOT,
} from "@/lib/staging/staging-env";

type Env = Record<string, string | undefined>;

export const PRODUCTION_APP_URL = "https://app.meuafonso.com";
export const PRODUCTION_EMAIL_FROM_ADDRESS = "ola@meuafonso.com";
export const PRODUCTION_TELEGRAM_BOT_USERNAME = "AfonsoAIbot";
/** Domínios próprios da produção aceites como "links da app". */
export const PRODUCTION_OWN_HOSTS: readonly string[] = ["app.meuafonso.com", "meuafonso.com"];

export class StagingConfigError extends Error {
  constructor(message: string) {
    super(`[staging] ${message}`);
    this.name = "StagingConfigError";
  }
}

const INTERNAL_HOST_RE = /(^|\.)lovable\.(app|dev)$/i;

/** Lê o ambiente do processo (servidor) ou, no navegador, as variáveis VITE_ públicas. */
export function readRuntimeEnv(): Env {
  if (typeof process !== "undefined" && process?.env) return process.env as Env;
  const vite = ((import.meta as any)?.env ?? {}) as Env;
  return { APP_ENV: vite.VITE_APP_ENV, STAGING_APP_URL: vite.VITE_STAGING_APP_URL };
}

export function isStagingEnv(env: Env = readRuntimeEnv()): boolean {
  return deploymentEnv(env) === "staging";
}

/** true quando o valor refere um domínio, projeto ou backend de produção. */
export function touchesProductionResource(value: string): boolean {
  const v = value.trim().toLowerCase();
  if (!v) return false;
  if (PRODUCTION_BACKEND_REFS.some((r) => v.includes(r)) || v.includes(PRODUCTION_PROJECT_ID)) return true;
  let host = v;
  try { host = new URL(v.includes("://") ? v : `https://${v}`).hostname; } catch { /* usa o texto */ }
  return PRODUCTION_HOSTS.some((h) => host === h || host.endsWith(`.${h}`));
}

function stagingAppUrl(env: Env): string {
  const raw = (env.STAGING_APP_URL || env.APP_PUBLIC_URL || "").trim();
  if (!raw) throw new StagingConfigError("STAGING_APP_URL por definir; não uso o endereço de produção.");
  let u: URL;
  try { u = new URL(raw); } catch { throw new StagingConfigError("STAGING_APP_URL inválido."); }
  const local = u.hostname === "localhost" || u.hostname === "127.0.0.1";
  if (u.protocol !== "https:" && !(local && u.protocol === "http:")) {
    throw new StagingConfigError("STAGING_APP_URL tem de usar https.");
  }
  if (u.username || u.password) throw new StagingConfigError("STAGING_APP_URL não pode ter credenciais.");
  if (touchesProductionResource(raw)) throw new StagingConfigError("STAGING_APP_URL aponta para produção.");
  return `${u.protocol}//${u.host}${u.pathname}`.replace(/\/+$/, "");
}

/**
 * Base dos links enviados ao consultor.
 * Produção: APP_PUBLIC_URL/SITE_URL se for um domínio próprio, senão app.meuafonso.com
 * (regra antiga, inalterada). Staging: STAGING_APP_URL obrigatório e nunca de produção.
 */
export function resolveAppBaseUrl(env: Env = readRuntimeEnv()): string {
  if (isStagingEnv(env)) return stagingAppUrl(env);
  const configured = (env.APP_PUBLIC_URL || env.SITE_URL || "").trim();
  let internal = false;
  try { internal = INTERNAL_HOST_RE.test(new URL(configured).hostname); } catch { internal = /lovable\.(app|dev)/i.test(configured); }
  const usable = configured && !internal ? configured : PRODUCTION_APP_URL;
  return usable.replace(/\/+$/, "");
}

export function appHost(env: Env = readRuntimeEnv()): string {
  return new URL(resolveAppBaseUrl(env)).host.toLowerCase();
}

/** Referência curta ao painel, sem esquema (ex.: "app.meuafonso.com/hoje"). */
export function panelUrlLabel(env: Env = readRuntimeEnv()): string {
  return `${resolveAppBaseUrl(env).replace(/^https?:\/\//, "")}/hoje`;
}

/** Domínios aceites como links da própria app. Em staging só o do staging. */
export function ownAppHosts(env: Env = readRuntimeEnv()): string[] {
  if (isStagingEnv(env)) return [new URL(stagingAppUrl(env)).hostname.toLowerCase()];
  return [...PRODUCTION_OWN_HOSTS];
}

/** Remetente dos emails. Staging exige STAGING_EMAIL_FROM fora do domínio de produção. */
export function emailFrom(brandName: string, env: Env = readRuntimeEnv()): string {
  if (!isStagingEnv(env)) return `${brandName} <${PRODUCTION_EMAIL_FROM_ADDRESS}>`;
  const addr = (env.STAGING_EMAIL_FROM || "").trim().toLowerCase();
  if (!/^[^@\s<>]+@[^@\s<>]+\.[a-z0-9-]+$/i.test(addr)) {
    throw new StagingConfigError("STAGING_EMAIL_FROM por definir ou inválido.");
  }
  const domain = addr.split("@")[1];
  if (domain === "meuafonso.com" || domain.endsWith(".meuafonso.com")) {
    throw new StagingConfigError("o remetente de staging não pode usar o domínio de produção.");
  }
  return `${brandName} (staging) <${addr}>`;
}

/** Nome do bot de Telegram. Staging exige um bot próprio, nunca o de produção. */
export function telegramBotUsername(env: Env = readRuntimeEnv()): string {
  const configured = (env.TELEGRAM_BOT_USERNAME || "").trim().replace(/^@/, "");
  if (!isStagingEnv(env)) return configured || PRODUCTION_TELEGRAM_BOT_USERNAME;
  if (!configured) throw new StagingConfigError("TELEGRAM_BOT_USERNAME por definir; não uso o bot de produção.");
  if (configured.toLowerCase() === PRODUCTION_TELEGRAM_BOT) throw new StagingConfigError("o bot indicado é o de produção.");
  return configured;
}
