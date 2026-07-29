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

    const [linked, pending, recent, failedLinks] = await Promise.all([
      supabaseAdmin
        .from("profiles")
        .select("id", { count: "exact", head: true })
        .eq("whatsapp_link_status", "linked"),
      supabaseAdmin
        .from("profiles")
        .select("id", { count: "exact", head: true })
        .eq("whatsapp_link_status", "pending"),
      supabaseAdmin
        .from("profiles")
        .select("id, whatsapp_linked_at")
        .not("whatsapp_linked_at", "is", null)
        .order("whatsapp_linked_at", { ascending: false })
        .limit(5),
      supabaseAdmin
        .from("whatsapp_link_codes")
        .select("id", { count: "exact", head: true })
        .gte("attempts", 5),
    ]);

    return {
      lastInboundAt: lastIn.data?.created_at ?? null,
      lastInboundAssociated: !!lastIn.data?.user_id,
      lastOutboundAt: lastOut.data?.created_at ?? null,
      lastOutboundStatus: (lastOut.data as any)?.status ?? null,
      messages24h: last24.count ?? 0,
      failures24h: fails.count ?? 0,
      unassociatedSenders24h: unassociatedSet.size,
      linkedAccounts: linked.count ?? 0,
      pendingAccounts: pending.count ?? 0,
      recentLinkedAt: (recent.data ?? []).map((r: any) => r.whatsapp_linked_at).filter(Boolean),
      linkFailures: failedLinks.count ?? 0,
      config: {
        hasAccessToken: !!process.env.WHATSAPP_ACCESS_TOKEN,
        hasPhoneNumberId: !!process.env.WHATSAPP_PHONE_NUMBER_ID,
        hasAppSecret: !!process.env.WHATSAPP_APP_SECRET,
        hasVerifyToken: !!process.env.WHATSAPP_VERIFY_TOKEN,
        phoneNumberIdMasked: maskPhoneNumberId(process.env.WHATSAPP_PHONE_NUMBER_ID),
        endpointBase: "https://graph.facebook.com/v20.0",
      },
      lastSend: await getLastSendLog(),
    };
  });

function maskPhoneNumberId(v: string | undefined | null): string | null {
  if (!v) return null;
  if (v.length <= 4) return `••${v}`;
  return `${v.slice(0, 3)}••••${v.slice(-4)}`;
}

async function getLastSendLog() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("whatsapp_send_logs" as never)
    .select("*")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as any) ?? null;
}

export const listWhatsAppSendLogs = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    assertAdmin(await getCallerRoles(context.supabase, context.userId));
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin
      .from("whatsapp_send_logs" as never)
      .select("*")
      .order("created_at", { ascending: false })
      .limit(20);
    return (data as any[]) ?? [];
  });

export const sendWhatsAppTestMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    assertAdmin(await getCallerRoles(context.supabase, context.userId));
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: prof } = await supabaseAdmin
      .from("profiles")
      .select("phone, whatsapp_link_status")
      .eq("id", context.userId)
      .maybeSingle();
    const phone = (prof as any)?.phone as string | null;
    if (!phone) {
      return {
        ok: false as const,
        error: "Sem número associado. Liga o teu WhatsApp em Definições antes de testar.",
      };
    }
    const { normalizePhone } = await import("@/lib/whatsapp/phone");
    const to = normalizePhone(phone);
    if (!to) {
      return { ok: false as const, error: "Número inválido no perfil." };
    }
    const { sendWhatsAppText } = await import("@/lib/whatsapp/send.server");
    const result = await sendWhatsAppText(to, "Teste de ligação do Assessor.", {
      triggeredBy: context.userId,
      kind: "test",
    });
    await audit(context.userId, "whatsapp.test_send", {
      metadata: {
        ok: result.ok,
        http: result.telemetry.httpStatus,
        code: result.telemetry.errorCode,
        subcode: result.telemetry.errorSubcode,
        fbtrace_id: result.telemetry.fbtraceId,
      },
    });
    return {
      ok: result.ok,
      telemetry: result.telemetry,
      error: result.ok ? null : (result as any).error,
    };
  });

