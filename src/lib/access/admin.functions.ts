import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// Gestão do Early Access pela equipa: convites, lista de espera e funil.
// Nunca envia mensagens: o código é mostrado uma vez para a equipa partilhar.

async function assertAdmin(supabase: any, userId: string) {
  const { data } = await supabase.from("user_roles").select("role").eq("user_id", userId);
  const roles = (data ?? []).map((r: any) => r.role);
  if (!roles.includes("super_admin") && !roles.includes("support_admin")) throw new Error("Forbidden: admin only");
}

async function audit(sa: any, adminId: string, action: string, target: string | null, metadata: Record<string, unknown>) {
  await sa.from("admin_audit_logs").insert({
    admin_user_id: adminId, action, target_user_id: target, resource_type: "early_access", metadata,
  } as never);
}

export const getEarlyAccessOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin: sa } = await import("@/integrations/supabase/client.server");
    const [inv, wl, acc, flags] = await Promise.all([
      sa.from("access_invites")
        .select("id, source, issuer_user_id, status, note, expires_at, used_by, used_at, used_channel, created_at")
        .order("created_at", { ascending: false }).limit(200),
      sa.from("access_waitlist")
        .select("user_id, channel, consent_contact, consent_at, notify, status, created_at")
        .order("created_at", { ascending: false }).limit(200),
      sa.from("account_access").select("user_id, state, source"),
      sa.from("feature_flags").select("key, enabled_globally").like("key", "access.%"),
    ]);
    const ids = new Set<string>();
    for (const r of inv.data ?? []) { if (r.issuer_user_id) ids.add(r.issuer_user_id); if (r.used_by) ids.add(r.used_by); }
    for (const r of wl.data ?? []) ids.add(r.user_id);
    const names: Record<string, string> = {};
    if (ids.size) {
      const { data: ps } = await sa.from("profiles").select("id, name, email").in("id", [...ids]);
      for (const p of ps ?? []) names[p.id] = p.name || p.email || "—";
    }
    const states: Record<string, number> = {};
    for (const r of acc.data ?? []) states[r.state] = (states[r.state] ?? 0) + 1;
    const invites = (inv.data ?? []).map((r: any) => ({
      ...r,
      issuer_name: r.issuer_user_id ? names[r.issuer_user_id] ?? "—" : "Equipa",
      used_by_name: r.used_by ? names[r.used_by] ?? "—" : null,
      effective_status: r.status === "issued" && new Date(r.expires_at).getTime() <= Date.now() ? "expired" : r.status,
    }));
    const funnel = {
      issued: invites.length,
      used: invites.filter((i: any) => i.status === "used").length,
      by_beta_tester: invites.filter((i: any) => i.source === "beta_tester").length,
      waiting: states["registered_waiting"] ?? 0,
      activated: states["activated"] ?? 0,
      trialing: states["trialing"] ?? 0,
      subscribed: states["subscribed"] ?? 0,
    };
    return {
      invites,
      waitlist: (wl.data ?? []).map((r: any) => ({ ...r, name: names[r.user_id] ?? "—" })),
      funnel,
      flags: flags.data ?? [],
    };
  });

export const issueAdminInvite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ note: z.string().max(200).optional() }).parse(d))
  .handler(async ({ context, data }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin: sa } = await import("@/integrations/supabase/client.server");
    const { generateInviteCode, hashInviteCode, INVITE_TTL_DAYS } = await import("./early-access");
    for (let i = 0; i < 3; i++) {
      const code = generateInviteCode();
      const { data: row, error } = await sa.from("access_invites").insert({
        token_hash: await hashInviteCode(code), source: "admin", issuer_user_id: null,
        note: data.note ?? null, expires_at: new Date(Date.now() + INVITE_TTL_DAYS * 864e5).toISOString(),
      } as never).select("id").single();
      if (error && /duplicate|unique/i.test(error.message)) continue;
      if (error) throw new Error(error.message);
      await audit(sa, context.userId, "access.invite_issued", null, { invite_id: (row as any).id, source: "admin" });
      return { code };
    }
    throw new Error("Não foi possível gerar o convite.");
  });

export const revokeAccessInvite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin: sa } = await import("@/integrations/supabase/client.server");
    const { data: rows } = await sa.from("access_invites")
      .update({ status: "revoked", revoked_at: new Date().toISOString(), revoked_by: context.userId } as never)
      .eq("id", data.id).eq("status", "issued").select("id");
    await audit(sa, context.userId, "access.invite_revoked", null, { invite_id: data.id });
    return { revoked: (rows ?? []).length > 0 };
  });

export const grantEarlyAccess = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ userId: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin: sa } = await import("@/integrations/supabase/client.server");
    const now = new Date().toISOString();
    const { data: rows } = await sa.from("account_access")
      .update({ state: "activated", source: "admin", activated_at: now, updated_at: now } as never)
      .eq("user_id", data.userId).in("state", ["registered_waiting", "invited"]).select("user_id");
    await sa.from("access_waitlist").update({ status: "granted", updated_at: now } as never).eq("user_id", data.userId);
    await audit(sa, context.userId, "access.granted", data.userId, {});
    return { granted: (rows ?? []).length > 0 };
  });

export const removeFromWaitlist = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ userId: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin: sa } = await import("@/integrations/supabase/client.server");
    await sa.from("access_waitlist")
      .update({ status: "removed", consent_contact: false, notify: false, updated_at: new Date().toISOString() } as never)
      .eq("user_id", data.userId);
    await audit(sa, context.userId, "access.waitlist_removed", data.userId, {});
    return { ok: true };
  });
