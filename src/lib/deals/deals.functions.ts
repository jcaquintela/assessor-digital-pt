// Camada de leitura/escrita do Negócio (deal). Tudo passa por RLS do próprio
// consultor. A IA nunca escreve aqui diretamente — só o dashboard e os
// Domain Services do motor.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { dealAlert, legacyStatusForStage, normalizeKind, normalizeStage, type DealStage } from "./stages";

type Row = Record<string, any>;

const MAX = 300;

function titleFor(row: Row, personName?: string | null, propTitle?: string | null): string {
  const t = String(row.title ?? "").trim();
  if (t) return t;
  const kind = normalizeKind(row.deal_kind ?? row.type);
  const who = personName || propTitle || "sem pessoa";
  return `${kind.charAt(0).toUpperCase()}${kind.slice(1)} · ${who}`;
}

/** Quadro de Negócios: tudo o que o consultor precisa de ver num relance. */
export const listDeals = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;

    const [oppsRes, peopleRes, propsRes, linksRes, fupsRes, movsRes, evRes] = await Promise.all([
      supabase.from("opportunities").select("*").eq("user_id", userId).order("updated_at", { ascending: false }).limit(MAX),
      supabase.from("people").select("id, name").eq("user_id", userId).limit(1000),
      supabase.from("properties").select("id, title, location, status, asking_price, value").eq("user_id", userId).limit(1000),
      supabase.from("opportunity_properties").select("opportunity_id, property_id, role").eq("user_id", userId).limit(2000),
      supabase.from("follow_ups").select("id, opportunity_id, title, due_date, status").eq("user_id", userId).limit(2000),
      supabase.from("financial_movements").select("id, opportunity_id, type, amount, status").eq("user_id", userId).limit(2000),
      supabase.from("opportunity_events").select("opportunity_id, occurred_at").eq("user_id", userId).order("occurred_at", { ascending: false }).limit(2000),
    ]);

    // Prazos do negócio vivem agora em `deal_deadlines` (label livre + data).
    // O alerta do quadro passa a ler o prazo aberto mais próximo.
    const { data: deadlineRows } = await supabase
      .from("deal_deadlines")
      .select("opportunity_id, due_date, status, archived_at")
      .eq("user_id", userId)
      .eq("status", "aberto")
      .is("archived_at", null)
      .order("due_date", { ascending: true })
      .limit(1000);
    const nextDeadline = new Map<string, string>();
    for (const r of ((deadlineRows ?? []) as Row[])) {
      if (!nextDeadline.has(r.opportunity_id)) nextDeadline.set(r.opportunity_id, String(r.due_date).slice(0, 10));
    }

    const people = new Map<string, string>();
    for (const p of (peopleRes.data ?? []) as Row[]) people.set(p.id, p.name ?? "Sem nome");
    const props = new Map<string, Row>();
    for (const p of (propsRes.data ?? []) as Row[]) props.set(p.id, p);

    const byDealProps = new Map<string, Row[]>();
    for (const l of (linksRes.data ?? []) as Row[]) {
      const prop = props.get(l.property_id);
      if (!prop) continue;
      const arr = byDealProps.get(l.opportunity_id) ?? [];
      arr.push({ ...prop, role: l.role ?? "principal" });
      byDealProps.set(l.opportunity_id, arr);
    }

    const nextByDeal = new Map<string, Row>();
    for (const f of (fupsRes.data ?? []) as Row[]) {
      if (!f.opportunity_id) continue;
      if (String(f.status ?? "").toLowerCase() === "concluído" || String(f.status ?? "").toLowerCase() === "concluido") continue;
      const cur = nextByDeal.get(f.opportunity_id);
      if (!cur || new Date(f.due_date) < new Date(cur.due_date)) nextByDeal.set(f.opportunity_id, f);
    }

    const moneyByDeal = new Map<string, { previsto: number; recebido: number }>();
    for (const m of (movsRes.data ?? []) as Row[]) {
      if (!m.opportunity_id || m.type !== "commission") continue;
      const cur = moneyByDeal.get(m.opportunity_id) ?? { previsto: 0, recebido: 0 };
      const amount = Number(m.amount ?? 0);
      cur.previsto += amount;
      if (String(m.status ?? "").toLowerCase().startsWith("receb")) cur.recebido += amount;
      moneyByDeal.set(m.opportunity_id, cur);
    }

    const lastEvent = new Map<string, string>();
    for (const e of (evRes.data ?? []) as Row[]) {
      if (!lastEvent.has(e.opportunity_id)) lastEvent.set(e.opportunity_id, e.occurred_at);
    }

    const deals = ((oppsRes.data ?? []) as Row[]).map((o) => {
      const personName = o.person_id ? (people.get(o.person_id) ?? null) : null;
      const linked = byDealProps.get(o.id) ?? [];
      if (o.property_id && !linked.some((p) => p.id === o.property_id)) {
        const legacy = props.get(o.property_id);
        if (legacy) linked.unshift({ ...legacy, role: "principal" });
      }
      const next = nextByDeal.get(o.id) ?? null;
      const money = moneyByDeal.get(o.id) ?? { previsto: 0, recebido: 0 };
      const lastActivityAt = lastEvent.get(o.id) ?? o.updated_at ?? o.created_at;
      const nextActionAt = next?.due_date ?? o.next_action_date ?? null;
      return {
        id: o.id,
        title: titleFor(o, personName, linked[0]?.title),
        stage: normalizeStage(o.stage),
        kind: normalizeKind(o.deal_kind ?? o.type),
        value: Number(o.value ?? 0),
        /** `null` quando o consultor ainda não estimou — não soma para "em jogo". */
        valueEstimate: o.value == null ? null : Number(o.value),
        stageChangedAt: (o.stage_changed_at ?? o.updated_at ?? o.created_at ?? null) as string | null,
        sourceLeadId: o.source_lead_id ?? null,
        archivedAt: o.archived_at ?? null,
        personId: o.person_id ?? null,
        personName,
        properties: linked.map((p) => ({ id: p.id, title: p.title, location: p.location, role: p.role })),
        nextAction: next ? { id: next.id, title: next.title, dueAt: next.due_date } :
          o.next_action ? { id: null, title: o.next_action, dueAt: o.next_action_date ?? null } : null,
        deadline: nextDeadline.get(o.id) ?? null,
        commission: money,
        lastActivityAt,
        alert: dealAlert({ lastActivityAt, deadline: nextDeadline.get(o.id) ?? null, nextActionAt, stage: o.stage }),
      };
    });

    return { deals };
  });

