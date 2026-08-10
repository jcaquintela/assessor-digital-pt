import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type Role = "consultant" | "support_admin" | "super_admin";

async function getRoles(supabase: any, userId: string): Promise<Role[]> {
  const { data } = await supabase.from("user_roles").select("role").eq("user_id", userId);
  return (data ?? []).map((r: any) => r.role as Role);
}

async function assertAdmin(supabase: any, userId: string) {
  const roles = await getRoles(supabase, userId);
  if (!roles.includes("super_admin") && !roles.includes("support_admin")) {
    throw new Error("Forbidden: admin only");
  }
  return roles;
}

async function assertSuperAdmin(supabase: any, userId: string) {
  const roles = await getRoles(supabase, userId);
  if (!roles.includes("super_admin")) throw new Error("Forbidden: super admin only");
  return roles;
}

// Auditoria obrigatória para criar/alterar/desativar acessos.
export async function auditAccess(
  adminId: string,
  action: string,
  opts: {
    target_user_id?: string | null;
    resource_type?: string | null;
    resource_id?: string | null;
    reason?: string | null;
    before?: unknown;
    after?: unknown;
    metadata?: Record<string, unknown>;
  } = {},
) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  await supabaseAdmin.from("admin_audit_logs").insert({
    admin_user_id: adminId,
    action,
    target_user_id: opts.target_user_id ?? null,
    resource_type: opts.resource_type ?? null,
    resource_id: opts.resource_id ?? null,
    reason: opts.reason ?? null,
    metadata: {
      ...(opts.metadata ?? {}),
      before: opts.before ?? null,
      after: opts.after ?? null,
    } as any,
  } as never);
}

export type AccessUser = {
  id: string;
  email: string;
  name: string | null;
  tier: string;
  is_beta_tester: boolean;
  beta_expires_at: string | null;
  channel: string;
  role: Role;
  state: "active" | "inactive" | "test";
  created_at: string;
  email_confirmed: boolean;
  /** Créditos de IA consumidos nos últimos 30 dias (run usage). */
  credits30d: number;
};

const TEST_MARKERS = ["ci-", "test.assessor.local"];

export const listAccessUsers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<AccessUser[]> => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: authList } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 200 });
    const users = authList?.users ?? [];
    const ids = users.map((u) => u.id);
    const guard = ids.length ? ids : ["00000000-0000-0000-0000-000000000000"];
    const [{ data: profs }, { data: roles }, { data: links }] = await Promise.all([
      supabaseAdmin
        .from("profiles")
        .select("id, name, subscription_tier, is_beta_tester, beta_expires_at, whatsapp_link_status, primary_channel, account_kind")
        .in("id", guard),
      supabaseAdmin.from("user_roles").select("user_id, role").in("user_id", guard),
      supabaseAdmin.from("channel_links").select("user_id, channel").in("user_id", guard),
    ]);
    const profMap = new Map((profs ?? []).map((p: any) => [p.id, p]));
    const roleMap = new Map<string, Role[]>();
    (roles ?? []).forEach((r: any) => {
      roleMap.set(r.user_id, [...(roleMap.get(r.user_id) ?? []), r.role]);
    });
    const linkMap = new Map<string, string>();
    (links ?? []).forEach((l: any) => linkMap.set(l.user_id, l.channel));

    const { aiCostsByUser } = await import("@/lib/admin/ai-costs.server");
    const costMap = await aiCostsByUser(supabaseAdmin, ids, 30);

    return users
      // Contas fundidas deixam de existir para o admin: só fica a conta ativa que
      // recebeu os dados. Continuam acessíveis no histórico de auditoria da fusão.
      .filter((u) => (profMap.get(u.id) as any)?.account_kind !== "merged")
      .map((u) => {
      const p: any = profMap.get(u.id) ?? {};
      const rs = roleMap.get(u.id) ?? ["consultant"];
      const role: Role = rs.includes("super_admin")
        ? "super_admin"
        : rs.includes("support_admin")
          ? "support_admin"
          : "consultant";
      const email = u.email ?? "";
      const isTest = TEST_MARKERS.some((m) => email.includes(m));
      const banned = !!(u as any).banned_until;
      const channel =
        linkMap.get(u.id) === "telegram"
          ? "Telegram"
          : p.whatsapp_link_status === "linked"
            ? "WhatsApp"
            : "—";
      return {
        id: u.id,
        email,
        name: p.name ?? null,
        tier: p.subscription_tier ?? "base",
        is_beta_tester: !!p.is_beta_tester,
        beta_expires_at: p.beta_expires_at ?? null,
        channel,
        role,
        state: banned ? "inactive" : isTest ? "test" : "active",
        created_at: u.created_at,
        email_confirmed: !!((u as any).email_confirmed_at ?? (u as any).confirmed_at),
        credits30d: costMap.get(u.id)?.credits ?? 0,
      } satisfies AccessUser;
    });
  });

