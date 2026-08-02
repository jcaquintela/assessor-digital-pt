// Ficha completa do imóvel: tudo o que existe à volta deste imóvel — negócio
// ligado, valores, interessados, visitas, propostas, marketing, custos e notas.
// Os dois caminhos (conversa e dashboard) escrevem nos mesmos registos.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type Row = Record<string, any>;

async function linkedDealId(supabase: any, userId: string, propertyId: string): Promise<string | null> {
  const { data: links } = await supabase
    .from("opportunity_properties")
    .select("opportunity_id, role")
    .eq("user_id", userId)
    .eq("property_id", propertyId)
    .limit(10);
  const rows = (links ?? []) as Row[];
  const principal = rows.find((r) => (r.role ?? "principal") === "principal") ?? rows[0];
  if (principal) return principal.opportunity_id as string;
  const { data: legacy } = await supabase
    .from("opportunities")
    .select("id")
    .eq("user_id", userId)
    .eq("property_id", propertyId)
    .limit(1)
    .maybeSingle();
  return (legacy as Row | null)?.id ?? null;
}

function isVisit(f: Row): boolean {
  const t = `${f.type ?? ""} ${f.title ?? ""}`.toLowerCase();
  return /visit/.test(t);
}

export function visitState(f: Row): "feita" | "cancelada" | "agendada" {
  const s = String(f.status ?? "").toLowerCase();
  if (s.startsWith("cancel")) return "cancelada";
  if (s.startsWith("conclu") || s === "done" || s === "feito" || f.outcome_recorded_at) return "feita";
  return "agendada";
}

/** Tudo o que a ficha do imóvel mostra, numa só chamada. */
export const getPropertyDossier = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { id: string }) => data)
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const { data: prop, error } = await supabase
      .from("properties").select("*").eq("id", data.id).eq("user_id", userId).maybeSingle();
    if (error) throw new Error(error.message);
    if (!prop) return null;
    const p = prop as Row;

    const dealId = await linkedDealId(supabase, userId, data.id);

    const [dealRes, ownerRes, interestsRes, fupsRes, offersRes, mktRes, costsRes, notesRes] = await Promise.all([
      dealId
        ? supabase.from("opportunities").select("id, title, stage, deal_kind, type, value, archived_at, stage_changed_at").eq("id", dealId).eq("user_id", userId).maybeSingle()
        : Promise.resolve({ data: null } as any),
      p.owner_person_id
        ? supabase.from("people").select("id, name, phone, email, relationship_type").eq("id", p.owner_person_id).eq("user_id", userId).maybeSingle()
        : Promise.resolve({ data: null } as any),
      supabase.from("property_interests").select("*").eq("user_id", userId).eq("property_id", data.id).order("created_at", { ascending: false }),
      supabase.from("follow_ups")
        .select("id, title, type, due_date, due_time, status, notes, person_id, outcome, outcome_recorded_at")
        .eq("user_id", userId).eq("related_property_id", data.id)
        .order("due_date", { ascending: false }).limit(100),
      supabase.from("property_offers").select("*").eq("user_id", userId).eq("property_id", data.id).order("offer_date", { ascending: false }),
      supabase.from("property_marketing_activities").select("*").eq("user_id", userId).eq("property_id", data.id).order("created_at", { ascending: false }),
      supabase.from("financial_movements")
        .select("id, type, description, amount, status, movement_date")
        .eq("user_id", userId).eq("property_id", data.id).order("movement_date", { ascending: false }),
      supabase.from("interactions")
        .select("id, original_content, summary, occurred_at, source_channel")
        .eq("user_id", userId).eq("property_id", data.id).order("occurred_at", { ascending: false }).limit(50),
    ]);

    const fups = (fupsRes.data ?? []) as Row[];
    const peopleIds = new Set<string>();
    for (const f of fups) if (f.person_id) peopleIds.add(f.person_id);
    for (const o of (offersRes.data ?? []) as Row[]) if (o.person_id) peopleIds.add(o.person_id);
    const names = new Map<string, string>();
    if (peopleIds.size) {
      const { data: ppl } = await supabase.from("people").select("id, name").in("id", [...peopleIds]).eq("user_id", userId);
      for (const r of (ppl ?? []) as Row[]) names.set(r.id, r.name);
    }

    const offers = ((offersRes.data ?? []) as Row[]).map((o) => ({
      id: o.id,
      amount: Number(o.amount ?? 0),
      from: o.from_name || (o.person_id ? names.get(o.person_id) ?? null : null),
      personId: o.person_id ?? null,
      date: o.offer_date,
      status: String(o.status ?? "pendente"),
      notes: o.notes ?? null,
    }));
    const pendenteOuAceite = offers.filter((o) => o.status === "aceite")[0] ?? offers.filter((o) => o.status === "pendente")[0] ?? null;

    return {
      property: p,
      dealId,
      deal: (dealRes as any)?.data ?? null,
      owner: (ownerRes as any)?.data ?? null,
      interests: ((interestsRes.data ?? []) as Row[]).map((i) => ({
        id: i.id, name: i.name, contact: i.contact ?? null, source: i.source ?? null,
        status: String(i.status ?? "a_contactar"), personId: i.person_id ?? null, createdAt: i.created_at,
      })),
      visits: fups.filter(isVisit).map((f) => ({
        id: f.id,
        title: f.title,
        who: f.person_id ? names.get(f.person_id) ?? null : null,
        personId: f.person_id ?? null,
        dueAt: f.due_date,
        dueTime: f.due_time ?? null,
        state: visitState(f),
      })),
      followUps: fups.filter((f) => !isVisit(f)).map((f) => ({
        id: f.id, title: f.title, dueAt: f.due_date, dueTime: f.due_time ?? null, status: f.status,
      })),
      offers,
      currentOffer: pendenteOuAceite ? pendenteOuAceite.amount : null,
      marketing: ((mktRes.data ?? []) as Row[]).map((m) => ({
        id: m.id, title: m.title, status: String(m.status ?? "por_fazer"), doneAt: m.done_at ?? null, notes: m.notes ?? null,
      })),
      costs: ((costsRes.data ?? []) as Row[]).map((c) => ({
        id: c.id, description: c.description ?? "Despesa", amount: Number(c.amount ?? 0),
        date: c.movement_date, status: c.status, type: c.type,
      })),
      notes: ((notesRes.data ?? []) as Row[]).map((n) => ({
        id: n.id, content: n.summary || n.original_content, at: n.occurred_at, channel: n.source_channel,
      })),
    };
  });