export type DealListItem = Awaited<ReturnType<typeof listDeals>>["deals"][number];

/** Ficha do negócio: história completa numa página. */
export const getDeal = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { id: string }) => data)
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;

    const { data: deal, error } = await supabase
      .from("opportunities").select("*").eq("id", data.id).eq("user_id", userId).maybeSingle();
    if (error) throw new Error(error.message);
    if (!deal) return null;
    const o = deal as Row;

    const [personRes, linksRes, fupsRes, movsRes, evRes, interRes, filesRes] = await Promise.all([
      o.person_id
        ? supabase.from("people").select("id, name, phone, email, relationship_type").eq("id", o.person_id).maybeSingle()
        : Promise.resolve({ data: null } as any),
      supabase.from("opportunity_properties").select("property_id, role, notes").eq("opportunity_id", o.id).eq("user_id", userId),
      supabase.from("follow_ups").select("id, title, due_date, status, notes, kind").eq("opportunity_id", o.id).eq("user_id", userId).order("due_date"),
      supabase.from("financial_movements").select("id, type, description, amount, status, movement_date").eq("opportunity_id", o.id).eq("user_id", userId).order("movement_date", { ascending: false }),
      supabase.from("opportunity_events").select("id, kind, summary, source, occurred_at").eq("opportunity_id", o.id).eq("user_id", userId).order("occurred_at", { ascending: false }).limit(100),
      supabase.from("interactions").select("id, original_content, summary, occurred_at, source_channel, is_confidential").eq("opportunity_id", o.id).eq("user_id", userId).order("occurred_at", { ascending: false }).limit(50),
      (async () => {
        // Documentos do negócio incluem os da pessoa e dos imóveis envolvidos.
        const { listRelatedFiles } = await import("@/lib/drive/related-files.server");
        return { data: await listRelatedFiles(supabase, userId, "opportunity", o.id) } as any;
      })(),
    ]);

    const propIds = new Set<string>(((linksRes.data ?? []) as Row[]).map((l) => l.property_id));
    if (o.property_id) propIds.add(o.property_id);
    const propsRes = propIds.size
      ? await supabase.from("properties").select("id, title, location, status, asking_price, value").in("id", [...propIds]).eq("user_id", userId)
      : { data: [] as Row[] };
    const roleById = new Map<string, string>(((linksRes.data ?? []) as Row[]).map((l) => [l.property_id, l.role ?? "principal"]));

    const personName = (personRes as any)?.data?.name ?? null;
    const properties = ((propsRes.data ?? []) as Row[]).map((p) => ({
      id: p.id, title: p.title, location: p.location, status: p.status,
      price: Number(p.asking_price ?? p.value ?? 0), role: roleById.get(p.id) ?? "principal",
    }));

    const pendentes = ((fupsRes.data ?? []) as Row[]).filter(
      (f) => !String(f.status ?? "").toLowerCase().startsWith("conclu"),
    );
    const nextActionAt = pendentes[0]?.due_date ?? o.next_action_date ?? null;
    const lastActivityAt = ((evRes.data ?? []) as Row[])[0]?.occurred_at ?? o.updated_at ?? o.created_at;

    const { data: dlRows } = await supabase
      .from("deal_deadlines")
      .select("due_date")
      .eq("user_id", userId)
      .eq("opportunity_id", o.id)
      .eq("status", "aberto")
      .is("archived_at", null)
      .order("due_date", { ascending: true })
      .limit(1);
    const nextDeadlineOfDeal = ((dlRows ?? []) as Row[])[0]?.due_date
      ? String(((dlRows ?? []) as Row[])[0]!.due_date).slice(0, 10)
      : null;

    return {
      id: o.id,
      title: titleFor(o, personName, properties[0]?.title),
      rawTitle: o.title ?? "",
      stage: normalizeStage(o.stage),
      stageChangedAt: o.stage_changed_at ?? null,
      kind: normalizeKind(o.deal_kind ?? o.type),
      value: Number(o.value ?? 0),
      notes: o.notes ?? "",
      deadline: nextDeadlineOfDeal,
      archivedAt: o.archived_at ?? null,
      createdAt: o.created_at,
      person: (personRes as any)?.data
        ? { id: (personRes as any).data.id, name: (personRes as any).data.name, phone: (personRes as any).data.phone, email: (personRes as any).data.email }
        : null,
      properties,
      followUps: ((fupsRes.data ?? []) as Row[]).map((f) => ({
        id: f.id, title: f.title, dueAt: f.due_date, status: f.status, kind: f.kind ?? null,
      })),
      movements: ((movsRes.data ?? []) as Row[]).map((m) => ({
        id: m.id, type: m.type, description: m.description, amount: Number(m.amount ?? 0),
        status: m.status, date: m.movement_date,
      })),
      events: ((evRes.data ?? []) as Row[]).map((e) => ({
        id: e.id, kind: e.kind, summary: e.summary, source: e.source, occurredAt: e.occurred_at,
      })),
      interactions: ((interRes.data ?? []) as Row[]).map((i) => ({
        id: i.id, content: i.summary || i.original_content, channel: i.source_channel, occurredAt: i.occurred_at,
        confidential: i.is_confidential === true,
      })),
      files: ((filesRes.data ?? []) as any[]).map((f) => ({
        id: f.id,
        name: f.name,
        classification: f.classification ?? f.document_type ?? null,
        createdAt: f.created_at,
        via: f.via?.label ?? null,
      })),
      alert: dealAlert({ lastActivityAt, deadline: nextDeadlineOfDeal, nextActionAt, stage: o.stage }),
      lastActivityAt,
    };
  });