// Rede de segurança de onboarding: uma conta convidada por nós nunca deve ficar
// à espera de um email de confirmação que pode cair em spam ou nunca chegar.
export const confirmAccessEmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ target_user_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: before } = await supabaseAdmin.auth.admin.getUserById(data.target_user_id);
    if (before?.user?.email_confirmed_at) return { ok: true, alreadyConfirmed: true };
    const { error } = await supabaseAdmin.auth.admin.updateUserById(data.target_user_id, {
      email_confirm: true,
    });
    if (error) throw new Error(error.message);
    await auditAccess(context.userId, "user.email_confirmed_manually", {
      target_user_id: data.target_user_id,
      resource_type: "auth_user",
      resource_id: data.target_user_id,
      reason: "Conta criada/convidada pela equipa: confirmação manual para desbloquear a entrada.",
      before: { email_confirmed: false },
      after: { email_confirmed: true },
    });
    return { ok: true, alreadyConfirmed: false };
  });

const tierSchema = z.enum(["base", "consultor", "pro", "hub"]);

/* ---------------- Contas possivelmente duplicadas ---------------- */
// Só sinaliza — nunca funde. Homónimos existem; a decisão é humana.

export type DuplicateAccountAlert = {
  key: string;
  name: string;
  reason: "shadow_account" | "same_name_other_channel";
  accounts: {
    id: string;
    email: string;
    name: string | null;
    tier: string;
    channels: string[];
    created_at: string;
    activity: number;
  }[];
};

function normName(v: string | null | undefined): string {
  return (v ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

export const listDuplicateAccountAlerts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<DuplicateAccountAlert[]> => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const [{ data: profs }, { data: links }, { data: msgs }] = await Promise.all([
      supabaseAdmin.from("profiles").select("id, name, email, subscription_tier, created_at, account_kind"),
      supabaseAdmin.from("channel_links").select("user_id, channel"),
      supabaseAdmin.from("assessor_messages").select("user_id"),
    ]);

    const chanMap = new Map<string, string[]>();
    (links ?? []).forEach((l: any) => {
      chanMap.set(l.user_id, [...(chanMap.get(l.user_id) ?? []), l.channel]);
    });
    const actMap = new Map<string, number>();
    (msgs ?? []).forEach((m: any) => {
      if (m.user_id) actMap.set(m.user_id, (actMap.get(m.user_id) ?? 0) + 1);
    });

    const rows = (profs ?? [])
      // Já fundidas: não voltam a aparecer como duplicados a rever.
      .filter((p: any) => p.account_kind !== "merged")
      .map((p: any) => ({
      id: p.id as string,
      email: (p.email ?? "") as string,
      name: (p.name ?? null) as string | null,
      tier: (p.subscription_tier ?? "base") as string,
      channels: chanMap.get(p.id) ?? [],
      created_at: p.created_at as string,
      activity: actMap.get(p.id) ?? 0,
    }));

    const alerts: DuplicateAccountAlert[] = [];

    // 1) Qualquer conta-sombra que ainda exista é, por definição, suspeita.
    for (const r of rows) {
      if (!r.email.endsWith("@shadow.assessor.local")) continue;
      const twins = rows.filter((o) => o.id !== r.id && normName(o.name) && normName(o.name) === normName(r.name));
      alerts.push({
        key: `shadow:${r.id}`,
        name: r.name ?? r.email,
        reason: "shadow_account",
        accounts: [r, ...twins],
      });
    }

    // 2) Mesmo nome em contas distintas com canais diferentes.
    const byName = new Map<string, typeof rows>();
    for (const r of rows) {
      const n = normName(r.name);
      if (!n) continue;
      byName.set(n, [...(byName.get(n) ?? []), r]);
    }
    for (const [n, group] of byName) {
      if (group.length < 2) continue;
      if (group.some((g) => g.email.endsWith("@shadow.assessor.local"))) continue; // já coberto acima
      const channels = new Set(group.flatMap((g) => g.channels));
      if (channels.size < 2) continue;
      alerts.push({
        key: `name:${n}`,
        name: group[0].name ?? n,
        reason: "same_name_other_channel",
        accounts: group,
      });
    }

    return alerts.sort((a, b) => a.name.localeCompare(b.name, "pt"));
  });

