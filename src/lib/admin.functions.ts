import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type Role = "consultant" | "support_admin" | "super_admin";

async function getCallerRoles(supabase: any, userId: string): Promise<Role[]> {
  const { data } = await supabase.from("user_roles").select("role").eq("user_id", userId);
  return (data ?? []).map((r: any) => r.role as Role);
}

function assertAdmin(roles: Role[]) {
  if (!roles.includes("super_admin") && !roles.includes("support_admin")) {
    throw new Error("Forbidden: admin only");
  }
}
function assertSuperAdmin(roles: Role[]) {
  if (!roles.includes("super_admin")) throw new Error("Forbidden: super admin only");
}

async function audit(
  adminId: string,
  action: string,
  opts: { target_user_id?: string | null; resource_type?: string | null; resource_id?: string | null; reason?: string | null; metadata?: Record<string, unknown> } = {},
) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  await supabaseAdmin.from("admin_audit_logs").insert({
    admin_user_id: adminId,
    action,
    target_user_id: opts.target_user_id ?? null,
    resource_type: opts.resource_type ?? null,
    resource_id: opts.resource_id ?? null,
    reason: opts.reason ?? null,
    metadata: (opts.metadata ?? {}) as any,
  });
}

export const getMyAdminRole = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const roles = await getCallerRoles(context.supabase, context.userId);
    const role: Role = roles.includes("super_admin")
      ? "super_admin"
      : roles.includes("support_admin")
        ? "support_admin"
        : "consultant";
    return { role, isAdmin: role !== "consultant", userId: context.userId };
  });

export const getWhatsAppStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    assertAdmin(await getCallerRoles(context.supabase, context.userId));
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const since24h = new Date(Date.now() - 864e5).toISOString();

    const [lastIn, lastOut, last24, fails, unassoc] = await Promise.all([
      supabaseAdmin
        .from("assessor_messages")
        .select("created_at, sender_phone, user_id")
        .eq("channel", "whatsapp")
        .eq("role", "user")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabaseAdmin
        .from("assessor_messages")
        .select("created_at, sender_phone, status")
        .eq("channel", "whatsapp")
        .eq("role", "assistant")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabaseAdmin
        .from("assessor_messages")
        .select("id", { count: "exact", head: true })
        .eq("channel", "whatsapp")
        .gte("created_at", since24h),
      supabaseAdmin
        .from("assessor_messages")
        .select("id", { count: "exact", head: true })
        .eq("channel", "whatsapp")
        .eq("role", "assistant")
        .eq("status", "failed")
        .gte("created_at", since24h),
      supabaseAdmin
        .from("assessor_messages")
        .select("sender_phone")
        .eq("channel", "whatsapp")
        .eq("role", "user")
        .is("user_id", null)
        .gte("created_at", since24h),
    ]);

    const unassociatedSet = new Set(
      (unassoc.data ?? []).map((r: any) => r.sender_phone).filter(Boolean),
    );
    return {
      lastInboundAt: lastIn.data?.created_at ?? null,
      lastInboundAssociated: !!lastIn.data?.user_id,
      lastOutboundAt: lastOut.data?.created_at ?? null,
      lastOutboundStatus: (lastOut.data as any)?.status ?? null,
      messages24h: last24.count ?? 0,
      failures24h: fails.count ?? 0,
      unassociatedSenders24h: unassociatedSet.size,
    };
  });