export type DealDetail = NonNullable<Awaited<ReturnType<typeof getDeal>>>;

async function logEvent(
  supabase: any, userId: string, opportunityId: string,
  kind: string, summary: string, payload?: Record<string, unknown>,
) {
  await supabase.from("opportunity_events").insert({
    user_id: userId, opportunity_id: opportunityId, kind, summary,
    payload: payload ?? {}, source: "dashboard",
  });
}

export const createDeal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: {
    title: string; kind: string; stage?: string; personId?: string | null;
    propertyId?: string | null; value?: number | null; notes?: string | null;
  }) => data)
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const { createDealCore } = await import("./create.server");
    const res = await createDealCore(supabase, userId, {
      title: data.title,
      kind: data.kind,
      stage: data.stage ?? null,
      personId: data.personId ?? null,
      propertyId: data.propertyId ?? null,
      value: data.value ?? null,
      notes: data.notes ?? null,
      source: "dashboard",
    });
    return res;
  });

/** Comissões e despesas sem negócio — para o consultor as ligar num clique. */
export const listOrphanMovements = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data, error } = await supabase
      .from("financial_movements")
      .select("id, type, amount, description, movement_date, status, property_id")
      .eq("user_id", userId)
      .is("opportunity_id", null)
      .order("movement_date", { ascending: false })
      .limit(50);
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as Row[];
    const propIds = [...new Set(rows.map((r) => r.property_id).filter(Boolean))] as string[];
    const titles = new Map<string, string>();
    if (propIds.length) {
      const { data: props } = await supabase
        .from("properties").select("id, title").eq("user_id", userId).in("id", propIds);
      for (const p of ((props ?? []) as Row[])) titles.set(p.id, p.title ?? "Imóvel");
    }
    return {
      movements: rows.map((m) => ({
        id: m.id,
        type: m.type as string,
        amount: Number(m.amount ?? 0),
        description: m.description ?? "",
        date: m.movement_date ?? null,
        status: m.status ?? null,
        propertyId: m.property_id ?? null,
        propertyTitle: m.property_id ? (titles.get(m.property_id) ?? null) : null,
      })),
    };
  });