const createSchema = z.object({
  email: z.string().trim().email().max(255),
  subscription_tier: tierSchema,
  is_beta_tester: z.boolean().optional(),
  beta_expires_at: z.string().nullable().optional(),
  name: z.string().trim().max(120).optional(),
  // Fluxo único de convite: telefone e canal de envio entram no mesmo passo.
  phone: z.string().trim().max(32).optional().nullable(),
  telegram_id: z.string().trim().max(64).optional().nullable(),
  send_link_channel: z.enum(["whatsapp", "telegram", "nenhum"]).optional(),
  // Preenchido quando o admin escolhe associar a uma conta já existente.
  associate_to_user_id: z.string().uuid().optional().nullable(),
});

export type ExistingAccountMatch = {
  id: string;
  email: string;
  name: string | null;
  tier: string;
  phone: string | null;
  channels: string[];
  isShadow: boolean;
  matchedOn: ("email" | "telefone")[];
};

export type CreateAccessResult =
  | { ok: true; userId: string; associated: boolean; linkEnviado: boolean; canal: string | null; erroEnvio?: string }
  | { ok: false; duplicates: ExistingAccountMatch[] };

// Procura contas já existentes com o mesmo email OU o mesmo telefone.
// Nunca funde nada: só devolve o que existe para o admin decidir.
async function findExistingAccounts(
  supabaseAdmin: any,
  opts: { email?: string | null; phone?: string | null },
): Promise<ExistingAccountMatch[]> {
  const { normalizePhone } = await import("@/lib/whatsapp/phone");
  const email = (opts.email ?? "").trim().toLowerCase() || null;
  const phone = normalizePhone(opts.phone ?? null);
  if (!email && !phone) return [];

  const { data: profs } = await supabaseAdmin
    .from("profiles")
    .select("id, name, email, phone, subscription_tier");
  const rows = (profs ?? []) as any[];

  const { data: links } = await supabaseAdmin.from("channel_links").select("user_id, channel, external_id");
  const chanMap = new Map<string, string[]>();
  const byExternal = new Map<string, string[]>();
  (links ?? []).forEach((l: any) => {
    chanMap.set(l.user_id, [...(chanMap.get(l.user_id) ?? []), l.channel]);
    const digits = normalizePhone(l.external_id);
    if (digits) byExternal.set(digits, [...(byExternal.get(digits) ?? []), l.user_id]);
  });

  const phoneUserIds = new Set(phone ? (byExternal.get(phone) ?? []) : []);

  const matches: ExistingAccountMatch[] = [];
  for (const r of rows) {
    const matchedOn: ("email" | "telefone")[] = [];
    if (email && String(r.email ?? "").trim().toLowerCase() === email) matchedOn.push("email");
    if (phone && (normalizePhone(r.phone) === phone || phoneUserIds.has(r.id))) matchedOn.push("telefone");
    if (!matchedOn.length) continue;
    matches.push({
      id: r.id,
      email: r.email ?? "",
      name: r.name ?? null,
      tier: r.subscription_tier ?? "base",
      phone: r.phone ?? null,
      channels: chanMap.get(r.id) ?? [],
      isShadow: String(r.email ?? "").endsWith("@shadow.assessor.local"),
      matchedOn,
    });
  }
  return matches;
}

// Pré-verificação chamada pelo formulário antes de submeter.
export const findAccountsByContact = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        email: z.string().trim().max(255).optional().nullable(),
        phone: z.string().trim().max(32).optional().nullable(),
      })
      .parse(d ?? {}),
  )
  .handler(async ({ data, context }): Promise<ExistingAccountMatch[]> => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    return findExistingAccounts(supabaseAdmin, data);
  });

// Pré-visualização da mensagem de convite, por canal, antes de enviar.
// Não emite link nem código: mostra o texto exato com marcadores no lugar
// dos valores que só nascem no envio.
export const previewInviteMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        canal: z.enum(["whatsapp", "telegram"]),
        nome: z.string().trim().max(120).optional().nullable(),
        phone: z.string().trim().max(32).optional().nullable(),
      })
      .parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { buildInvitePreview } = await import("@/lib/admin/invite-message.server");
    return buildInvitePreview({ canal: data.canal, nome: data.nome ?? null, phone: data.phone ?? null });
  });