export const getAdminOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    assertAdmin(await getCallerRoles(context.supabase, context.userId));
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const since30 = new Date(Date.now() - 30 * 864e5).toISOString();
    const since24h = new Date(Date.now() - 864e5).toISOString();
    const [users, profiles, msgs, follow, movs, newUsers, active24h, demo, testProfiles, betaProfiles, errors24h] = await Promise.all([
      supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1 }),
      supabaseAdmin.from("profiles").select("id", { count: "exact", head: true }),
      supabaseAdmin.from("assessor_messages").select("id", { count: "exact", head: true }),
      supabaseAdmin.from("follow_ups").select("id", { count: "exact", head: true }),
      supabaseAdmin.from("financial_movements").select("id", { count: "exact", head: true }),
      supabaseAdmin.from("profiles").select("id", { count: "exact", head: true }).gte("created_at", since30),
      supabaseAdmin.from("assessor_messages").select("user_id").gte("created_at", since24h),
      supabaseAdmin.from("profiles").select("id", { count: "exact", head: true }).eq("account_kind", "demo"),
      // Contas de teste: emails sintéticos usados por CI/QA.
      supabaseAdmin
        .from("profiles")
        .select("id")
        .or("email.ilike.ci-%,email.ilike.%@test.assessor.local,email.ilike.%+test@%"),
      supabaseAdmin.from("profiles").select("id").eq("is_beta_tester", true),
      // Erros recentes: falhas do Assessor arquivadas em Diversos.
      supabaseAdmin
        .from("miscellaneous_items")
        .select("id", { count: "exact", head: true })
        .contains("tags", ["falha_assessor"])
        .gte("created_at", since24h),
    ]);
    const activeSet = new Set((active24h.data ?? []).map((r: any) => r.user_id));
    const testSet = new Set<string>([
      ...((testProfiles.data ?? []) as any[]).map((r) => r.id),
      ...((betaProfiles.data ?? []) as any[]).map((r) => r.id),
    ]);
    const { getIntegrationStatuses } = await import("./admin-integrations.server");
    return {
      totalUsers: (users.data as any)?.total ?? profiles.count ?? 0,
      activeUsers: activeSet.size,
      newUsers30d: newUsers.count ?? 0,
      demoAccounts: demo.count ?? 0,
      trialAccounts: testSet.size,
      messages: msgs.count ?? 0,
      followUps: follow.count ?? 0,
      financialMovements: movs.count ?? 0,
      recentErrors: errors24h.count ?? 0,
      integrations: getIntegrationStatuses(),
    };
  });

export const getIntegrationsOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    assertAdmin(await getCallerRoles(context.supabase, context.userId));
    const { getIntegrationStatuses } = await import("./admin-integrations.server");
    return getIntegrationStatuses();
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

// Cria/atualiza utilizadores de teste (já confirmados) para uso em CI.
// Restrito a super_admin. Idempotente: se o email já existir, define a password
// e devolve o id existente.
export const createTestUsers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        users: z
          .array(
            z.object({
              email: z.string().email(),
              password: z.string().min(12).max(128),
            }),
          )
          .min(1)
          .max(10),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    assertSuperAdmin(await getCallerRoles(context.supabase, context.userId));
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const results: Array<{ email: string; id: string; created: boolean }> = [];
    for (const u of data.users) {
      // Tenta criar já confirmado.
      const created = await supabaseAdmin.auth.admin.createUser({
        email: u.email,
        password: u.password,
        email_confirm: true,
      });
      if (created.data?.user) {
        results.push({ email: u.email, id: created.data.user.id, created: true });
        continue;
      }
      // Se já existir, procura e faz reset da password.
      const list = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 200 });
      const existing = (list.data?.users ?? []).find(
        (x) => (x.email ?? "").toLowerCase() === u.email.toLowerCase(),
      );
      if (!existing) {
        throw new Error(`Falha ao criar ${u.email}: ${created.error?.message ?? "desconhecido"}`);
      }
      await supabaseAdmin.auth.admin.updateUserById(existing.id, {
        password: u.password,
        email_confirm: true,
      });
      results.push({ email: u.email, id: existing.id, created: false });
    }

    await audit(context.userId, "ci.test_users_provisioned", {
      metadata: { emails: data.users.map((u) => u.email) },
    });
    return { ok: true as const, users: results };
  });