export type PropertyDossier = NonNullable<Awaited<ReturnType<typeof getPropertyDossier>>>;

// ---- Escritas -----------------------------------------------------------

export const addPropertyInterest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { propertyId: string; name: string; contact?: string; source?: string; status?: string }) => {
    if (!d.name?.trim()) throw new Error("Falta o nome do interessado.");
    return d;
  })
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const opportunityId = await linkedDealId(supabase, userId, data.propertyId);
    const { error } = await supabase.from("property_interests").insert({
      user_id: userId, property_id: data.propertyId, opportunity_id: opportunityId,
      name: data.name.trim(), contact: data.contact?.trim() || null,
      source: data.source?.trim() || "dashboard", status: data.status || "a_contactar",
    } as never);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const setInterestStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string; status: string }) => d)
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const { error } = await supabase.from("property_interests")
      .update({ status: data.status } as never).eq("id", data.id).eq("user_id", userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteInterest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    await supabase.from("property_interests").delete().eq("id", data.id).eq("user_id", userId);
    return { ok: true };
  });

/** Visita = seguimento do tipo visita ligado ao imóvel (mesma tabela da conversa). */
export const addPropertyVisit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { propertyId: string; who: string; date: string; time?: string; notes?: string }) => {
    if (!d.who?.trim()) throw new Error("Falta quem faz a visita.");
    if (!d.date) throw new Error("Falta a data da visita.");
    return d;
  })
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const opportunityId = await linkedDealId(supabase, userId, data.propertyId);
    const who = data.who.trim();
    const { data: person } = await supabase
      .from("people").select("id").eq("user_id", userId).ilike("name", who).limit(1).maybeSingle();
    const { error } = await supabase.from("follow_ups").insert({
      user_id: userId,
      title: `Visita — ${who}`,
      type: "visita",
      due_date: new Date(`${data.date}T${data.time || "10:00"}:00`).toISOString(),
      due_time: data.time || null,
      status: "agendado",
      priority: "media",
      person_id: (person as Row | null)?.id ?? null,
      related_property_id: data.propertyId,
      opportunity_id: opportunityId,
      notes: data.notes?.trim() || null,
      timezone: "Europe/Lisbon",
      source_channel: "dashboard",
    } as never);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const setVisitState = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string; state: "feita" | "cancelada" | "agendada" }) => d)
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const patch: Row =
      data.state === "feita"
        ? { status: "concluído", outcome_recorded_at: new Date().toISOString() }
        : data.state === "cancelada"
          ? { status: "cancelado" }
          : { status: "agendado", outcome_recorded_at: null };
    const { error } = await supabase.from("follow_ups").update(patch as never)
      .eq("id", data.id).eq("user_id", userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const addPropertyOffer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { propertyId: string; amount: number; from?: string; date?: string; notes?: string }) => {
    if (!d.amount || d.amount <= 0) throw new Error("Falta o valor da proposta.");
    return d;
  })
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const opportunityId = await linkedDealId(supabase, userId, data.propertyId);
    const { error } = await supabase.from("property_offers").insert({
      user_id: userId, property_id: data.propertyId, opportunity_id: opportunityId,
      amount: data.amount, from_name: data.from?.trim() || null,
      offer_date: data.date ? new Date(data.date).toISOString() : new Date().toISOString(),
      notes: data.notes?.trim() || null,
    } as never);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const setOfferStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string; status: "pendente" | "aceite" | "recusada" }) => d)
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const { error } = await supabase.from("property_offers")
      .update({ status: data.status } as never).eq("id", data.id).eq("user_id", userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const addMarketingActivity = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { propertyId: string; title: string; done?: boolean }) => {
    if (!d.title?.trim()) throw new Error("Escreve o que foi (ou vai ser) feito.");
    return d;
  })
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const opportunityId = await linkedDealId(supabase, userId, data.propertyId);
    const { error } = await supabase.from("property_marketing_activities").insert({
      user_id: userId, property_id: data.propertyId, opportunity_id: opportunityId,
      title: data.title.trim(),
      status: data.done ? "feito" : "por_fazer",
      done_at: data.done ? new Date().toISOString() : null,
    } as never);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const toggleMarketingActivity = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string; done: boolean }) => d)
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const { error } = await supabase.from("property_marketing_activities").update({
      status: data.done ? "feito" : "por_fazer",
      done_at: data.done ? new Date().toISOString() : null,
    } as never).eq("id", data.id).eq("user_id", userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteMarketingActivity = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    await supabase.from("property_marketing_activities").delete().eq("id", data.id).eq("user_id", userId);
    return { ok: true };
  });

