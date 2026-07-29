import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { normalizeEmail, normalizePhoneE164, similarName } from "./normalize";
import { detectPerson, type DetectedRole } from "./detect";
import { parseVCard } from "./vcard";

const ROLE_VALUES: DetectedRole[] = [
  "owner","potential_owner","buyer","potential_buyer","client",
  "reference","partner","supplier","colleague","other",
];

const RELATIONSHIP_FROM_ROLE: Record<DetectedRole, string> = {
  owner: "Proprietário",
  potential_owner: "Proprietário",
  buyer: "Comprador",
  potential_buyer: "Potencial",
  client: "Cliente",
  reference: "Referenciador",
  partner: "Colega",
  supplier: "Colega",
  colleague: "Colega",
  other: "Potencial",
};

function sanitizeRoles(roles: unknown): DetectedRole[] {
  if (!Array.isArray(roles)) return [];
  const out: DetectedRole[] = [];
  for (const r of roles) {
    if (typeof r === "string" && (ROLE_VALUES as string[]).includes(r) && !out.includes(r as DetectedRole)) {
      out.push(r as DetectedRole);
    }
  }
  return out;
}

/* ---------- Deduplicação ---------- */

export interface DedupeMatch {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  confidence: number;
  reason: "phone" | "email" | "name_context" | "name_only";
}

export const dedupePerson = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => v as { name?: string | null; phone?: string | null; email?: string | null; company?: string | null })
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const name = (data?.name ?? "").trim();
    const email = normalizeEmail(data?.email);
    const rawPhone = data?.phone ?? "";
    const phoneNorm = rawPhone ? normalizePhoneE164(rawPhone) : null;
    const company = (data?.company ?? "").trim();

    // 1) telefone exato via person_phones
    if (phoneNorm?.e164) {
      const { data: phones } = await supabase
        .from("person_phones")
        .select("person_id")
        .eq("user_id", userId)
        .eq("e164", phoneNorm.e164)
        .limit(1);
      const pid = phones?.[0]?.person_id;
      if (pid) {
        const { data: p } = await supabase.from("people").select("id,name,phone,email").eq("id", pid).maybeSingle();
        if (p) return { match: { id: p.id, name: p.name, phone: p.phone, email: p.email, confidence: 0.99, reason: "phone" } as DedupeMatch };
      }
    }

    // 2) email exato
    if (email) {
      const { data: p } = await supabase
        .from("people")
        .select("id,name,phone,email")
        .eq("user_id", userId)
        .eq("email_normalized", email)
        .maybeSingle();
      if (p) return { match: { id: p.id, name: p.name, phone: p.phone, email: p.email, confidence: 0.95, reason: "email" } as DedupeMatch };
    }

    // 3) nome + contexto (empresa) / nome isolado
    if (name) {
      const { data: rows } = await supabase
        .from("people")
        .select("id,name,phone,email,company")
        .eq("user_id", userId);
      let best: DedupeMatch | null = null;
      for (const p of rows ?? []) {
        const score = similarName(name, p.name ?? "");
        const contextBoost = company && (p as { company?: string | null }).company && normalizeEmail((p as { company?: string | null }).company ?? "") === normalizeEmail(company) ? 0.15 : 0;
        const eff = score + contextBoost;
        if (eff >= 0.9 && (!best || eff > best.confidence)) {
          best = { id: p.id, name: p.name, phone: p.phone, email: p.email, confidence: eff, reason: company ? "name_context" : "name_only" };
        } else if (eff >= 0.8 && company && (!best || eff > best.confidence)) {
          best = { id: p.id, name: p.name, phone: p.phone, email: p.email, confidence: eff, reason: "name_context" };
        }
      }
      if (best) return { match: best };
    }

    return { match: null };
  });

/* ---------- Criar ou merge ---------- */

export interface PersonInput {
  name: string;
  roles?: DetectedRole[] | null;
  phones?: Array<{ raw: string; isPrimary?: boolean; kind?: string }> | null;
  email?: string | null;
  company?: string | null;
  jobTitle?: string | null;
  summary?: string | null;
  notes?: string | null;
  searchLocation?: string | null;
  searchPropertyType?: string | null;
  budgetMin?: number | null;
  budgetMax?: number | null;
  referredByPersonId?: string | null;
  sourceChannel?: string | null;
  sourceMessageId?: string | null;
  sourceFileId?: string | null;
}

