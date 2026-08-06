import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { auditAccess } from "@/lib/admin/acessos.functions";

type Role = "consultant" | "support_admin" | "super_admin";

async function assertSuperAdmin(supabase: any, userId: string) {
  const { data } = await supabase.from("user_roles").select("role").eq("user_id", userId);
  const roles = (data ?? []).map((r: any) => r.role as Role);
  if (!roles.includes("super_admin")) throw new Error("Forbidden: super admin only");
}

export type MergeAccount = {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  tier: string;
  is_shadow: boolean;
  channels: string[];
  created_at: string;
};

export type MergePreview = {
  source: MergeAccount;
  target: MergeAccount;
  tables: { table: string; rows: number }[];
  total: number;
};

const SHADOW_RE = /@shadow\.assessor\.local$/i;

function digits(v: string | null | undefined): string {
  return (v ?? "").replace(/\D/g, "");
}

async function loadAccounts(supabaseAdmin: any, ids: string[]): Promise<Map<string, MergeAccount>> {
  const guard = ids.length ? ids : ["00000000-0000-0000-0000-000000000000"];
  const { data: profs } = await supabaseAdmin
    .from("profiles")
    .select("id, name, email, phone, subscription_tier, created_at")
    .in("id", guard);
  const { data: links } = await supabaseAdmin
    .from("channel_links")
    .select("user_id, channel")
    .in("user_id", guard);
  const chan = new Map<string, string[]>();
  (links ?? []).forEach((l: any) => chan.set(l.user_id, [...(chan.get(l.user_id) ?? []), l.channel]));
  const map = new Map<string, MergeAccount>();
  (profs ?? []).forEach((p: any) => {
    map.set(p.id, {
      id: p.id,
      name: p.name ?? null,
      email: p.email ?? null,
      phone: p.phone ?? null,
      tier: p.subscription_tier ?? "base",
      is_shadow: SHADOW_RE.test(p.email ?? ""),
      channels: chan.get(p.id) ?? [],
      created_at: p.created_at,
    });
  });
  return map;
}

// Candidatos: outras contas com o mesmo número, ou o que a pesquisa livre devolver.
export const findMergeCandidates = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ source_user_id: z.string().uuid(), query: z.string().trim().max(120).optional() }).parse(d),
  )
  .handler(async ({ data, context }): Promise<{ source: MergeAccount | null; candidates: MergeAccount[] }> => {
    await assertSuperAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const srcMap = await loadAccounts(supabaseAdmin, [data.source_user_id]);
    const source = srcMap.get(data.source_user_id) ?? null;
    if (!source) return { source: null, candidates: [] };

    const ids = new Set<string>();
    const phone = digits(source.phone);

    if (phone) {
      const { data: byPhone } = await supabaseAdmin
        .from("profiles")
        .select("id")
        .ilike("phone", `%${phone.slice(-9)}%`)
        .neq("id", source.id);
      (byPhone ?? []).forEach((r: any) => ids.add(r.id));
    }

    const q = (data.query ?? "").trim();
    if (q.length >= 2) {
      const { data: byText } = await supabaseAdmin
        .from("profiles")
        .select("id")
        .or(`email.ilike.%${q}%,name.ilike.%${q}%,phone.ilike.%${q}%`)
        .neq("id", source.id)
        .limit(20);
      (byText ?? []).forEach((r: any) => ids.add(r.id));
    }

    const map = await loadAccounts(supabaseAdmin, [...ids]);
    const candidates = [...map.values()].sort((a, b) => Number(a.is_shadow) - Number(b.is_shadow));
    return { source, candidates };
  });

export const previewMerge = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ source_user_id: z.string().uuid(), target_user_id: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }): Promise<MergePreview> => {
    await assertSuperAdmin(context.supabase, context.userId);
    if (data.source_user_id === data.target_user_id) throw new Error("Escolhe duas contas diferentes.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const map = await loadAccounts(supabaseAdmin, [data.source_user_id, data.target_user_id]);
    const source = map.get(data.source_user_id);
    const target = map.get(data.target_user_id);
    if (!source || !target) throw new Error("Conta não encontrada.");

    const { data: rows, error } = await supabaseAdmin.rpc("merge_accounts_preview", {
      _source: data.source_user_id,
    });
    if (error) throw new Error(error.message);
    const tables = ((rows ?? []) as any[]).map((r) => ({ table: r.table_name as string, rows: Number(r.rows) }));
    return { source, target, tables, total: tables.reduce((s, t) => s + t.rows, 0) };
  });

export const applyMerge = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        source_user_id: z.string().uuid(),
        target_user_id: z.string().uuid(),
        reason: z.string().trim().min(3).max(280),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context.supabase, context.userId);
    if (data.source_user_id === data.target_user_id) throw new Error("Escolhe duas contas diferentes.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const before = await loadAccounts(supabaseAdmin, [data.source_user_id, data.target_user_id]);
    const { data: result, error } = await supabaseAdmin.rpc("merge_accounts_apply", {
      _source: data.source_user_id,
      _target: data.target_user_id,
    });
    if (error) throw new Error(error.message);

    const after = await loadAccounts(supabaseAdmin, [data.source_user_id, data.target_user_id]);
    await auditAccess(context.userId, "accounts.merged", {
      target_user_id: data.target_user_id,
      resource_type: "profile",
      resource_id: data.source_user_id,
      reason: data.reason,
      before: {
        source: before.get(data.source_user_id) ?? null,
        target: before.get(data.target_user_id) ?? null,
      },
      after: {
        source: after.get(data.source_user_id) ?? null,
        target: after.get(data.target_user_id) ?? null,
      },
      metadata: { moved: result },
    });

    const { recomputePrimaryChannel } = await import("@/lib/assessor/primary-channel.server");
    await recomputePrimaryChannel(supabaseAdmin, data.target_user_id);

    return { ok: true as const, moved: result };
  });
