import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// Piloto AFONSO 2.0 na administração.
// Papéis: super_admin e support_admin veem; só super_admin (ou o emissor
// designado do piloto) emite e anula. A base de dados volta a verificar tudo
// (`issue_pilot_invite` / `revoke_pilot_invite`): esta página não tem atalho.
// Nunca envia mensagens: o código aparece uma vez para quem o emitiu partilhar.

async function rolesOf(supabase: any, userId: string): Promise<string[]> {
  const { data } = await supabase.from("user_roles").select("role").eq("user_id", userId);
  return (data ?? []).map((r: any) => String(r.role));
}
async function assertAdmin(supabase: any, userId: string) {
  const roles = await rolesOf(supabase, userId);
  if (!roles.includes("super_admin") && !roles.includes("support_admin")) throw new Error("Forbidden: admin only");
}

async function audit(sa: any, adminId: string, action: string, metadata: Record<string, unknown>) {
  await sa.from("admin_audit_logs").insert({
    admin_user_id: adminId, action, target_user_id: null, resource_type: "pilot_invite", metadata,
  } as never);
}

export const getPilotOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin: sa } = await import("@/integrations/supabase/client.server");
    const { PILOT_KEY, PILOT_ENTITLEMENT_FLAG, PILOT_INVITES_FLAG } = await import("./pilot");
    const { canManagePilotInvites } = await import("./pilot-access.server");
    const [pilot, parts, inv, flags] = await Promise.all([
      sa.from("pilots").select("key, status, invite_cap, invite_ttl_days, invite_issuer_user_id").eq("key", PILOT_KEY).maybeSingle(),
      sa.from("pilot_participants").select("user_id, status, source, reason, created_at").eq("pilot_key", PILOT_KEY),
      sa.from("access_invites")
        .select("id, issuer_user_id, status, note, issued_via, expires_at, used_by, used_at, used_channel, created_at")
        .eq("pilot_key", PILOT_KEY).order("created_at", { ascending: false }).limit(50),
      sa.from("feature_flags").select("key, enabled_globally").in("key", [PILOT_ENTITLEMENT_FLAG, PILOT_INVITES_FLAG]),
    ]);
    const ids = new Set<string>();
    for (const r of parts.data ?? []) ids.add(r.user_id);
    for (const r of inv.data ?? []) { if (r.issuer_user_id) ids.add(r.issuer_user_id); if (r.used_by) ids.add(r.used_by); }
    if (pilot.data?.invite_issuer_user_id) ids.add(pilot.data.invite_issuer_user_id);
    const names: Record<string, string> = {};
    if (ids.size) {
      const { data: ps } = await sa.from("profiles").select("id, name").in("id", [...ids]);
      for (const p of ps ?? []) names[p.id] = p.name || "—";
    }
    const invites = (inv.data ?? []).map((r: any) => ({
      ...r,
      issuer_name: r.issuer_user_id ? names[r.issuer_user_id] ?? "—" : "—",
      used_by_name: r.used_by ? names[r.used_by] ?? "—" : null,
      effective_status: r.status === "issued" && new Date(r.expires_at).getTime() <= Date.now() ? "expired" : r.status,
    }));
    const taken = invites.filter((i: any) => i.effective_status === "issued" || i.status === "used").length;
    return {
      pilot: pilot.data
        ? { ...pilot.data, issuer_name: names[pilot.data.invite_issuer_user_id ?? ""] ?? "—" }
        : null,
      participants: (parts.data ?? []).map((r: any) => ({ ...r, name: names[r.user_id] ?? "—" })),
      invites,
      seatsLeft: pilot.data ? Math.max(0, Number(pilot.data.invite_cap) - taken) : 0,
      canManage: await canManagePilotInvites(sa, context.userId),
      flags: flags.data ?? [],
    };
  });

