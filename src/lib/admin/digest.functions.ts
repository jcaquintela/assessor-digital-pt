import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { auditAccess } from "./acessos.functions";

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
}
async function assertSuperAdmin(supabase: any, userId: string) {
  const roles = await getRoles(supabase, userId);
  if (!roles.includes("super_admin")) throw new Error("Forbidden: super admin only");
}

export type DigestRow = {
  id: string;
  digest_date: string;
  subject: string;
  body: string;
  status: string;
  body_edited: boolean;
  approved_at: string | null;
  sent_at: string | null;
  recipients_count: number;
  note: string | null;
};

export type TodayDigest = {
  digest: DigestRow | null;
  updates: { title: string; description: string; category: string }[];
  autoBody: string;
  date: string;
  hour: number;
  lockHour: number;
  sendHour: number;
  recipients: { userId: string; name: string | null; email: string }[];
};

/** Rascunho de hoje + novidades acumuladas + quem receberia o email. */
export const getTodayDigest = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<TodayDigest> => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const d = await import("./digest.server");
    const date = d.lisbonDate();
    const { digest, updates, autoBody } = await d.ensureDraft(supabaseAdmin, date);
    const recipients = await d.resolveBetaRecipients(supabaseAdmin);
    return {
      digest: (digest ?? null) as DigestRow | null,
      updates,
      autoBody,
      date,
      hour: d.lisbonHour(),
      lockHour: d.DIGEST_LOCK_HOUR,
      sendHour: d.DIGEST_HOUR,
      recipients,
    };
  });

/** Guardar o texto revisto (e, se pedido, aprovar para envio às 19h). */
export const saveTodayDigest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z
      .object({
        subject: z.string().trim().min(3).max(160),
        body: z.string().trim().max(8000),
        approve: z.boolean().default(false),
      })
      .parse(raw),
  )
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const d = await import("./digest.server");
    const date = d.lisbonDate();
    const { digest } = await d.ensureDraft(supabaseAdmin, date);
    if (!digest) throw new Error("Rascunho indisponível.");
    if (digest.status === "enviado") throw new Error("O resumo de hoje já foi enviado.");
    if (data.approve && !data.body.trim()) {
      throw new Error("Não dá para aprovar um resumo vazio — se hoje não há nada relevante, não aprovas e não sai email.");
    }

    const { error } = await supabaseAdmin
      .from("daily_digests")
      .update({
        subject: data.subject,
        body: data.body,
        body_edited: true,
        status: data.approve ? "aprovado" : "rascunho",
        approved_by: data.approve ? context.userId : null,
        approved_at: data.approve ? new Date().toISOString() : null,
      } as never)
      .eq("id", digest.id);
    if (error) throw new Error(error.message);

    await auditAccess(context.userId, data.approve ? "digest.approved" : "digest.saved", {
      resource_type: "daily_digest",
      resource_id: digest.id,
      before: null,
      after: { date, approved: data.approve },
    });
    return { ok: true, approved: data.approve };
  });

/** Volta a pôr o rascunho em espera (deixa de sair às 19h). */
export const unapproveTodayDigest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertSuperAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const d = await import("./digest.server");
    const date = d.lisbonDate();
    const { digest } = await d.ensureDraft(supabaseAdmin, date);
    if (!digest || digest.status === "enviado") throw new Error("O resumo de hoje já foi enviado.");
    await supabaseAdmin
      .from("daily_digests")
      .update({ status: "rascunho", approved_by: null, approved_at: null } as never)
      .eq("id", digest.id);
    return { ok: true };
  });

/** Enviar já, sem esperar pelas 19h. Continua a exigir aprovação explícita. */
export const sendTodayDigestNow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertSuperAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const d = await import("./digest.server");
    const date = d.lisbonDate();
    const res = await d.sendDigestForDate(supabaseAdmin, date, { actorId: context.userId });
    await auditAccess(context.userId, "digest.sent_manual", {
      resource_type: "daily_digest",
      before: null,
      after: { date, ...res },
    });
    return res;
  });

/** Enviar um email de teste do rascunho só para o próprio admin. */
export const sendDigestTestToMe = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertSuperAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const d = await import("./digest.server");
    const { getEmailProvider } = await import("@/lib/email/provider");
    const { isPlaceholderEmail } = await import("@/lib/profile/email");
    const date = d.lisbonDate();
    const { digest } = await d.ensureDraft(supabaseAdmin, date);
    if (!digest?.body?.trim()) throw new Error("Rascunho vazio — não há nada para testar.");
    const { data: me } = await supabaseAdmin.from("profiles").select("email").eq("id", context.userId).maybeSingle();
    const email = (me as any)?.email as string | undefined;
    if (!email || isPlaceholderEmail(email)) throw new Error("A tua conta não tem email real para receber o teste.");
    const provider = await getEmailProvider();
    if (provider.name === "null") throw new Error("Provider de email não ligado.");
    const res = await provider.send({ to: email, subject: `[teste] ${digest.subject}`, body: digest.body });
    if (!res.success) throw new Error(res.error ?? "envio falhou");
    return { ok: true, email };
  });

/** Histórico dos últimos resumos diários. */
export const listDigests = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<DigestRow[]> => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin
      .from("daily_digests")
      .select("id, digest_date, subject, body, status, body_edited, approved_at, sent_at, recipients_count, note")
      .order("digest_date", { ascending: false })
      .limit(30);
    return (data ?? []) as DigestRow[];
  });
