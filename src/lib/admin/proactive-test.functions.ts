// Admin: teste controlado de proatividade FORA da janela de 24h + tabela de
// tarifas de template (custo por mensagem) para imputar em COGS.
//
// Objectivo: provar com evidência que um template chega a um consultor cuja
// última mensagem tem mais de 24h — e registar entregue/lido/resposta e custo.

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

/** Consultores com WhatsApp ligado, com o silêncio actual de cada um. */
export const listProactiveTestTargets = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context as any;
    await assertAdmin(supabase, userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { hoursSinceLastInbound } = await import("@/lib/whatsapp/pricing.server");

    const { data: profiles } = await supabaseAdmin
      .from("profiles")
      .select("id, name, email, phone, whatsapp_link_status")
      .eq("whatsapp_link_status", "linked")
      .limit(50);

    const out: any[] = [];
    for (const p of ((profiles as any[]) ?? [])) {
      const hours = await hoursSinceLastInbound(supabaseAdmin, p.id, "whatsapp");
      const { data: ev } = await supabaseAdmin
        .from("follow_ups")
        .select("id, title, due_date, due_time")
        .eq("user_id", p.id)
        .not("person_id", "is", null)
        .order("due_date", { ascending: false })
        .limit(1);
      out.push({
        userId: p.id as string,
        name: (p.name ?? p.email ?? "—") as string,
        phone: (p.phone ?? null) as string | null,
        hoursSinceLastInbound: hours,
        outsideWindow: hours === null ? null : hours > 24,
        followUpId: ((ev as any[]) ?? [])[0]?.id ?? null,
        followUpTitle: ((ev as any[]) ?? [])[0]?.title ?? null,
      });
    }
    out.sort((a, b) => (b.hoursSinceLastInbound ?? -1) - (a.hoursSinceLastInbound ?? -1));
    return out;
  });

/**
 * Envia mesmo o template a um consultor com silêncio > 24h e regista o teste.
 * Só se permite ignorar as 24h com `acknowledgeInsideWindow` — senão o teste
 * não prova nada (dentro da janela a Meta entrega como texto normal).
 */
export const runProactiveTemplateTest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      targetUserId: z.string().uuid(),
      followUpId: z.string().uuid().optional(),
      acknowledgeInsideWindow: z.boolean().default(false),
      notes: z.string().max(500).optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any;
    await assertAdmin(supabase, userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { hoursSinceLastInbound } = await import("@/lib/whatsapp/pricing.server");

    const hours = await hoursSinceLastInbound(supabaseAdmin, data.targetUserId, "whatsapp");
    const outside = hours === null ? true : hours > 24;
    if (!outside && !data.acknowledgeInsideWindow) {
      throw new Error(
        `Este consultor falou contigo há ${Math.round((hours ?? 0) * 10) / 10}h — ainda está dentro da janela de 24h. O teste não provaria nada.`,
      );
    }

    let evQuery = supabaseAdmin
      .from("follow_ups")
      .select("id, user_id, title, type, due_date, due_time, status, person_id")
      .eq("user_id", data.targetUserId)
      .not("person_id", "is", null);
    if (data.followUpId) evQuery = evQuery.eq("id", data.followUpId);
    const { data: evs } = await evQuery.order("due_date", { ascending: false }).limit(1);
    const ev = ((evs as any[]) ?? [])[0];
    if (!ev) throw new Error("Este consultor não tem nenhum compromisso com pessoa associada para servir de teste.");

    const { data: profile } = await supabaseAdmin
      .from("profiles").select("phone").eq("id", data.targetUserId).maybeSingle();

    const { data: test } = await supabaseAdmin
      .from("whatsapp_proactive_tests")
      .insert({
        created_by: userId,
        target_user_id: data.targetUserId,
        purpose: "meeting_briefing",
        to_phone: String((profile as any)?.phone ?? ""),
        hours_since_last_inbound: hours,
        outside_window: outside,
        forced: true,
        status: "pending",
        notes: data.notes ?? null,
      } as never)
      .select("id")
      .maybeSingle();
    const testId = (test as any)?.id as string | undefined;

    const { sendMeetingBriefing } = await import("@/lib/assessor/proactive/meeting-briefing.server");
    const r = await sendMeetingBriefing(supabaseAdmin, { ...(ev as any), briefing_sent_at: null }, {
      force: true,
      forceTemplate: true,
      markSent: false,
      testId: testId ?? null,
    });

    let costEur: number | null = null;
    if (r.logId) {
      const { data: log } = await supabaseAdmin
        .from("whatsapp_send_logs").select("cost_eur").eq("id", r.logId).maybeSingle();
      costEur = ((log as any)?.cost_eur ?? null) as number | null;
    }

    if (testId) {
      await supabaseAdmin.from("whatsapp_proactive_tests").update({
        template_name: r.templateName ?? null,
        template_category: r.templateCategory ?? null,
        send_log_id: r.logId ?? null,
        message_id: r.messageId ?? null,
        cost_eur: costEur,
        status: r.sent ? "sent" : "failed",
      } as never).eq("id", testId);
    }

    await supabaseAdmin.from("admin_audit_logs").insert({
      admin_user_id: userId,
      action: "whatsapp.proactive_test.run",
      target_user_id: data.targetUserId,
      resource_type: "whatsapp_proactive_test",
      resource_id: testId ?? null,
      metadata: { hours, outside, ...r, costEur } as any,
    });

    return { testId: testId ?? null, hoursSinceLastInbound: hours, outsideWindow: outside, costEur, ...r };
  });

