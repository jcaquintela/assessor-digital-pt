// Rastreabilidade de origem: oportunidades sem lead de prospeção associado.
// A IA nunca escreve aqui — a atribuição é sempre manual, feita pela equipa.
import { foldText } from "@/lib/search/normalize";

export interface LeadCandidate {
  id: string;
  title: string | null;
  contact_name: string | null;
  location: string | null;
  phone: string | null;
  status: string | null;
  created_at: string;
  score: number;
  reason: string;
}

export interface OrphanOpportunity {
  id: string;
  title: string | null;
  stage: string | null;
  status: string | null;
  created_at: string;
  user_id: string;
  consultant_name: string | null;
  consultant_email: string | null;
  person_name: string | null;
  property_title: string | null;
  candidates: LeadCandidate[];
}

function tokens(text: string | null | undefined): string[] {
  return foldText(text)
    .split(/[^\p{L}\p{N}]+/u)
    .filter((t) => t.length >= 3);
}

/** Semelhança de Jaccard entre dois textos, 0..1. */
function similarity(a: string | null | undefined, b: string | null | undefined): number {
  const A = new Set(tokens(a));
  const B = new Set(tokens(b));
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const t of A) if (B.has(t)) inter += 1;
  return inter / (A.size + B.size - inter);
}

function scoreLead(
  opp: { title: string | null; person_name: string | null; property_title: string | null; created_at: string },
  lead: { title: string | null; contact_name: string | null; location: string | null; created_at: string },
): { score: number; reason: string } {
  const reasons: string[] = [];
  let score = 0;

  const byTitle = Math.max(
    similarity(opp.title, lead.title),
    similarity(opp.property_title, lead.title),
    similarity(opp.title, lead.location),
  );
  if (byTitle > 0) {
    score += byTitle * 0.6;
    if (byTitle >= 0.3) reasons.push("título/morada parecidos");
  }

  const byPerson = similarity(opp.person_name, lead.contact_name);
  if (byPerson > 0) {
    score += byPerson * 0.4;
    if (byPerson >= 0.4) reasons.push("mesmo nome de contacto");
  }

  // Proximidade temporal: lead criado até 45 dias antes da oportunidade.
  const days = (new Date(opp.created_at).getTime() - new Date(lead.created_at).getTime()) / 86_400_000;
  if (days >= -1 && days <= 45) {
    score += 0.15;
    reasons.push("datas próximas");
  }

  return { score, reason: reasons.join(" · ") || "sem sinais fortes" };
}

/** Oportunidades sem origem registada, com sugestões de leads do mesmo consultor. */
export async function fetchOrphanOpportunities(
  admin: any,
  opts: { limit?: number } = {},
): Promise<{ items: OrphanOpportunity[]; totalOrphans: number; totalOpportunities: number }> {
  const limit = opts.limit ?? 100;

  const [{ count: totalOpportunities }, { count: totalOrphans }] = await Promise.all([
    admin.from("opportunities").select("id", { count: "exact", head: true }).is("archived_at", null),
    admin
      .from("opportunities")
      .select("id", { count: "exact", head: true })
      .is("archived_at", null)
      .is("source_lead_id", null),
  ]);

  const { data: opps, error } = await admin
    .from("opportunities")
    .select("id, title, stage, status, created_at, user_id, person_id, property_id")
    .is("archived_at", null)
    .is("source_lead_id", null)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);

  const rows = opps ?? [];
  if (!rows.length) {
    return { items: [], totalOrphans: totalOrphans ?? 0, totalOpportunities: totalOpportunities ?? 0 };
  }

  const userIds = [...new Set(rows.map((o: any) => o.user_id).filter(Boolean))];
  const personIds = [...new Set(rows.map((o: any) => o.person_id).filter(Boolean))];
  const propertyIds = [...new Set(rows.map((o: any) => o.property_id).filter(Boolean))];

  const [profilesRes, peopleRes, propsRes, leadsRes] = await Promise.all([
    userIds.length
      ? admin.from("profiles").select("id, full_name, email").in("id", userIds)
      : Promise.resolve({ data: [] }),
    personIds.length
      ? admin.from("people").select("id, name").in("id", personIds)
      : Promise.resolve({ data: [] }),
    propertyIds.length
      ? admin.from("properties").select("id, title").in("id", propertyIds)
      : Promise.resolve({ data: [] }),
    userIds.length
      ? admin
          .from("prospecting_leads")
          .select("id, user_id, title, contact_name, location, phone, status, created_at")
          .in("user_id", userIds)
          .order("created_at", { ascending: false })
          .limit(2000)
      : Promise.resolve({ data: [] }),
  ]);

  const profiles = new Map((profilesRes.data ?? []).map((p: any) => [p.id, p]));
  const people = new Map((peopleRes.data ?? []).map((p: any) => [p.id, p]));
  const properties = new Map((propsRes.data ?? []).map((p: any) => [p.id, p]));
  const leadsByUser = new Map<string, any[]>();
  for (const l of leadsRes.data ?? []) {
    const arr = leadsByUser.get(l.user_id) ?? [];
    arr.push(l);
    leadsByUser.set(l.user_id, arr);
  }

  const items: OrphanOpportunity[] = rows.map((o: any) => {
    const profile: any = profiles.get(o.user_id);
    const personName = o.person_id ? ((people.get(o.person_id) as any)?.name ?? null) : null;
    const propertyTitle = o.property_id ? ((properties.get(o.property_id) as any)?.title ?? null) : null;
    const base = {
      title: o.title ?? null,
      person_name: personName,
      property_title: propertyTitle,
      created_at: o.created_at,
    };

    const candidates: LeadCandidate[] = (leadsByUser.get(o.user_id) ?? [])
      .map((l: any) => {
        const { score, reason } = scoreLead(base, l);
        return {
          id: l.id,
          title: l.title ?? null,
          contact_name: l.contact_name ?? null,
          location: l.location ?? null,
          phone: l.phone ?? null,
          status: l.status ?? null,
          created_at: l.created_at,
          score: Math.round(score * 100) / 100,
          reason,
        };
      })
      .filter((c: LeadCandidate) => c.score >= 0.15)
      .sort((a: LeadCandidate, b: LeadCandidate) => b.score - a.score)
      .slice(0, 5);

    return {
      id: o.id,
      title: o.title ?? null,
      stage: o.stage ?? null,
      status: o.status ?? null,
      created_at: o.created_at,
      user_id: o.user_id,
      consultant_name: profile?.full_name ?? null,
      consultant_email: profile?.email ?? null,
      person_name: personName,
      property_title: propertyTitle,
      candidates,
    };
  });

  return { items, totalOrphans: totalOrphans ?? 0, totalOpportunities: totalOpportunities ?? 0 };
}