export interface CreateOrMergeResult {
  id: string;
  created: boolean;
  merged: boolean;
  addedPhones: string[];
  addedRoles: DetectedRole[];
}

export const createOrMergePerson = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => v as { person: PersonInput; targetId?: string | null; forceCreate?: boolean })
  .handler(async ({ data, context }): Promise<CreateOrMergeResult> => {
    return doCreateOrMerge(context.supabase, context.userId, data);
  });

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function doCreateOrMerge(supabase: any, userId: string, data: { person: PersonInput; targetId?: string | null; forceCreate?: boolean }): Promise<CreateOrMergeResult> {
    const p = data.person;
    const roles = sanitizeRoles(p.roles);
    const email = normalizeEmail(p.email);
    const phones = (p.phones ?? []).map((ph) => ({
      raw: ph.raw,
      norm: normalizePhoneE164(ph.raw),
      isPrimary: !!ph.isPrimary,
      kind: ph.kind ?? null,
    })).filter((ph) => ph.raw && ph.raw.trim());

    // Se targetId, faz merge direto
    let targetId = data.targetId ?? null;

    // Se não veio targetId e não forceCreate, tenta dedupe
    if (!targetId && !data.forceCreate) {
      const first = phones[0]?.norm?.e164 ?? phones[0]?.raw ?? null;
      const dedupeReq: { name?: string | null; phone?: string | null; email?: string | null; company?: string | null } = {
        name: p.name, email, phone: first, company: p.company,
      };
      const { data: dupPhones } = await (async () => {
        // reproduz lógica principal do dedupePerson (só telefone + email) para evitar chamada extra
        const norm = first ? normalizePhoneE164(first) : null;
        if (norm?.e164) {
          const r = await supabase.from("person_phones").select("person_id").eq("user_id", userId).eq("e164", norm.e164).limit(1);
          if (r.data?.[0]?.person_id) return { data: r.data[0].person_id as string };
        }
        if (email) {
          const r = await supabase.from("people").select("id").eq("user_id", userId).eq("email_normalized", email).maybeSingle();
          if (r.data?.id) return { data: r.data.id as string };
        }
        return { data: null };
      })();
      if (dupPhones) targetId = dupPhones;
      // Ignora dedupeReq — cobrimos telefone/email; nome só se explicitamente confirmado pelo caller
      void dedupeReq;
    }

    if (targetId) {
      return mergeInto(supabase, userId, targetId, p, roles, phones, email);
    }

    // Cria nova pessoa
    const primaryRole = roles[0];
    const relationship = primaryRole ? RELATIONSHIP_FROM_ROLE[primaryRole] : "Potencial";
    const insertRes = await supabase.from("people").insert({
      user_id: userId,
      name: p.name.trim(),
      phone: phones[0]?.norm?.e164 ?? phones[0]?.raw ?? null,
      email: email ?? null,
      relationship_type: relationship,
      roles: roles.length ? roles : null,
      summary: p.summary ?? null,
      company: p.company ?? null,
      job_title: p.jobTitle ?? null,
      search_location: p.searchLocation ?? null,
      search_property_type: p.searchPropertyType ?? null,
      budget_min: p.budgetMin ?? null,
      budget_max: p.budgetMax ?? null,
      referred_by_person_id: p.referredByPersonId ?? null,
      source_channel: p.sourceChannel ?? null,
      source_message_id: p.sourceMessageId ?? null,
      source_file_id: p.sourceFileId ?? null,
      next_action: null,
      next_action_date: null,
    } as never).select("id").single();
    if (insertRes.error) throw insertRes.error;
    const newId = (insertRes.data as { id: string }).id;

    const addedPhones: string[] = [];
    for (let i = 0; i < phones.length; i++) {
      const ph = phones[i];
      const ins = await supabase.from("person_phones").insert({
        user_id: userId,
        person_id: newId,
        raw: ph.raw,
        e164: ph.norm?.e164 ?? null,
        country_code: ph.norm?.countryCode ?? null,
        kind: ph.kind ?? ph.norm?.kind ?? "unknown",
        is_primary: ph.isPrimary || i === 0,
      } as never);
      if (!ins.error) addedPhones.push(ph.norm?.e164 ?? ph.raw);
    }

    if (p.notes && p.notes.trim()) {
      await supabase.from("interactions").insert({
        user_id: userId,
        person_id: newId,
        source_channel: p.sourceChannel ?? "web",
        original_content: p.notes.trim(),
        summary: null,
        interaction_type: "nota",
        occurred_at: new Date().toISOString(),
      } as never);
    }

    return { id: newId, created: true, merged: false, addedPhones, addedRoles: roles };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function mergeInto(
  supabase: any,
  userId: string,
  targetId: string,
  p: PersonInput,
  incomingRoles: DetectedRole[],
  phones: Array<{ raw: string; norm: ReturnType<typeof normalizePhoneE164>; isPrimary: boolean; kind: string | null }>,
  email: string | null,
): Promise<CreateOrMergeResult> {
  const { data: existing } = await supabase.from("people").select("*").eq("id", targetId).maybeSingle();
  if (!existing) throw new Error("Pessoa alvo não encontrada.");

  const existingRoles: DetectedRole[] = sanitizeRoles(existing.roles);
  const mergedRoles = Array.from(new Set([...existingRoles, ...incomingRoles])) as DetectedRole[];
  const addedRoles = mergedRoles.filter((r) => !existingRoles.includes(r));

  const patch: Record<string, unknown> = {};
  if (!existing.email && email) patch.email = email;
  if (!existing.company && p.company) patch.company = p.company;
  if (!existing.job_title && p.jobTitle) patch.job_title = p.jobTitle;
  if (!existing.search_location && p.searchLocation) patch.search_location = p.searchLocation;
  if (!existing.search_property_type && p.searchPropertyType) patch.search_property_type = p.searchPropertyType;
  if (existing.budget_min == null && p.budgetMin != null) patch.budget_min = p.budgetMin;
  if (existing.budget_max == null && p.budgetMax != null) patch.budget_max = p.budgetMax;
  if (!existing.referred_by_person_id && p.referredByPersonId) patch.referred_by_person_id = p.referredByPersonId;
  if (addedRoles.length) patch.roles = mergedRoles;
  if (p.summary && !existing.summary) patch.summary = p.summary;

  if (Object.keys(patch).length) {
    await supabase.from("people").update(patch as never).eq("id", targetId);
  }

  // Telefones novos (por e164)
  const addedPhones: string[] = [];
  for (const ph of phones) {
    if (!ph.norm?.e164 && !ph.raw) continue;
    if (ph.norm?.e164) {
      const existingPhone = await supabase
        .from("person_phones")
        .select("id")
        .eq("user_id", userId)
        .eq("e164", ph.norm.e164)
        .maybeSingle();
      if (existingPhone.data) continue;
    }
    const ins = await supabase.from("person_phones").insert({
      user_id: userId,
      person_id: targetId,
      raw: ph.raw,
      e164: ph.norm?.e164 ?? null,
      country_code: ph.norm?.countryCode ?? null,
      kind: ph.kind ?? ph.norm?.kind ?? "unknown",
      is_primary: false,
    } as never);
    if (!ins.error) addedPhones.push(ph.norm?.e164 ?? ph.raw);
  }

  if (p.notes && p.notes.trim()) {
    await supabase.from("interactions").insert({
      user_id: userId,
      person_id: targetId,
      source_channel: p.sourceChannel ?? "web",
      original_content: p.notes.trim(),
      summary: null,
      interaction_type: "nota",
      occurred_at: new Date().toISOString(),
    } as never);
  }

  return { id: targetId, created: false, merged: true, addedPhones, addedRoles };
}

/* ---------- Telefones ---------- */

export interface PersonPhone {
  id: string;
  raw: string;
  e164: string | null;
  kind: string;
  isPrimary: boolean;
}

export const listPersonPhones = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => v as { personId: string })
  .handler(async ({ data, context }): Promise<PersonPhone[]> => {
    const { supabase } = context;
    const { data: rows, error } = await supabase
      .from("person_phones")
      .select("id,raw,e164,kind,is_primary")
      .eq("person_id", data.personId)
      .order("is_primary", { ascending: false })
      .order("created_at", { ascending: true });
    if (error) throw error;
    return (rows ?? []).map((r) => ({
      id: r.id, raw: r.raw, e164: r.e164, kind: r.kind, isPrimary: r.is_primary,
    }));
  });