// Emitir o convite a sério para uma conta já criada, sem depender de canal
// ligado: o admin copia o texto (link mágico + número do Afonso + código) e
// envia-o por onde quiser. Reemitir invalida o link anterior por usar.
export type IssuedInvite = {
  texto: string;
  url: string;
  codigo: string | null;
  numeroAfonso: string | null;
  waUrl: string | null;
  enviado: boolean;
  erroEnvio?: string;
  /** Destino confirmado pela Meta/Telegram (número mascarado ou "Telegram"). */
  destino?: string | null;
  /** Como saiu: template aprovado (fora das 24h) ou texto (dentro da janela). */
  via?: "template" | "texto" | null;
};

// O botão "Gerar e enviar pelo Afonso" só pode existir quando há destino
// válido: sem número (ou com número inválido) fica desativado, sem chamada
// nenhuma à API da Meta.
export type InviteSendability = {
  podeEnviar: boolean;
  destino: string | null;
  motivo: string | null;
};

export const checkInviteSendability = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        target_user_id: z.string().uuid(),
        canal: z.enum(["whatsapp", "telegram"]).default("whatsapp"),
      })
      .parse(d),
  )
  .handler(async ({ data, context }): Promise<InviteSendability> => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { resolveInviteTarget } = await import("@/lib/admin/invite-send.server");
    const { maskPhone } = await import("@/lib/whatsapp/invite-template");
    const alvo = await resolveInviteTarget(supabaseAdmin, data.target_user_id, data.canal);
    if (!alvo.externalId) return { podeEnviar: false, destino: null, motivo: alvo.motivo ?? null };
    return {
      podeEnviar: true,
      destino: data.canal === "whatsapp" ? maskPhone(alvo.externalId) : "Telegram",
      motivo: null,
    };
  });


export const issueInviteLink = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        target_user_id: z.string().uuid(),
        canal: z.enum(["whatsapp", "telegram"]).default("whatsapp"),
        enviar: z.boolean().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }): Promise<IssuedInvite> => {
    await assertSuperAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: prof } = await supabaseAdmin
      .from("profiles")
      .select("name, phone")
      .eq("id", data.target_user_id)
      .maybeSingle();
    const nome = (prof as { name?: string | null } | null)?.name ?? null;
    const phoneRaw = (prof as { phone?: string | null } | null)?.phone ?? null;
    const { normalizePhone } = await import("@/lib/whatsapp/phone");
    const phone = data.canal === "whatsapp" ? normalizePhone(phoneRaw) : null;

    const { buildInviteMessage } = await import("@/lib/admin/invite-message.server");
    const convite = await buildInviteMessage(supabaseAdmin, {
      userId: data.target_user_id,
      canal: data.canal,
      nome,
      phone,
      reason: "Link de acesso gerado no admin.",
      issuedBy: context.userId,
    });

    let enviado = false;
    let erroEnvio: string | undefined;
    let destino: string | null = null;
    let via: "template" | "texto" | null = null;
    if (data.enviar) {
      try {
        const { sendInvite } = await import("@/lib/admin/invite-send.server");
        const r = await sendInvite(supabaseAdmin, {
          userId: data.target_user_id,
          canal: data.canal,
          nome,
          texto: convite.texto,
          url: convite.url,
          triggeredBy: context.userId,
        });
        enviado = r.enviado;
        destino = r.destino;
        via = r.via;
        if (!r.enviado) erroEnvio = r.erro ?? "Não foi possível enviar a mensagem.";
        // Falhou? Fica na fila de reenvio (o template pode ainda estar por
        // aprovar) e sai sozinho quando der.
        const { recordInviteAttempt } = await import("@/lib/admin/invite-retry.server");
        await recordInviteAttempt(supabaseAdmin, {
          userId: data.target_user_id,
          canal: data.canal,
          enviado: r.enviado,
          destino: r.destino,
          erro: r.erro ?? null,
          requestedBy: context.userId,
        });
      } catch (e) {
        erroEnvio = e instanceof Error ? e.message : "Não foi possível enviar a mensagem.";
      }
    }

    await auditAccess(context.userId, "access.invite_link_issued", {
      target_user_id: data.target_user_id,
      metadata: { canal: data.canal, enviado, destino, via, erro: erroEnvio ?? null },
    });

    const waUrl =
      phone && data.canal === "whatsapp"
        ? `https://wa.me/${phone.replace(/\D/g, "")}?text=${encodeURIComponent(convite.texto)}`
        : null;

    return { ...convite, waUrl, enviado, destino, via, ...(erroEnvio ? { erroEnvio } : {}) };
  });

