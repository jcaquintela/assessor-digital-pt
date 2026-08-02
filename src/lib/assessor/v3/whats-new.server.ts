// Leitura das novidades do produto (últimos 30 dias). Só lê.

import type { DomainContext } from "../v2/domain.server";
import type { ProductUpdate } from "./whats-new";

export async function listRecentProductUpdates(
  ctx: DomainContext,
  days = 30,
): Promise<ProductUpdate[]> {
  const since = new Date(Date.now() - days * 864e5).toISOString().slice(0, 10);
  const { data } = await ctx.supabase
    .from("product_updates" as never)
    .select("released_on, title, description, category")
    .eq("is_published", true)
    .gte("released_on", since)
    .order("released_on", { ascending: false })
    .limit(20);
  return ((data as unknown as ProductUpdate[]) ?? []);
}

/** Última novidade publicada, sem limite de data — usada como fallback. */
export async function lastProductUpdate(ctx: DomainContext): Promise<ProductUpdate | null> {
  const { data } = await ctx.supabase
    .from("product_updates" as never)
    .select("released_on, title, description, category")
    .eq("is_published", true)
    .order("released_on", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as unknown as ProductUpdate) ?? null;
}