/** Histórico dos testes com o resultado real (entregue/lido/resposta). */
export const listProactiveTests = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context as any;
    await assertAdmin(supabase, userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin
      .from("whatsapp_proactive_tests")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(50);
    const rows = ((data as any[]) ?? []);
    const logIds = rows.map((r) => r.send_log_id).filter(Boolean);
    const logs: Record<string, any> = {};
    if (logIds.length) {
      const { data: l } = await supabaseAdmin
        .from("whatsapp_send_logs")
        .select("id, delivery_status, delivered_at, read_at, replied_at, cost_eur, cost_source, ok, error_message")
        .in("id", logIds);
      for (const row of ((l as any[]) ?? [])) logs[row.id] = row;
    }
    return rows.map((r) => ({ ...r, log: r.send_log_id ? logs[r.send_log_id] ?? null : null }));
  });

/* ---------------- Tabela de tarifas ---------------- */

export const listTemplateRates = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context as any;
    await assertAdmin(supabase, userId);
    const { data } = await supabase
      .from("whatsapp_template_rates")
      .select("*")
      .order("effective_from", { ascending: false });
    return ((data as any[]) ?? []);
  });

export const saveTemplateRate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      category: z.enum(["utility", "marketing", "authentication", "service"]),
      country_code: z.string().min(1).max(3),
      price_eur: z.number().min(0).max(10),
      effective_from: z.string().min(8),
      source: z.string().max(200).optional(),
      notes: z.string().max(500).optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any;
    await assertAdmin(supabase, userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: saved } = await supabaseAdmin
      .from("whatsapp_template_rates")
      .upsert({ ...data, updated_by: userId } as never, { onConflict: "category,country_code,effective_from" })
      .select("*")
      .maybeSingle();
    await supabaseAdmin.from("admin_audit_logs").insert({
      admin_user_id: userId,
      action: "whatsapp.template_rate.saved",
      resource_type: "whatsapp_template_rate",
      resource_id: (saved as any)?.id ?? null,
      metadata: data as any,
    });
    return saved;
  });

export const deleteTemplateRate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any;
    await assertAdmin(supabase, userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("whatsapp_template_rates").delete().eq("id", data.id);
    return { ok: true };
  });