export const getAdminOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    assertAdmin(await getCallerRoles(context.supabase, context.userId));
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const since30 = new Date(Date.now() - 30 * 864e5).toISOString();
    const since24h = new Date(Date.now() - 864e5).toISOString();
    const [users, profiles, msgs, follow, movs, newUsers, active24h] = await Promise.all([
      supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1 }),
      supabaseAdmin.from("profiles").select("id", { count: "exact", head: true }),
      supabaseAdmin.from("assessor_messages").select("id", { count: "exact", head: true }),
      supabaseAdmin.from("follow_ups").select("id", { count: "exact", head: true }),
      supabaseAdmin.from("financial_movements").select("id", { count: "exact", head: true }),
      supabaseAdmin.from("profiles").select("id", { count: "exact", head: true }).gte("created_at", since30),
      supabaseAdmin.from("assessor_messages").select("user_id").gte("created_at", since24h),
    ]);
    const activeSet = new Set((active24h.data ?? []).map((r: any) => r.user_id));
    return {
      totalUsers: (users.data as any)?.total ?? profiles.count ?? 0,
      activeUsers: activeSet.size,
      newUsers30d: newUsers.count ?? 0,
      demoAccounts: 0,
      trialAccounts: 0,
      messages: msgs.count ?? 0,
      followUps: follow.count ?? 0,
      financialMovements: movs.count ?? 0,
      recentErrors: 0,
      integrations: [
        { name: "WhatsApp", status: "planned" },
        { name: "Google Calendar", status: "planned" },
        { name: "Microsoft Outlook", status: "planned" },
        { name: "Stripe", status: "planned" },
        { name: "OpenAI", status: "planned" },
      ],
    };
  });

export const listAdminUsers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    assertAdmin(await getCallerRoles(context.supabase, context.userId));
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: authList } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 200 });
    const users = authList?.users ?? [];
    const ids = users.map((u) => u.id);
    const [{ data: profs }, { data: roles }, { data: msgs }] = await Promise.all([
      supabaseAdmin.from("profiles").select("id, name, phone").in("id", ids.length ? ids : ["00000000-0000-0000-0000-000000000000"]),
      supabaseAdmin.from("user_roles").select("user_id, role").in("user_id", ids.length ? ids : ["00000000-0000-0000-0000-000000000000"]),
      supabaseAdmin.from("assessor_messages").select("user_id, created_at").gte("created_at", new Date(Date.now() - 30 * 864e5).toISOString()),
    ]);
    const profMap = new Map((profs ?? []).map((p: any) => [p.id, p]));
    const roleMap = new Map<string, Role[]>();
    (roles ?? []).forEach((r: any) => {
      const arr = roleMap.get(r.user_id) ?? [];
      arr.push(r.role);
      roleMap.set(r.user_id, arr);
    });
    const usageMap = new Map<string, number>();
    (msgs ?? []).forEach((m: any) => usageMap.set(m.user_id, (usageMap.get(m.user_id) ?? 0) + 1));
    return users.map((u) => {
      const p: any = profMap.get(u.id) ?? {};
      const rs = roleMap.get(u.id) ?? ["consultant"];
      const role: Role = rs.includes("super_admin") ? "super_admin" : rs.includes("support_admin") ? "support_admin" : "consultant";
      return {
        id: u.id,
        email: u.email ?? "",
        name: p.name ?? null,
        phone: p.phone ?? null,
        created_at: u.created_at,
        last_sign_in_at: u.last_sign_in_at ?? null,
        banned: !!(u as any).banned_until,
        role,
        plan: "free",
        calendar_connected: false,
        payment_status: "n/a",
        monthly_usage: usageMap.get(u.id) ?? 0,
      };
    });
  });

const targetSchema = z.object({ target_user_id: z.string().uuid(), reason: z.string().optional() });

function ensureNotSelf(caller: string, target: string) {
  if (caller === target) throw new Error("Não é permitido alterar a sua própria conta.");
}

export const suspendUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => targetSchema.parse(d))
  .handler(async ({ data, context }) => {
    assertSuperAdmin(await getCallerRoles(context.supabase, context.userId));
    ensureNotSelf(context.userId, data.target_user_id);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.auth.admin.updateUserById(data.target_user_id, { ban_duration: "876000h" });
    await audit(context.userId, "user.suspend", { target_user_id: data.target_user_id, reason: data.reason });
    return { ok: true };
  });

export const reactivateUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => targetSchema.parse(d))
  .handler(async ({ data, context }) => {
    assertSuperAdmin(await getCallerRoles(context.supabase, context.userId));
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.auth.admin.updateUserById(data.target_user_id, { ban_duration: "none" });
    await audit(context.userId, "user.reactivate", { target_user_id: data.target_user_id, reason: data.reason });
    return { ok: true };
  });