/** Liga uma comissão/despesa solta a um negócio existente. */
export const linkMovementToDeal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { movementId: string; dealId: string }) => data)
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const { linkMovementsToDeal } = await import("./create.server");
    const n = await linkMovementsToDeal(supabase, userId, data.dealId, { ids: [data.movementId] });
    if (!n) throw new Error("Não consegui ligar esse movimento. Já pertence a um negócio?");
    return { ok: true };
  });

/** Cria um negócio novo a partir de uma comissão/despesa solta. */
export const createDealFromMovement = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: {
    movementId: string; title: string; kind?: string;
    personId?: string | null; propertyId?: string | null; value?: number | null;
  }) => data)
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const { createDealCore } = await import("./create.server");
    return await createDealCore(supabase, userId, {
      title: data.title,
      kind: data.kind ?? "venda",
      personId: data.personId ?? null,
      propertyId: data.propertyId ?? null,
      value: data.value ?? null,
      source: "dashboard",
      linkMovementIds: [data.movementId],
    });
  });

export const updateDeal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: {
    id: string; title?: string; kind?: string; value?: number; notes?: string | null;
    personId?: string | null;
  }) => data)
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const patch: Row = {};
    if (data.title !== undefined) patch.title = data.title.trim() || null;
    if (data.kind !== undefined) { patch.deal_kind = normalizeKind(data.kind); patch.type = patch.deal_kind; }
    if (data.value !== undefined) patch.value = data.value;
    if (data.notes !== undefined) patch.notes = data.notes || null;
    if (data.personId !== undefined) patch.person_id = data.personId || null;
    const { error } = await supabase.from("opportunities").update(patch as never).eq("id", data.id).eq("user_id", userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const setDealStage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { id: string; stage: string; note?: string | null }) => data)
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const stage = normalizeStage(data.stage) as DealStage;
    const { data: before } = await supabase
      .from("opportunities").select("stage").eq("id", data.id).eq("user_id", userId).maybeSingle();
    const { error } = await supabase
      .from("opportunities")
      // `status` é legado, mas continua a ser lido por outros ecrãs: manter
      // em sintonia com a fase evita "concluído aqui, em curso ali".
      .update({ stage, status: legacyStatusForStage(stage), stage_changed_at: new Date().toISOString() } as never)
      .eq("id", data.id).eq("user_id", userId);
    if (error) throw new Error(error.message);
    await logEvent(
      supabase, userId, data.id, "fase",
      data.note?.trim() || `Fase alterada para ${stage}.`,
      { from: (before as Row | null)?.stage ?? null, to: stage },
    );
    return { ok: true, stage };
  });