// Mesmo mecanismo usado para subir uma conta manualmente a Team/beta:
// cria o utilizador em auth e escreve o tier em profiles. Sem checkout.
export const createAccess = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => createSchema.parse(d))
  .handler(async ({ data, context }): Promise<CreateAccessResult> => {
    await assertSuperAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { normalizePhone } = await import("@/lib/whatsapp/phone");
    const phone = normalizePhone(data.phone ?? null);

    // Nunca duplicamos por acidente: sem escolha explícita do admin, paramos
    // e devolvemos as contas que já existem com este email ou telefone.
    if (!data.associate_to_user_id) {
      const dups = await findExistingAccounts(supabaseAdmin, { email: data.email, phone });
      if (dups.length) return { ok: false, duplicates: dups };
    }

    let userId = data.associate_to_user_id ?? "";
    const associated = !!data.associate_to_user_id;

    if (!associated) {
      const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
        email: data.email,
        email_confirm: true,
        user_metadata: { name: data.name ?? data.email.split("@")[0], source: "admin_created" },
      });
      if (error || !created?.user?.id) {
        throw new Error(error?.message ?? "Não foi possível criar a conta.");
      }
      userId = created.user.id;
    }

    const after = {
      subscription_tier: data.subscription_tier,
      is_beta_tester: data.is_beta_tester ?? false,
      beta_expires_at: data.beta_expires_at || null,
    };
    const profilePatch: Record<string, unknown> = { ...after };
    if (data.name) profilePatch.name = data.name;
    if (phone) {
      profilePatch.phone = phone;
      profilePatch.whatsapp_link_status = "linked";
      profilePatch.whatsapp_linked_at = new Date().toISOString();
      profilePatch.primary_channel = "whatsapp";
    }
    await supabaseAdmin.from("profiles").update(profilePatch as never).eq("id", userId);

    // Liga já todos os canais fornecidos: não é preciso "Converter" nem "Fundir" depois.
    const canaisLigados: string[] = [];
    if (phone) {
      const { error: linkErr } = await supabaseAdmin
        .from("channel_links")
        .upsert(
          { user_id: userId, channel: "whatsapp", external_id: phone, display_name: data.name ?? null } as never,
          { onConflict: "channel,external_id" },
        );
      if (!linkErr) canaisLigados.push("whatsapp");
    }
    if (data.telegram_id) {
      const { error: tgErr } = await supabaseAdmin
        .from("channel_links")
        .upsert(
          { user_id: userId, channel: "telegram", external_id: data.telegram_id, display_name: data.name ?? null } as never,
          { onConflict: "channel,external_id" },
        );
      if (!tgErr) canaisLigados.push("telegram");
    }

    await auditAccess(context.userId, "user.access_created", {
      target_user_id: userId,
      resource_type: "profile",
      resource_id: userId,
      before: null,
      after: { email: data.email, ...after, phone, canais: canaisLigados, associado: associated },
    });

    // Um único link de acesso, no domínio de produção, pelo canal escolhido.
    const canalEnvio = data.send_link_channel && data.send_link_channel !== "nenhum" ? data.send_link_channel : null;
    let linkEnviado = false;
    let erroEnvio: string | undefined;
    if (canalEnvio) {
      try {
        const { data: link } = await supabaseAdmin
          .from("channel_links")
          .select("external_id")
          .eq("user_id", userId)
          .eq("channel", canalEnvio)
          .maybeSingle();
        const externalId = (link as { external_id?: string } | null)?.external_id;
        if (!externalId) {
          erroEnvio = `Não há ${canalEnvio} ligado a esta conta para enviar o link.`;
        } else {
          // Convite completo: link mágico + número do Afonso + código de acesso.
          const { buildInviteMessage } = await import("@/lib/admin/invite-message.server");
          const convite = await buildInviteMessage(supabaseAdmin, {
            userId,
            canal: canalEnvio,
            nome: data.name ?? null,
            phone: canalEnvio === "whatsapp" ? phone : null,
            reason: associated ? "Convite: canal associado a conta existente." : "Convite: conta criada pela equipa.",
            issuedBy: context.userId,
          });
          const { sendReplyForChannel } = await import("@/lib/assessor/channels.server");
          await sendReplyForChannel(canalEnvio as any, externalId, convite.texto);
          linkEnviado = true;
        }
      } catch (e) {
        erroEnvio = e instanceof Error ? e.message : "Não foi possível enviar o link.";
      }
    }

    return { ok: true, userId, associated, linkEnviado, canal: canalEnvio, ...(erroEnvio ? { erroEnvio } : {}) };
  });