export const addPersonPhone = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => v as { personId: string; raw: string; kind?: string; isPrimary?: boolean })
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const norm = normalizePhoneE164(data.raw);
    if (data.isPrimary) {
      await supabase.from("person_phones").update({ is_primary: false } as never).eq("person_id", data.personId);
    }
    const { data: row, error } = await supabase.from("person_phones").insert({
      user_id: userId,
      person_id: data.personId,
      raw: data.raw,
      e164: norm.e164,
      country_code: norm.countryCode,
      kind: data.kind ?? norm.kind,
      is_primary: !!data.isPrimary,
    } as never).select("id").single();
    if (error) throw error;
    // sincroniza people.phone se for primário
    if (data.isPrimary) {
      await supabase.from("people").update({ phone: norm.e164 ?? data.raw } as never).eq("id", data.personId);
    }
    return { id: (row as { id: string }).id };
  });

export const deletePersonPhone = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => v as { id: string })
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("person_phones").delete().eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

export const setPrimaryPhone = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => v as { id: string; personId: string })
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    await supabase.from("person_phones").update({ is_primary: false } as never).eq("person_id", data.personId);
    const { data: row, error } = await supabase.from("person_phones").update({ is_primary: true } as never).eq("id", data.id).select("raw,e164").single();
    if (error) throw error;
    const value = (row as { raw: string; e164: string | null }).e164 ?? (row as { raw: string }).raw;
    await supabase.from("people").update({ phone: value } as never).eq("id", data.personId);
    return { ok: true };
  });

