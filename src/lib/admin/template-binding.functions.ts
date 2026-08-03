// Admin: escolher e testar o template WhatsApp aprovado usado na cartela de
// briefing fora da janela de 24h.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertAdmin(supabase: any, userId: string) {
  const { data } = await supabase.from("user_roles").select("role").eq("user_id", userId);
  const roles = ((data as any[]) ?? []).map((r) => r.role);
  if (!roles.includes("super_admin") && !roles.includes("support_admin")) {
    throw new Error("Forbidden: admin only");
  }
}

/** Templates da conta Meta + escolha actual. */
export const getBriefingTemplateSetup = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context as any;
    await assertAdmin(supabase, userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { listMetaTemplates, getTemplateBinding } = await import(
      "@/lib/whatsapp/template-binding.server"
    );
    const [templates, binding] = await Promise.all([
      listMetaTemplates(),
      getTemplateBinding(supabaseAdmin, "meeting_briefing"),
    ]);
    return { templates, binding };
  });

/** Guarda o template escolhido (só super admin muda comportamento de envio). */
export const saveBriefingTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        template_name: z.string().min(1).max(120),
        language: z.string().min(2).max(10).default("pt_PT"),
        param_count: z.number().int().min(0).max(10).default(3),
        enabled: z.boolean().default(false),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any;
    await assertAdmin(supabase, userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { setTemplateBinding } = await import("@/lib/whatsapp/template-binding.server");
    const saved = await setTemplateBinding(supabaseAdmin, {
      purpose: "meeting_briefing",
      template_name: data.template_name,
      language: data.language,
      param_count: data.param_count,
      enabled: data.enabled,
      updated_by: userId,
    });
    await supabaseAdmin.from("admin_audit_logs").insert({
      admin_user_id: userId,
      action: "whatsapp.template_binding.saved",
      resource_type: "whatsapp_template_binding",
      resource_id: "meeting_briefing",
      metadata: saved as any,
    });
    return saved;
  });

/** Compromissos do próprio admin que podem servir de teste real. */
export const listBriefingTestCandidates = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context as any;
    await assertAdmin(supabase, userId);
    const from = new Date(Date.now() - 7 * 86400_000).toISOString();
    const to = new Date(Date.now() + 30 * 86400_000).toISOString();
    const { data } = await supabase
      .from("follow_ups")
      .select("id, title, due_date, due_time, status, person_id, briefing_sent_at, people(name)")
      .eq("user_id", userId)
      .not("person_id", "is", null)
      .gte("due_date", from)
      .lte("due_date", to)
      .order("due_date", { ascending: true })
      .limit(50);
    return ((data as any[]) ?? []).map((r) => ({
      id: r.id as string,
      title: String(r.title ?? ""),
      due_date: r.due_date as string,
      due_time: (r.due_time ?? null) as string | null,
      status: (r.status ?? null) as string | null,
      person: (r.people?.name ?? null) as string | null,
      briefing_sent_at: (r.briefing_sent_at ?? null) as string | null,
    }));
  });

/**
 * Teste real: monta a cartela do compromisso escolhido e envia-a pelo canal
 * principal do próprio admin. `mode: "template"` força o caminho de fora das
 * 24h (template aprovado); "auto" usa a regra normal.
 * Nunca marca o compromisso como já avisado — o envio real continua a acontecer.
 */
export const sendBriefingTemplateTest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      followUpId: z.string().uuid(),
      mode: z.enum(["template", "auto"]).default("template"),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any;
    await assertAdmin(supabase, userId);

    const { data: ev } = await supabase
      .from("follow_ups")
      .select("id, user_id, title, type, due_date, due_time, status, person_id, briefing_sent_at")
      .eq("id", data.followUpId)
      .eq("user_id", userId)
      .maybeSingle();
    if (!ev) throw new Error("Compromisso não encontrado.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { sendMeetingBriefing } = await import(
      "@/lib/assessor/proactive/meeting-briefing.server"
    );
    const r = await sendMeetingBriefing(supabaseAdmin, { ...(ev as any), briefing_sent_at: null }, {
      force: true,
      forceTemplate: data.mode === "template",
      markSent: false,
    });

    await supabaseAdmin.from("admin_audit_logs").insert({
      admin_user_id: userId,
      action: "whatsapp.template_binding.test",
      resource_type: "follow_up",
      resource_id: data.followUpId,
      metadata: { mode: data.mode, ...r } as any,
    });
    return r;
  });