/** Todos os leads de um consultor, para escolha manual quando não há sugestão boa. */
export async function searchLeadsForOpportunity(
  admin: any,
  input: { opportunityId: string; query: string },
): Promise<LeadCandidate[]> {
  const { data: opp, error } = await admin
    .from("opportunities")
    .select("user_id")
    .eq("id", input.opportunityId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!opp) throw new Error("Oportunidade não encontrada.");

  let q = admin
    .from("prospecting_leads")
    .select("id, title, contact_name, location, phone, status, created_at")
    .eq("user_id", opp.user_id)
    .order("created_at", { ascending: false })
    .limit(30);

  const needle = foldText(input.query).replace(/[%_]/g, "");
  if (needle) q = q.ilike("search_norm", `%${needle}%`);

  const { data, error: e2 } = await q;
  if (e2) throw new Error(e2.message);
  return (data ?? []).map((l: any) => ({
    id: l.id,
    title: l.title ?? null,
    contact_name: l.contact_name ?? null,
    location: l.location ?? null,
    phone: l.phone ?? null,
    status: l.status ?? null,
    created_at: l.created_at,
    score: 0,
    reason: "escolha manual",
  }));
}

/** Grava (ou limpa) a origem de uma oportunidade, com registo de auditoria. */
export async function setOpportunityOrigin(
  admin: any,
  adminUserId: string,
  input: { opportunityId: string; leadId: string | null },
): Promise<{ ok: true }> {
  const { data: opp, error } = await admin
    .from("opportunities")
    .select("id, user_id, source_lead_id")
    .eq("id", input.opportunityId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!opp) throw new Error("Oportunidade não encontrada.");

  if (input.leadId) {
    const { data: lead, error: e2 } = await admin
      .from("prospecting_leads")
      .select("id, user_id")
      .eq("id", input.leadId)
      .maybeSingle();
    if (e2) throw new Error(e2.message);
    if (!lead) throw new Error("Lead não encontrado.");
    if (lead.user_id !== opp.user_id) {
      throw new Error("O lead pertence a outro consultor.");
    }
  }

  const { error: e3 } = await admin
    .from("opportunities")
    .update({ source_lead_id: input.leadId })
    .eq("id", input.opportunityId);
  if (e3) throw new Error(e3.message);

  await admin.from("admin_audit_logs").insert({
    admin_user_id: adminUserId,
    action: "opportunity_origin_set",
    target_user_id: opp.user_id,
    metadata: {
      opportunity_id: input.opportunityId,
      previous_lead_id: opp.source_lead_id ?? null,
      lead_id: input.leadId,
    },
  });

  return { ok: true };
}