export const sendPasswordReset = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ email: z.string().email() }).parse(d))
  .handler(async ({ data, context }) => {
    assertAdmin(await getCallerRoles(context.supabase, context.userId));
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.auth.admin.generateLink({ type: "recovery", email: data.email });
    await audit(context.userId, "user.password_reset", { metadata: { email: data.email } });
    return { ok: true };
  });

export const inviteUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ email: z.string().email() }).parse(d))
  .handler(async ({ data, context }) => {
    assertAdmin(await getCallerRoles(context.supabase, context.userId));
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.auth.admin.inviteUserByEmail(data.email);
    await audit(context.userId, "user.invite", { metadata: { email: data.email } });
    return { ok: true };
  });

export const startUserDeletion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => targetSchema.parse(d))
  .handler(async ({ data, context }) => {
    assertSuperAdmin(await getCallerRoles(context.supabase, context.userId));
    ensureNotSelf(context.userId, data.target_user_id);
    await audit(context.userId, "user.deletion_started", { target_user_id: data.target_user_id, reason: data.reason });
    return { ok: true, note: "Processo iniciado. Eliminação definitiva requer confirmação por email." };
  });

export const grantRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      target_user_id: z.string().uuid(),
      role: z.enum(["consultant", "support_admin", "super_admin"]),
      reason: z.string().optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    assertSuperAdmin(await getCallerRoles(context.supabase, context.userId));
    ensureNotSelf(context.userId, data.target_user_id);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("user_roles").insert({
      user_id: data.target_user_id,
      role: data.role,
      created_by: context.userId,
    });
    await audit(context.userId, "role.grant", { target_user_id: data.target_user_id, resource_type: "role", resource_id: data.role, reason: data.reason });
    return { ok: true };
  });

export const revokeRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      target_user_id: z.string().uuid(),
      role: z.enum(["consultant", "support_admin", "super_admin"]),
      reason: z.string().optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    assertSuperAdmin(await getCallerRoles(context.supabase, context.userId));
    ensureNotSelf(context.userId, data.target_user_id);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("user_roles").delete().eq("user_id", data.target_user_id).eq("role", data.role);
    await audit(context.userId, "role.revoke", { target_user_id: data.target_user_id, resource_type: "role", resource_id: data.role, reason: data.reason });
    return { ok: true };
  });

export const listAuditLogs = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    assertAdmin(await getCallerRoles(context.supabase, context.userId));
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin
      .from("admin_audit_logs")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(200);
    return data ?? [];
  });

export const listFeatureFlags = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    assertAdmin(await getCallerRoles(context.supabase, context.userId));
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin.from("feature_flags").select("*").order("key");
    return data ?? [];
  });

export const upsertFeatureFlag = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      key: z.string().min(1),
      description: z.string().optional(),
      enabled_globally: z.boolean().default(false),
      enabled_plans: z.array(z.string()).default([]),
      rollout_percentage: z.number().int().min(0).max(100).default(0),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    assertSuperAdmin(await getCallerRoles(context.supabase, context.userId));
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("feature_flags").upsert({
      key: data.key,
      description: data.description ?? null,
      enabled_globally: data.enabled_globally,
      enabled_plans: data.enabled_plans,
      rollout_percentage: data.rollout_percentage,
      updated_at: new Date().toISOString(),
      updated_by: context.userId,
    });
    await audit(context.userId, "flag.upsert", { resource_type: "feature_flag", resource_id: data.key, metadata: data });
    return { ok: true };
  });

export const markAdminMfaRequired = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ target_user_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    assertSuperAdmin(await getCallerRoles(context.supabase, context.userId));
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("admin_mfa_required").upsert({
      user_id: data.target_user_id,
      required_by: context.userId,
      required_at: new Date().toISOString(),
    });
    await audit(context.userId, "security.mfa_required", { target_user_id: data.target_user_id });
    return { ok: true };
  });

export const listMfaRequired = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    assertAdmin(await getCallerRoles(context.supabase, context.userId));
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin.from("admin_mfa_required").select("*");
    return data ?? [];
  });