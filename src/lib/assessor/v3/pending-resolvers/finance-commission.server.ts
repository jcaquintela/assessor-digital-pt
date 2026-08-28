// Atalho determinístico de comissão financeira.
//
// "Recebi a comissão de 3.500€ do negócio do Coelho" é linguagem suficiente
// para registar sem passar pela IA. Vive aqui para o motor não ter de saber
// como se lê dinheiro em português.

import { TOOL_REGISTRY } from "../../v2/domain.server";
import { lisbonYmd } from "../../lisbon-day";
import { logAiTurn } from "../telemetry-repo.server";
import { applySafetyNet } from "../safety-net.server";
import type { PendingResolver } from "./types";

export function parsePtAmount(raw: string | null | undefined): number | null {
  if (!raw) return null;
  const cleaned = raw
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/euros?|eur|€/g, "");
  const multiplier = /k$/.test(cleaned) ? 1000 : /m$/.test(cleaned) ? 1_000_000 : 1;
  const withoutSuffix = cleaned.replace(/[km]$/, "");
  const normalized = withoutSuffix.includes(",")
    ? withoutSuffix.replace(/\./g, "").replace(",", ".")
    : /\.\d{3}(?!\d)/.test(withoutSuffix)
      ? withoutSuffix.replace(/\./g, "")
      : withoutSuffix;
  const value = Number(normalized);
  return Number.isFinite(value) ? Math.round(value * multiplier) : null;
}

export function formatPtMoney(value: number): string {
  return new Intl.NumberFormat("pt-PT", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(value);
}

function todayLisbonYmd(): string {
  return lisbonYmd(new Date());
}

export function extractFinanceCommission(content: string): Record<string, unknown> | null {
  const text = content.trim();
  const lower = text.toLowerCase();
  if (!/\bcomiss(?:ã|a)o|\bcomiss(?:õ|o)es/.test(lower)) return null;
  const commissionRaw = text.match(/comiss(?:ã|a)o(?:\s+[^\d€]{0,30})?\s*(\d[\d.\s]*(?:,\d+)?\s*(?:k€|m€|€|eur|euros?|k\b|m\b)?)/i)?.[1] ?? null;
  const amount = parsePtAmount(commissionRaw);
  if (amount == null) return null;
  const productionRaw = text.match(/produ(?:ç|c)[aã]o(?:\s+de)?\s*(\d[\d.\s]*(?:,\d+)?\s*(?:k€|m€|€|eur|euros?|k\b|m\b)?)/i)?.[1] ?? null;
  const dealRaw = text.match(/neg[óo]cio\s+(?:do|da|de|dos|das)?\s*[^,.;]*?\s+por\s*(\d[\d.\s]*(?:,\d+)?\s*(?:k€|m€|€|eur|euros?|k\b|m\b)?)/i)?.[1]
    ?? text.match(/\bpor\s*(\d[\d.\s]*(?:,\d+)?\s*(?:k€|m€|€|eur|euros?|k\b|m\b)?)/i)?.[1]
    ?? null;
  const productionAmount = parsePtAmount(productionRaw);
  const dealValue = parsePtAmount(dealRaw);
  const propertyReference = text.match(/neg[óo]cio\s+(?:do|da|de|dos|das)\s+([^,.;]+?)(?:\s+por\s|,|$)/i)?.[1]?.trim() ?? null;
  const status = /\b(recebid[ao]|paga|pago)\b/i.test(text)
    ? "Recebida"
    : /\b(faturad[ao]|facturad[ao])\b/i.test(text)
      ? "Faturada"
      : "Prevista";
  const descriptionParts = [
    `Comissão ${propertyReference ? `do ${propertyReference}` : "do negócio"}`,
    dealValue != null ? `valor do negócio ${formatPtMoney(dealValue)}` : null,
    productionAmount != null ? `produção ${formatPtMoney(productionAmount)} + IVA` : null,
  ].filter(Boolean);
  return {
    type: "commission",
    amount,
    description: descriptionParts.join(" · "),
    status,
    movement_date: todayLisbonYmd(),
    category: "Comissão",
    deal_value: dealValue,
    production_amount: productionAmount,
    property_reference: propertyReference,
    opportunity_title: propertyReference ? `Negócio ${propertyReference}` : "Negócio fechado",
  };
}

/** Atalho: regista a comissão directamente e responde com o recibo. */
export const financeCommissionShortcut: PendingResolver = async ({ ctx, supabase, userId, channel, trimmed }) => {
  const commissionArgs = extractFinanceCommission(trimmed);
  if (!commissionArgs) return null;
  const t0 = Date.now();
  const result = await TOOL_REGISTRY.create_financial_movement(ctx, commissionArgs);
  await logAiTurn(supabase, {
    userId, channel, intent: "create_financial_movement_fast_path", route: "v3-deterministic",
    domain: "financial",
    latencyMs: Date.now() - t0, success: !!result.ok, error: result.ok ? null : (result.error ?? null),
    toolName: "create_financial_movement", toolSuccess: !!result.ok, fallbackUsed: !result.ok,
  });
  const amount = Number((commissionArgs as any).amount ?? 0);
  const reference = String((commissionArgs as any).property_reference ?? "negócio");
  if (result.ok && (result.data as any)?.duplicate === true) {
    return {
      reply: `Já tinha uma ${(commissionArgs as any).type === "expense" ? "despesa" : "comissão"} de ${formatPtMoney(amount)} registada hoje. É a mesma ou queres registar outra?`,
    };
  }
  const finReply = await applySafetyNet(ctx, {
    content: trimmed,
    outcome: result.ok ? "executed_ok" : "tool_failed",
    reason: result.error ?? "financial_failed",
    reply: result.ok
      ? `Feito. Registei a comissão de ${formatPtMoney(amount)} no ${reference}.`
      : "Tentei guardar a comissão e não consegui.",
  });
  return { reply: finReply };
};