const updateSchema = z.object({
  target_user_id: z.string().uuid(),
  subscription_tier: tierSchema.optional(),
  is_beta_tester: z.boolean().optional(),
  beta_expires_at: z.string().nullable().optional(),
  reason: z.string().max(280).optional(),
});

export const updateAccess = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => updateSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: before } = await supabaseAdmin
      .from("profiles")
      .select("subscription_tier, is_beta_tester, beta_expires_at")
      .eq("id", data.target_user_id)
      .maybeSingle();

    const patch: Record<string, unknown> = {};
    if (data.subscription_tier !== undefined) patch.subscription_tier = data.subscription_tier;
    if (data.is_beta_tester !== undefined) patch.is_beta_tester = data.is_beta_tester;
    if (data.beta_expires_at !== undefined) patch.beta_expires_at = data.beta_expires_at || null;
    if (!Object.keys(patch).length) return { ok: true, unchanged: true };

    const { error } = await supabaseAdmin
      .from("profiles")
      .update(patch as never)
      .eq("id", data.target_user_id);
    if (error) throw new Error(error.message);

    await auditAccess(context.userId, "user.access_updated", {
      target_user_id: data.target_user_id,
      resource_type: "profile",
      resource_id: data.target_user_id,
      reason: data.reason ?? null,
      before: before ?? null,
      after: { ...(before ?? {}), ...patch },
    });

    // Subiu de base para plano pago: avisa pelo canal principal.
    if (data.subscription_tier !== undefined) {
      const beforeTier = String((before as any)?.subscription_tier ?? "");
      const afterTier = String(data.subscription_tier ?? "");
      if (beforeTier !== afterTier) {
        const { recordSubscriptionEvent } = await import("@/lib/subscription/events.server");
        const paid = (t: string) => t === "consultor" || t === "pro" || t === "hub";
        if (!paid(beforeTier) && paid(afterTier)) {
          await recordSubscriptionEvent(supabaseAdmin, {
            userId: data.target_user_id, event: "base_to_paid",
            fromTier: beforeTier, toTier: afterTier, source: "admin",
          });
        } else if (paid(beforeTier) && !paid(afterTier)) {
          await recordSubscriptionEvent(supabaseAdmin, {
            userId: data.target_user_id, event: "paid_to_base",
            fromTier: beforeTier, toTier: afterTier, source: "admin",
          });
        }
      }
      const { isUpgradeToPaid, notifyPlanActivatedSafe } = await import(
        "@/lib/subscription/plan-activated.server"
      );
      if (isUpgradeToPaid((before as any)?.subscription_tier, data.subscription_tier)) {
        await notifyPlanActivatedSafe(supabaseAdmin, data.target_user_id, data.subscription_tier);
        const { startWhatsAppTrialIfEligibleSafe } = await import("@/lib/subscription/trial.server");
        await startWhatsAppTrialIfEligibleSafe(supabaseAdmin, data.target_user_id, data.subscription_tier);
      }
    }
    return { ok: true };
  });

const deactivateSchema = z.object({
  target_user_id: z.string().uuid(),
  reason: z.string().max(280).optional(),
});

// "Eliminar" = desativar. A conta perde acesso, os dados ficam.
// Hard-delete não está implementado de propósito.
export const deactivateAccess = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => deactivateSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context.supabase, context.userId);
    if (context.userId === data.target_user_id) {
      throw new Error("Não é permitido desativar a sua própria conta.");
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.auth.admin.updateUserById(data.target_user_id, {
      ban_duration: "876000h",
    });
    if (error) throw new Error(error.message);
    await auditAccess(context.userId, "user.access_deactivated", {
      target_user_id: data.target_user_id,
      resource_type: "auth_user",
      resource_id: data.target_user_id,
      reason: data.reason ?? null,
      before: { state: "active" },
      after: { state: "inactive", data_retained: true },
    });
    return { ok: true };
  });