export const addPropertyCost = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { propertyId: string; description: string; amount: number; date?: string }) => {
    if (!d.description?.trim()) throw new Error("Falta a descrição da despesa.");
    if (!d.amount || d.amount <= 0) throw new Error("Falta o valor da despesa.");
    return d;
  })
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const opportunityId = await linkedDealId(supabase, userId, data.propertyId);
    const { error } = await supabase.from("financial_movements").insert({
      user_id: userId, property_id: data.propertyId, opportunity_id: opportunityId,
      type: "expense", description: data.description.trim(), amount: data.amount,
      status: "pago",
      movement_date: data.date ? new Date(data.date).toISOString() : new Date().toISOString(),
    } as never);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const addPropertyNote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { propertyId: string; note: string }) => {
    if (!d.note?.trim()) throw new Error("Escreve alguma coisa primeiro.");
    return d;
  })
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const opportunityId = await linkedDealId(supabase, userId, data.propertyId);
    const { error } = await supabase.from("interactions").insert({
      user_id: userId, property_id: data.propertyId, opportunity_id: opportunityId,
      original_content: data.note.trim(), source_channel: "dashboard",
      occurred_at: new Date().toISOString(),
    } as never);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Valores comerciais: comissão em % e/ou €, calculando o que faltar. */