export const issuePilotInviteAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ requestId: z.string().uuid(), note: z.string().trim().max(200).optional() }).parse(d))
  .handler(async ({ context, data }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin: sa } = await import("@/integrations/supabase/client.server");
    const { issuePilotInvite } = await import("./pilot-access.server");
    const r = await issuePilotInvite(sa, {
      issuer: context.userId, idempotencyKey: `admin:${data.requestId}`, note: data.note ?? null, via: "admin",
    });
    await audit(sa, context.userId, "pilot.invite_issue", { outcome: r.outcome, request_id: data.requestId });
    return { outcome: r.outcome, code: r.code, remaining: r.remaining };
  });

export const revokePilotInviteAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin: sa } = await import("@/integrations/supabase/client.server");
    const { revokePilotInvite } = await import("./pilot-access.server");
    const r = await revokePilotInvite(sa, { actor: context.userId, inviteId: data.id });
    await audit(sa, context.userId, "pilot.invite_revoke", { outcome: r, invite_id: data.id });
    return { revoked: r === "revoked" };
  });

// ── Envio direto de convites do piloto (interruptor `pilot.v2_invite_delivery.v1`, desligado) ──

const channelSchema = z.enum(["whatsapp", "telegram"]);

export const listPilotInviteCandidates = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin: sa } = await import("@/integrations/supabase/client.server");
    const { PILOT_KEY } = await import("./pilot");
    const { PILOT_INVITE_DELIVERY_FLAG } = await import("./invite-delivery");
    const { isAccountFlagEnabled } = await import("@/lib/flags/account-flag.server");
    const [acc, parts, dels] = await Promise.all([
      sa.from("account_access").select("user_id, state").in("state", ["registered_waiting", "invited"]).limit(200),
      sa.from("pilot_participants").select("user_id").eq("pilot_key", PILOT_KEY),
      sa.from("pilot_invite_deliveries")
        .select("id, recipient_user_id, channel, status, attempts, error_reason, error_code, last_attempt_at, updated_at")
        .eq("pilot_key", PILOT_KEY).order("updated_at", { ascending: false }).limit(50),
    ]);
    const inPilot = new Set((parts.data ?? []).map((r: any) => r.user_id));
    const ids = new Set<string>();
    for (const r of acc.data ?? []) ids.add(r.user_id);
    for (const r of dels.data ?? []) ids.add(r.recipient_user_id);
    const names: Record<string, string> = {};
    if (ids.size) {
      const { data: ps } = await sa.from("profiles").select("id, name").in("id", [...ids]);
      for (const p of ps ?? []) names[p.id] = p.name || "—";
    }
    return {
      enabled: await isAccountFlagEnabled(sa, PILOT_INVITE_DELIVERY_FLAG, null),
      candidates: (acc.data ?? []).filter((r: any) => !inPilot.has(r.user_id))
        .map((r: any) => ({ user_id: r.user_id, state: r.state, name: names[r.user_id] ?? "—" })),
      deliveries: (dels.data ?? []).map((r: any) => ({ ...r, name: names[r.recipient_user_id] ?? "—" })),
    };
  });

export const previewPilotInviteDeliveryAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ recipientUserId: z.string().uuid(), channel: channelSchema }).parse(d))
  .handler(async ({ context, data }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin: sa } = await import("@/integrations/supabase/client.server");
    const { previewPilotInviteDelivery } = await import("./invite-delivery.server");
    return previewPilotInviteDelivery(sa, { actor: context.userId, ...data });
  });

export const sendPilotInviteAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    recipientUserId: z.string().uuid(),
    channel: channelSchema,
    // Confirmação explícita: o ecrã repete destinatário e canal que o admin viu.
    confirm: z.object({ recipientUserId: z.string().uuid(), channel: channelSchema, confirmed: z.literal(true) }),
  }).parse(d))
  .handler(async ({ context, data }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin: sa } = await import("@/integrations/supabase/client.server");
    const { sendPilotInvite } = await import("./invite-delivery.server");
    const r = await sendPilotInvite(sa, {
      actor: context.userId, recipientUserId: data.recipientUserId, channel: data.channel, confirm: data.confirm,
    });
    // Auditoria sem código, sem contacto.
    await audit(sa, context.userId, "pilot.invite_send", {
      outcome: r.outcome, delivery_id: r.deliveryId ?? null, recipient_user_id: data.recipientUserId, channel: data.channel,
    });
    return r;
  });