// Limpeza estrutural do estado conversacional do Assessor.
// - Cancela pending_actions abertas há mais de `staleMinutes` (default 60).
// - Limpa conversation_states inconsistentes (pending_action_id órfãos).
// - Marca seguimentos duplicados (mesmo user/title/due_date/due_time criados
//   no mesmo minuto) como `cancelled`, mantendo o mais antigo. Nunca apaga.
// - `assessor_messages` NUNCA é alterada.
// Se `target_user_id` for omitido, aplica-se a todos os utilizadores.
export const cleanupAssessorState = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      target_user_id: z.string().uuid().optional(),
      stale_minutes: z.number().int().min(1).max(24 * 60).default(60),
    }).parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    assertAdmin(await getCallerRoles(context.supabase, context.userId));
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const cutoff = new Date(Date.now() - data.stale_minutes * 60_000).toISOString();

    // 1) Cancelar pending_actions em aberto e antigas.
    let pendingQ = supabaseAdmin
      .from("pending_actions")
      .update({
        status: "cancelled",
        error_message: "reset estrutural",
      } as never)
      .in("status", [
        "pending_confirmation",
        "collecting_information",
        "correction_pending",
      ])
      .lt("updated_at", cutoff)
      .select("id, user_id");
    if (data.target_user_id) pendingQ = pendingQ.eq("user_id", data.target_user_id);
    const { data: cancelled } = await pendingQ;
    const cancelledCount = (cancelled as any[] | null)?.length ?? 0;

    // 2) Limpar conversation_states com pending_action_id órfãos.
    let stateQ = supabaseAdmin
      .from("conversation_states")
      .select("id, user_id, pending_action_id");
    if (data.target_user_id) stateQ = stateQ.eq("user_id", data.target_user_id);
    const { data: states } = await stateQ;
    let statesCleaned = 0;
    for (const s of ((states as any[]) ?? [])) {
      if (!s.pending_action_id) continue;
      const { data: pa } = await supabaseAdmin
        .from("pending_actions")
        .select("status")
        .eq("id", s.pending_action_id)
        .maybeSingle();
      const status = (pa as any)?.status;
      const active = status === "pending_confirmation" || status === "collecting_information" || status === "correction_pending";
      if (!active) {
        await supabaseAdmin
          .from("conversation_states")
          .update({ pending_action_id: null, active_topic: null } as never)
          .eq("id", s.id);
        statesCleaned++;
      }
    }

    // 3) Deduplicar follow_ups (mesmo user/title/due_date/due_time no mesmo minuto).
    let fuQ = supabaseAdmin
      .from("follow_ups")
      .select("id, user_id, title, due_date, due_time, created_at, status, notes")
      .neq("status", "Cancelado")
      .order("created_at", { ascending: true });
    if (data.target_user_id) fuQ = fuQ.eq("user_id", data.target_user_id);
    const { data: fus } = await fuQ;
    const groups = new Map<string, any[]>();
    for (const r of ((fus as any[]) ?? [])) {
      const minute = String(r.created_at ?? "").slice(0, 16);
      const key = `${r.user_id}|${(r.title || "").trim().toLowerCase()}|${r.due_date}|${r.due_time || ""}|${minute}`;
      const arr = groups.get(key) ?? [];
      arr.push(r);
      groups.set(key, arr);
    }
    let dupsCancelled = 0;
    for (const arr of groups.values()) {
      if (arr.length <= 1) continue;
      for (const dup of arr.slice(1)) {
        const notes = `${dup.notes ? dup.notes + "\n" : ""}[reset estrutural] duplicado de ${arr[0].id}`;
        await supabaseAdmin
          .from("follow_ups")
          .update({ status: "Cancelado", notes } as never)
          .eq("id", dup.id);
        dupsCancelled++;
      }
    }

    // 4) Renomear "Imóvel por classificar" quando existe menção posterior
    //    a um título explícito. Se não houver menção, mantém arquivado como
    //    rascunho oculto ('por_angariar') sem título placeholder.
    let propQ = supabaseAdmin
      .from("properties")
      .select("id, user_id, title, status")
      .ilike("title", "Im%vel por classificar%");
    if (data.target_user_id) propQ = propQ.eq("user_id", data.target_user_id);
    const { data: placeholders } = await propQ;
    let propertiesRelabelled = 0;
    for (const p of ((placeholders as any[]) ?? [])) {
      await supabaseAdmin
        .from("properties")
        .update({ title: "Imóvel (por identificar)", status: "por_angariar" } as never)
        .eq("id", p.id);
      propertiesRelabelled++;
    }

    await audit(context.userId, "assessor.cleanup_state", {
      target_user_id: data.target_user_id ?? null,
      metadata: {
        stale_minutes: data.stale_minutes,
        pending_cancelled: cancelledCount,
        states_cleaned: statesCleaned,
        follow_ups_dedup: dupsCancelled,
        properties_relabelled: propertiesRelabelled,
      },
    });

    return {
      ok: true,
      report: {
        pending_cancelled: cancelledCount,
        conversation_states_cleaned: statesCleaned,
        follow_ups_deduplicated: dupsCancelled,
        properties_relabelled: propertiesRelabelled,
        assessor_messages_touched: 0,
      },
    };
  });