/* ---------- Registo a partir de texto natural (heurística) ---------- */

export const createPersonFromNaturalText = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => v as { text: string; forceCreate?: boolean; targetId?: string | null })
  .handler(async ({ data, context }) => {
    const detected = detectPerson(data.text);
    if (!detected.name && !detected.phones.length && !detected.emails.length) {
      throw new Error("Não consegui identificar nome, telefone ou email na descrição.");
    }
    const person: PersonInput = {
      name: detected.name?.trim() || "Sem nome",
      roles: detected.roles.length ? detected.roles : ["other"],
      phones: detected.phones.map((ph, i) => ({ raw: ph.raw, isPrimary: i === 0, kind: ph.kind })),
      email: detected.emails[0] ?? null,
      company: detected.company,
      searchLocation: detected.location,
      searchPropertyType: detected.propertyType,
      budgetMax: detected.budgetMax,
      notes: data.text,
      sourceChannel: "web",
    };
    return doCreateOrMerge(context.supabase, context.userId, {
      person,
      forceCreate: data.forceCreate ?? false,
      targetId: data.targetId ?? null,
    });
  });

/* ---------- Importar vCard ---------- */

export const importVCardText = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => v as { text: string; forceCreate?: boolean })
  .handler(async ({ data, context }) => {
    const parsed = parseVCard(data.text);
    if (!parsed || !parsed.fullName) throw new Error("vCard inválido ou sem nome.");
    const person: PersonInput = {
      name: parsed.fullName,
      email: parsed.emails[0] ?? null,
      phones: parsed.phones.map((raw, i) => ({ raw, isPrimary: i === 0 })),
      company: parsed.organization,
      jobTitle: parsed.title,
      notes: parsed.notes,
      roles: ["other"],
      sourceChannel: "vcard",
    };
    return doCreateOrMerge(context.supabase, context.userId, {
      person,
      forceCreate: data.forceCreate ?? false,
    });
  });