export const reactivateAccess = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => deactivateSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.auth.admin.updateUserById(data.target_user_id, {
      ban_duration: "none",
    });
    if (error) throw new Error(error.message);
    await auditAccess(context.userId, "user.access_reactivated", {
      target_user_id: data.target_user_id,
      resource_type: "auth_user",
      resource_id: data.target_user_id,
      reason: data.reason ?? null,
      before: { state: "inactive" },
      after: { state: "active" },
    });
    return { ok: true };
  });

// ------------------------------ Códigos promocionais ----------------------

export type PromoCodeRow = {
  id: string;
  code: string;
  grants_tier: string;
  max_uses: number;
  used_count: number;
  expires_at: string | null;
  active: boolean;
  note: string | null;
  created_at: string;
};

export const listPromoCodes = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<PromoCodeRow[]> => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin
      .from("promo_codes")
      .select("id, code, grants_tier, max_uses, used_count, expires_at, active, note, created_at")
      .order("created_at", { ascending: false });
    return (data ?? []) as PromoCodeRow[];
  });

export const createPromoCode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        code: z.string().trim().min(3).max(40).regex(/^[A-Za-z0-9._-]+$/, "Código inválido"),
        grants_tier: tierSchema,
        max_uses: z.number().int().min(1).max(10000),
        expires_at: z.string().nullable().optional(),
        note: z.string().trim().max(160).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const code = data.code.toUpperCase();
    const { error } = await supabaseAdmin.from("promo_codes").insert({
      code,
      grants_tier: data.grants_tier,
      max_uses: data.max_uses,
      expires_at: data.expires_at || null,
      note: data.note || null,
      created_by: context.userId,
    } as never);
    if (error) throw new Error(error.message.includes("duplicate") ? "Já existe um código com esse nome." : error.message);
    await auditAccess(context.userId, "promo_code.created", {
      resource_type: "promo_code",
      resource_id: code,
      before: null,
      after: { code, grants_tier: data.grants_tier, max_uses: data.max_uses, expires_at: data.expires_at || null },
    });
    return { ok: true };
  });

export const revokePromoCode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: before } = await supabaseAdmin
      .from("promo_codes")
      .select("code, active")
      .eq("id", data.id)
      .maybeSingle();
    const { error } = await supabaseAdmin
      .from("promo_codes")
      .update({ active: false } as never)
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    await auditAccess(context.userId, "promo_code.revoked", {
      resource_type: "promo_code",
      resource_id: (before as any)?.code ?? data.id,
      before: before ?? null,
      after: { ...(before ?? {}), active: false },
    });
    return { ok: true };
  });

// ── Convites por reenviar ──────────────────────────────────────────────────
// Tudo o que falhou (tipicamente template ainda por aprovar) fica numa fila
// visível no admin, com "Reenviar" à mão e reenvio automático quando o
// template for aprovado.

export type PendingInviteRow = {
  id: string;
  user_id: string;
  nome: string | null;
  email: string | null;
  canal: "whatsapp" | "telegram";
  status: string;
  reason: string | null;
  destino: string | null;
  attempts: number;
  last_attempt_at: string;
};

export const listPendingInvites = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<PendingInviteRow[]> => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin
      .from("invite_send_attempts")
      .select("id, user_id, canal, status, reason, destino, attempts, last_attempt_at")
      .in("status", ["pendente", "esgotado"])
      .order("last_attempt_at", { ascending: false })
      .limit(100);
    const rows = (data ?? []) as Array<Omit<PendingInviteRow, "nome" | "email">>;
    if (!rows.length) return [];
    const { data: profs } = await supabaseAdmin
      .from("profiles")
      .select("id, name, email")
      .in("id", rows.map((r) => r.user_id));
    const byId = new Map(
      ((profs ?? []) as Array<{ id: string; name: string | null; email: string | null }>).map((p) => [p.id, p]),
    );
    return rows.map((r) => ({
      ...r,
      nome: byId.get(r.user_id)?.name ?? null,
      email: byId.get(r.user_id)?.email ?? null,
    }));
  });