export const setPropertyValues = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: {
    propertyId: string; askingPrice?: number | null; salePrice?: number | null;
    commissionPct?: number | null; commissionAmount?: number | null;
  }) => d)
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const { data: cur } = await supabase
      .from("properties").select("asking_price, sale_price, commission_pct, commission_amount")
      .eq("id", data.propertyId).eq("user_id", userId).maybeSingle();
    const c = (cur ?? {}) as Row;
    const asking = data.askingPrice !== undefined ? data.askingPrice : c.asking_price;
    const sale = data.salePrice !== undefined ? data.salePrice : c.sale_price;
    let pct = data.commissionPct !== undefined ? data.commissionPct : c.commission_pct;
    let amount = data.commissionAmount !== undefined ? data.commissionAmount : c.commission_amount;
    const base = Number(sale ?? asking ?? 0);
    if (base > 0) {
      if (data.commissionPct != null && data.commissionAmount === undefined) amount = Math.round(base * Number(pct) ) / 100;
      else if (data.commissionAmount != null && data.commissionPct === undefined) pct = Math.round((Number(amount) / base) * 10000) / 100;
      else if (pct != null && amount == null) amount = Math.round(base * Number(pct)) / 100;
      else if (amount != null && pct == null) pct = Math.round((Number(amount) / base) * 10000) / 100;
    }
    const { error } = await supabase.from("properties").update({
      asking_price: asking ?? null, sale_price: sale ?? null,
      commission_pct: pct ?? null, commission_amount: amount ?? null,
    } as never).eq("id", data.propertyId).eq("user_id", userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Interruptores Reserva / Vendido — refletem-se no negócio ligado. */
export const setPropertyCommercialState = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { propertyId: string; reserved?: boolean; sold?: boolean; salePrice?: number | null }) => d)
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const { data: cur } = await supabase
      .from("properties").select("asking_price, sale_price, commission_pct, status")
      .eq("id", data.propertyId).eq("user_id", userId).maybeSingle();
    const c = (cur ?? {}) as Row;
    const patch: Row = {};
    if (data.reserved !== undefined) {
      patch.reserved_at = data.reserved ? new Date().toISOString() : null;
      if (data.reserved) patch.status = "reservado";
      else if (c.status === "reservado") patch.status = "ativo";
    }
    if (data.sold !== undefined) {
      patch.sold_at = data.sold ? new Date().toISOString() : null;
      patch.status = data.sold ? "vendido" : (c.status === "vendido" ? "ativo" : c.status);
      if (data.sold) {
        const sale = data.salePrice ?? c.sale_price ?? c.asking_price ?? null;
        patch.sale_price = sale;
        if (sale && c.commission_pct != null) patch.commission_amount = Math.round(Number(sale) * Number(c.commission_pct)) / 100;
      }
    }
    const { error } = await supabase.from("properties").update(patch as never)
      .eq("id", data.propertyId).eq("user_id", userId);
    if (error) throw new Error(error.message);

    const dealId = await linkedDealId(supabase, userId, data.propertyId);
    if (dealId) {
      if (data.sold === true) {
        await supabase.from("opportunities")
          .update({ stage: "concluido", stage_changed_at: new Date().toISOString() } as never)
          .eq("id", dealId).eq("user_id", userId);
        await supabase.from("opportunity_events").insert({
          user_id: userId, opportunity_id: dealId, kind: "fase",
          summary: "Imóvel marcado como vendido — negócio concluído.", source: "dashboard",
        } as never);
      } else if (data.reserved === true) {
        await supabase.from("opportunity_events").insert({
          user_id: userId, opportunity_id: dealId, kind: "nota",
          summary: "Reserva confirmada (sinal recebido).", source: "dashboard",
        } as never);
      }
    }
    return { ok: true, dealId };
  });

/** Cria um negócio já ligado a este imóvel (e ao proprietário, se existir). */
export const createDealForProperty = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { propertyId: string }) => d)
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const existing = await linkedDealId(supabase, userId, data.propertyId);
    if (existing) return { id: existing };
    const { data: prop } = await supabase
      .from("properties").select("title, owner_person_id, asking_price")
      .eq("id", data.propertyId).eq("user_id", userId).maybeSingle();
    const p = (prop ?? {}) as Row;
    const { data: created, error } = await supabase.from("opportunities").insert({
      user_id: userId,
      title: `Venda · ${p.title ?? "Imóvel"}`,
      deal_kind: "venda", type: "venda", stage: "preparacao", status: "Novo",
      person_id: p.owner_person_id ?? null,
      property_id: data.propertyId,
      value: Number(p.asking_price ?? 0),
      stage_changed_at: new Date().toISOString(),
    } as never).select("id").single();
    if (error) throw new Error(error.message);
    const id = (created as Row).id as string;
    await supabase.from("opportunity_properties").insert({
      user_id: userId, opportunity_id: id, property_id: data.propertyId, role: "principal",
    } as never);
    await supabase.from("opportunity_events").insert({
      user_id: userId, opportunity_id: id, kind: "criado",
      summary: "Negócio criado a partir da ficha do imóvel.", source: "dashboard",
    } as never);
    return { id };
  });