export const addDealNote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { id: string; note: string }) => data)
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const note = data.note.trim();
    if (!note) throw new Error("Escreve alguma coisa primeiro.");
    await logEvent(supabase, userId, data.id, "nota", note);
    await supabase.from("interactions").insert({
      user_id: userId, opportunity_id: data.id, original_content: note,
      source_channel: "dashboard", occurred_at: new Date().toISOString(),
    } as never);
    return { ok: true };
  });

export const linkDealProperty = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { id: string; propertyId: string; role?: string }) => data)
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const { error } = await supabase.from("opportunity_properties").upsert(
      { user_id: userId, opportunity_id: data.id, property_id: data.propertyId, role: data.role ?? "alternativa" } as never,
      { onConflict: "opportunity_id,property_id" },
    );
    if (error) throw new Error(error.message);
    await logEvent(supabase, userId, data.id, "imovel", "Imóvel ligado ao negócio.", { property_id: data.propertyId });
    return { ok: true };
  });

export const unlinkDealProperty = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { id: string; propertyId: string }) => data)
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    await supabase.from("opportunity_properties").delete()
      .eq("opportunity_id", data.id).eq("property_id", data.propertyId).eq("user_id", userId);
    const { data: row } = await supabase
      .from("opportunities").select("property_id").eq("id", data.id).eq("user_id", userId).maybeSingle();
    if ((row as Row | null)?.property_id === data.propertyId) {
      await supabase.from("opportunities").update({ property_id: null } as never).eq("id", data.id).eq("user_id", userId);
    }
    return { ok: true };
  });

export const archiveDeal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { id: string; archived: boolean }) => data)
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const { error } = await supabase
      .from("opportunities")
      .update({ archived_at: data.archived ? new Date().toISOString() : null } as never)
      .eq("id", data.id).eq("user_id", userId);
    if (error) throw new Error(error.message);
    await logEvent(supabase, userId, data.id, "arquivo", data.archived ? "Negócio arquivado." : "Negócio reaberto.");
    return { ok: true };
  });

/** Negócios de uma pessoa ou de um imóvel — usado nas fichas. */
export const listDealsFor = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { personId?: string; propertyId?: string }) => data)
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    let ids: string[] | null = null;
    if (data.propertyId) {
      const { data: links } = await supabase
        .from("opportunity_properties").select("opportunity_id")
        .eq("property_id", data.propertyId).eq("user_id", userId);
      ids = ((links ?? []) as Row[]).map((l) => l.opportunity_id);
    }

    let q = supabase.from("opportunities").select("*").eq("user_id", userId).order("updated_at", { ascending: false }).limit(50);
    if (data.personId) q = q.eq("person_id", data.personId);
    else if (data.propertyId) {
      q = ids && ids.length
        ? q.or(`property_id.eq.${data.propertyId},id.in.(${ids.join(",")})`)
        : q.eq("property_id", data.propertyId);
    }
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);

    return ((rows ?? []) as Row[]).map((o) => ({
      id: o.id,
      title: titleFor(o),
      stage: normalizeStage(o.stage),
      kind: normalizeKind(o.deal_kind ?? o.type),
      value: Number(o.value ?? 0),
      archivedAt: o.archived_at ?? null,
      nextAction: o.next_action ?? null,
      nextActionAt: o.next_action_date ?? null,
    }));
  });