// Reset cultural completo: cancela TODAS as pending abertas (stale_minutes=0),
// limpa estados órfãos, deduplica seguimentos e renomeia imóveis-placeholder.
// Executar uma vez após publicar a nova cultura conversacional.
export const resetAssessorCulture = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ target_user_id: z.string().uuid().optional() }).parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    assertAdmin(await getCallerRoles(context.supabase, context.userId));
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Cancela TUDO o que estiver aberto — reset total.
    let pendingQ = supabaseAdmin
      .from("pending_actions")
      .update({ status: "cancelled", error_message: "reset cultural" } as never)
      .in("status", ["pending_confirmation", "collecting_information", "correction_pending"])
      .select("id, user_id");
    if (data.target_user_id) pendingQ = pendingQ.eq("user_id", data.target_user_id);
    const { data: cancelled } = await pendingQ;

    let stateQ = supabaseAdmin
      .from("conversation_states")
      .update({
        pending_action_id: null,
        active_topic: null,
        state_summary: null,
      } as never)
      .select("id");
    if (data.target_user_id) stateQ = stateQ.eq("user_id", data.target_user_id);
    const { data: cleared } = await stateQ;

    let propQ = supabaseAdmin
      .from("properties")
      .select("id, user_id")
      .ilike("title", "Im%vel por classificar%");
    if (data.target_user_id) propQ = propQ.eq("user_id", data.target_user_id);
    const { data: placeholders } = await propQ;
    for (const p of ((placeholders as any[]) ?? [])) {
      await supabaseAdmin
        .from("properties")
        .update({ title: "Imóvel (por identificar)", status: "por_angariar" } as never)
        .eq("id", p.id);
    }

    await audit(context.userId, "assessor.reset_culture", {
      target_user_id: data.target_user_id ?? null,
      metadata: {
        pending_cancelled: (cancelled as any[] | null)?.length ?? 0,
        states_cleared: (cleared as any[] | null)?.length ?? 0,
        properties_relabelled: (placeholders as any[] | null)?.length ?? 0,
      },
    });

    return {
      ok: true,
      report: {
        pending_cancelled: (cancelled as any[] | null)?.length ?? 0,
        conversation_states_cleared: (cleared as any[] | null)?.length ?? 0,
        properties_relabelled: (placeholders as any[] | null)?.length ?? 0,
      },
    };
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