export const resendInvite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row } = await supabaseAdmin
      .from("invite_send_attempts")
      .select("user_id, canal")
      .eq("id", data.id)
      .maybeSingle();
    const alvo = row as { user_id: string; canal: "whatsapp" | "telegram" } | null;
    if (!alvo) throw new Error("Convite já não está na fila.");

    const { retryInvite } = await import("@/lib/admin/invite-retry.server");
    const r = await retryInvite(supabaseAdmin, {
      userId: alvo.user_id,
      canal: alvo.canal,
      requestedBy: context.userId,
    });
    await auditAccess(context.userId, "access.invite_resent", {
      target_user_id: alvo.user_id,
      metadata: { canal: alvo.canal, enviado: r.enviado, erro: r.erro ?? null },
    });
    return r;
  });

export const cancelPendingInvite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row } = await supabaseAdmin
      .from("invite_send_attempts")
      .select("user_id")
      .eq("id", data.id)
      .maybeSingle();
    await supabaseAdmin.from("invite_send_attempts").update({ status: "cancelado" }).eq("id", data.id);
    await auditAccess(context.userId, "access.invite_cancelled", {
      target_user_id: (row as { user_id?: string } | null)?.user_id ?? null,
      metadata: { id: data.id },
    });
    return { ok: true };
  });

// Enquanto o template da Meta não está aprovado, o admin precisa de uma saída
// à mão: gera-se o convite (link novo, o anterior por usar deixa de servir) e
// devolve-se o texto pronto a copiar e um link wa.me para enviar do telemóvel.
export type ManualInvite = {
  texto: string;
  url: string;
  waUrl: string | null;
  /** Só dígitos, para reconstruir o link wa.me depois de o admin editar o texto. */
  waNumber: string | null;
  destino: string | null;
  /** Assinatura do template aprovado na Meta: muda quando o texto do template muda. */
  templateVersion: string | null;
};

// Assinatura do template de convite tal como está aprovado na Meta. Serve
// para detetar que o texto mudou e regerar o convite em vez de reaproveitar
// um rascunho desatualizado.
async function inviteTemplateVersion(): Promise<string | null> {
  const { listMetaTemplates } = await import("@/lib/whatsapp/template-binding.server");
  const { TEMPLATE_INVITE } = await import("@/lib/whatsapp/invite-template");
  const t = (await listMetaTemplates()).find((x) => x.name === TEMPLATE_INVITE);
  if (!t) return null;
  const raw = `${t.status}|${t.language}|${t.body}`;
  let h = 5381;
  for (let i = 0; i < raw.length; i++) h = ((h * 33) ^ raw.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

export const getInviteTemplateVersion = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ version: string | null }> => {
    await assertAdmin(context.supabase, context.userId);
    return { version: await inviteTemplateVersion() };
  });

export const prepareManualInvite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }): Promise<ManualInvite> => {
    await assertSuperAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row } = await supabaseAdmin
      .from("invite_send_attempts")
      .select("user_id, canal")
      .eq("id", data.id)
      .maybeSingle();
    const alvo = row as { user_id: string; canal: "whatsapp" | "telegram" } | null;
    if (!alvo) throw new Error("Convite já não está na fila.");

    const { data: prof } = await supabaseAdmin
      .from("profiles")
      .select("name, phone")
      .eq("id", alvo.user_id)
      .maybeSingle();
    const nome = (prof as { name?: string | null } | null)?.name ?? null;
    const { normalizePhone } = await import("@/lib/whatsapp/phone");
    const phone = alvo.canal === "whatsapp" ? normalizePhone((prof as { phone?: string | null } | null)?.phone ?? null) : null;

    const { buildInviteMessage } = await import("@/lib/admin/invite-message.server");
    const convite = await buildInviteMessage(supabaseAdmin, {
      userId: alvo.user_id,
      canal: alvo.canal,
      nome,
      phone,
      reason: "Convite preparado para envio manual (template pendente).",
      issuedBy: context.userId,
    });

    const { maskPhone } = await import("@/lib/whatsapp/invite-template");
    await auditAccess(context.userId, "access.invite_manual_prepared", {
      target_user_id: alvo.user_id,
      metadata: { canal: alvo.canal, id: data.id },
    });

    return {
      texto: convite.texto,
      url: convite.url,
      waUrl: phone ? `https://wa.me/${phone.replace(/\D/g, "")}?text=${encodeURIComponent(convite.texto)}` : null,
      waNumber: phone ? phone.replace(/\D/g, "") : null,
      destino: phone ? maskPhone(phone) : null,
      templateVersion: await inviteTemplateVersion(),
    };
  });
