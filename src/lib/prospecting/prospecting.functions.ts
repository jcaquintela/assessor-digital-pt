import { createServerFn } from "@tanstack/react-start";
import { TELEMETRY_EVENTS, trackEvent, hoursBetween, leadSource } from "@/lib/telemetry/events";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { detectProspecting } from "./detect";

// ─── Tipos partilhados ──────────────────────────────────────────────────────

export type LeadStatus =
  | "to_contact" | "contact_attempted" | "contacted"
  | "no_interest" | "opportunity" | "converted" | "archived";

export const STATUS_LABEL: Record<LeadStatus, string> = {
  to_contact: "Por contactar",
  contact_attempted: "Contacto tentado",
  contacted: "Contactado",
  no_interest: "Sem interesse",
  opportunity: "Oportunidade",
  converted: "Convertido",
  archived: "Arquivado",
};

export const SOURCE_LABEL: Record<string, string> = {
  street_sign: "Placa na rua",
  referral: "Referência",
  online_listing: "Anúncio online",
  direct_observation: "Observação direta",
  other: "Outra",
};

export const LISTING_LABEL: Record<string, string> = {
  owner_sale: "Venda pelo proprietário",
  other_agency: "Outra agência",
  own_agency: "Angariação própria",
  unknown: "Por confirmar",
};

// ─── Análise de texto (determinística, sem IA) ──────────────────────────────

export const analyzeProspectingText = createServerFn({ method: "POST" })
  .inputValidator((v: unknown) => ({ text: String((v as any)?.text ?? "").slice(0, 2000) }))
  .handler(async ({ data }) => detectProspecting(data.text));

// ─── Análise de fotografia (Gemini vision) ──────────────────────────────────

export const analyzeProspectingImage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => ({ file_id: String((v as any)?.file_id ?? "") }))
  .handler(async ({ data, context }) => {
    if (!data.file_id) throw new Error("file_id required");
    const { data: file, error } = await context.supabase
      .from("uploaded_files")
      .select("id, storage_path, mime_type")
      .eq("id", data.file_id)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!file) throw new Error("ficheiro não encontrado");
    const path = (file as any).storage_path as string;
    const mime = ((file as any).mime_type as string) ?? "image/jpeg";
    if (!mime.startsWith("image/")) throw new Error("não é uma imagem");

    const { data: signed, error: sErr } = await context.supabase.storage
      .from("assessor-files").createSignedUrl(path, 300);
    if (sErr || !signed?.signedUrl) throw new Error("não foi possível ler o ficheiro");

    const key = process.env.LOVABLE_API_KEY;
    if (!key) throw new Error("Serviço de análise indisponível");

    const prompt = [
      "És um analista visual. Recebes a fotografia de uma placa imobiliária.",
      "Extrai APENAS o que está claramente escrito na placa. Não inventes nada.",
      "Devolve JSON estrito com esta forma:",
      '{"phone":"9XXXXXXXX|null","agency_name":"string|null","reference":"string|null","raw_text":"string","is_owner_sale":boolean,"listing_type":"owner_sale|other_agency|unknown","confidence":0.0-1.0}',
      "Regras:",
      "- Se não vires um número de telefone legível, phone=null.",
      "- Não deduzas o nome do proprietário. Não deduzas morada, preço nem tipologia.",
      "- is_owner_sale=true só se aparecer 'vende-se', 'particular', 'próprio' ou equivalente.",
      "- Responde só com o JSON, sem prefácio.",
    ].join("\n");

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-3.6-flash",
        messages: [{
          role: "user",
          content: [
            { type: "text", text: prompt },
            { type: "image_url", image_url: { url: signed.signedUrl } },
          ],
        }],
        temperature: 0,
        response_format: { type: "json_object" },
      }),
    });
    if (!res.ok) {
      const t = await res.text().catch(() => "");
      throw new Error(`Análise falhou (${res.status}): ${t.slice(0, 200)}`);
    }
    const json = (await res.json()) as any;
    const content: string | undefined = json?.choices?.[0]?.message?.content;
    let parsed: any = {};
    try { parsed = content ? JSON.parse(content) : {}; } catch { parsed = { raw_text: content ?? "" }; }

    // Normaliza número
    let phone: string | null = null;
    if (parsed.phone && typeof parsed.phone === "string") {
      const digits = parsed.phone.replace(/\D/g, "");
      const trimmed = digits.length > 9 ? digits.slice(-9) : digits;
      if (/^[239]\d{8}$/.test(trimmed)) phone = trimmed;
    }
    return {
      phone,
      agency_name: typeof parsed.agency_name === "string" ? parsed.agency_name : null,
      reference: typeof parsed.reference === "string" ? parsed.reference : null,
      raw_text: typeof parsed.raw_text === "string" ? parsed.raw_text : "",
      listing_type: parsed.is_owner_sale ? "owner_sale"
        : (parsed.listing_type === "other_agency" || parsed.listing_type === "owner_sale" || parsed.listing_type === "own_agency")
          ? parsed.listing_type : "unknown",
      confidence: Math.max(0, Math.min(1, Number(parsed.confidence ?? 0.5))),
    };
  });

// ─── CRUD ───────────────────────────────────────────────────────────────────

export const listProspectingLeads = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("prospecting_leads" as never)
      .select("*")
      .eq("user_id", context.userId)
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw new Error(error.message);
    return (data as any[]) ?? [];
  });

export const getProspectingLead = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => ({ id: String((v as any)?.id ?? "") }))
  .handler(async ({ context, data }) => {
    if (!data.id) throw new Error("id required");
    const { data: row, error } = await context.supabase
      .from("prospecting_leads" as never)
      .select("*")
      .eq("id", data.id)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("Registo não encontrado.");
    const { data: reminders } = await context.supabase
      .from("follow_ups")
      .select("id, title, due_date, due_time, status, outcome")
      .eq("user_id", context.userId)
      .eq("related_prospecting_lead_id" as never, data.id)
      .order("due_date", { ascending: true });
    return { lead: row, reminders: (reminders as any[]) ?? [] };
  });

export const createProspectingLead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => {
    const o = (v ?? {}) as Record<string, any>;
    return {
      title: String(o.title ?? "").slice(0, 200) || null,
      phone: o.phone ? String(o.phone).slice(0, 30) : null,
      location: o.location ? String(o.location).slice(0, 200) : null,
      address: o.address ? String(o.address).slice(0, 200) : null,
      source_type: (o.source_type ?? "other") as string,
      listing_type: (o.listing_type ?? "unknown") as string,
      agency_name: o.agency_name ? String(o.agency_name).slice(0, 120) : null,
      property_type: o.property_type ? String(o.property_type).slice(0, 60) : null,
      typology: o.typology ? String(o.typology).slice(0, 20) : null,
      notes: o.notes ? String(o.notes).slice(0, 2000) : null,
      source_channel: (o.source_channel ?? "web") as string,
      image_file_id: o.image_file_id ? String(o.image_file_id) : null,
      extraction_confidence: typeof o.extraction_confidence === "number" ? o.extraction_confidence : null,
      extraction_raw: (o.extraction_raw && typeof o.extraction_raw === "object") ? o.extraction_raw : {},
    };
  })
  .handler(async ({ context, data }) => {
    // Deduplicação por número dentro do mesmo utilizador
    if (data.phone) {
      const { data: dup } = await context.supabase
        .from("prospecting_leads" as never)
        .select("id, title, location")
        .eq("user_id", context.userId)
        .eq("phone", data.phone)
        .neq("status", "archived")
        .limit(1)
        .maybeSingle();
      if (dup) return { duplicate: true, existing: dup };
    }
    const title = data.title ?? [
      data.location ? `Placa em ${data.location}` : "Placa de prospeção",
      data.phone ? `— ${data.phone}` : "",
    ].filter(Boolean).join(" ");

    const row = {
      user_id: context.userId,
      title,
      phone: data.phone,
      location: data.location,
      address: data.address,
      source_type: data.source_type,
      listing_type: data.listing_type,
      agency_name: data.agency_name,
      property_type: data.property_type,
      typology: data.typology,
      notes: data.notes,
      source_channel: data.source_channel,
      image_file_id: data.image_file_id,
      extraction_confidence: data.extraction_confidence,
      extraction_raw: data.extraction_raw,
      status: "to_contact",
    };
    const { data: created, error } = await context.supabase
      .from("prospecting_leads" as never)
      .insert(row as never)
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    const leadId = (created as any).id as string;
    await trackEvent(context.supabase, {
      userId: context.userId,
      event: TELEMETRY_EVENTS.leadRegistado,
      leadId,
      channel: data.source_channel,
      properties: { fonte: leadSource(data), source_type: data.source_type },
    });
    return { duplicate: false, id: leadId };
  });

export const updateProspectingLead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => {
    const o = (v ?? {}) as Record<string, any>;
    const patch: Record<string, unknown> = {};
    const allowed = [
      "title", "phone", "location", "address", "agency_name", "contact_name",
      "property_type", "typology", "asking_price", "notes", "status",
      "listing_type", "source_type", "next_follow_up_at",
    ] as const;
    for (const k of allowed) if (k in o) patch[k] = o[k];
    return { id: String(o.id ?? ""), patch };
  })
  .handler(async ({ context, data }) => {
    if (!data.id) throw new Error("id required");
    let previous: any = null;
    if (data.patch["status"] === "contacted") {
      const { data: cur } = await context.supabase
        .from("prospecting_leads" as never)
        .select("status, created_at, source_channel")
        .eq("id", data.id)
        .eq("user_id", context.userId)
        .maybeSingle();
      previous = cur;
    }
    const { error } = await context.supabase
      .from("prospecting_leads" as never)
      .update(data.patch as never)
      .eq("id", data.id)
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    // Só conta como contacto confirmado pelo consultor (nunca lembretes enviados).
    if (previous && previous.status !== "contacted") {
      await trackEvent(context.supabase, {
        userId: context.userId,
        event: TELEMETRY_EVENTS.leadContactado,
        leadId: data.id,
        channel: previous.source_channel ?? null,
        properties: { horas_desde_registo: hoursBetween(previous.created_at), origem: "dashboard" },
      });
    }
    return { ok: true };
  });

export const addContactAttempt = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => {
    const o = (v ?? {}) as any;
    return {
      id: String(o.id ?? ""),
      outcome: (o.outcome ?? "contact_attempted") as "contact_attempted" | "contacted" | "no_interest",
      notes: o.notes ? String(o.notes).slice(0, 500) : null,
    };
  })
  .handler(async ({ context, data }) => {
    if (!data.id) throw new Error("id required");
    const { data: current } = await context.supabase
      .from("prospecting_leads" as never)
      .select("contact_attempts, notes, status, created_at, source_channel")
      .eq("id", data.id)
      .eq("user_id", context.userId)
      .maybeSingle();
    const attempts = ((current as any)?.contact_attempts ?? 0) + 1;
    const prevNotes = (current as any)?.notes ?? "";
    const stamp = new Date().toLocaleString("pt-PT");
    const label = data.outcome === "contacted" ? "Contactado" : data.outcome === "no_interest" ? "Sem interesse" : "Tentativa";
    const appended = data.notes ? `${stamp} — ${label}: ${data.notes}` : `${stamp} — ${label}`;
    const newNotes = prevNotes ? `${prevNotes}\n${appended}` : appended;

    const { error } = await context.supabase
      .from("prospecting_leads" as never)
      .update({
        contact_attempts: attempts,
        last_contact_attempt_at: new Date().toISOString(),
        status: data.outcome,
        notes: newNotes,
      } as never)
      .eq("id", data.id)
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    if (data.outcome === "contacted" && (current as any)?.status !== "contacted") {
      await trackEvent(context.supabase, {
        userId: context.userId,
        event: TELEMETRY_EVENTS.leadContactado,
        leadId: data.id,
        channel: (current as any)?.source_channel ?? null,
        properties: {
          horas_desde_registo: hoursBetween((current as any)?.created_at),
          origem: "confirmacao_consultor",
          tentativas: attempts,
        },
      });
    }
    return { ok: true };
  });

export const archiveProspectingLead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => ({ id: String((v as any)?.id ?? "") }))
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => ({ id: String((v as any)?.id ?? "") }))
  .handler(async ({ context, data }) => {
    if (!data.id) throw new Error("id required");
    const { error } = await context.supabase
      .from("prospecting_leads" as never)
      .update({ status: "archived" } as never)
      .eq("id", data.id)
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const createProspectingReminder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => {
    const o = (v ?? {}) as any;
    return {
      id: String(o.id ?? ""),
      due_date: String(o.due_date ?? ""),
      due_time: o.due_time ? String(o.due_time) : null,
      title: o.title ? String(o.title).slice(0, 200) : null,
    };
  })
  .handler(async ({ context, data }) => {
    if (!data.id) throw new Error("id required");
    if (!data.due_date) throw new Error("due_date required");
    const { data: lead } = await context.supabase
      .from("prospecting_leads" as never)
      .select("title, location, phone")
      .eq("id", data.id)
      .eq("user_id", context.userId)
      .maybeSingle();
    const l = lead as any;
    const title = data.title
      ?? `Contactar placa${l?.location ? ` em ${l.location}` : ""}${l?.phone ? ` — ${l.phone}` : ""}`;
    const { error, data: created } = await context.supabase
      .from("follow_ups")
      .insert({
        user_id: context.userId,
        title,
        type: "Tarefa",
        due_date: data.due_date,
        due_time: data.due_time,
        status: "Aberto",
        priority: "Média",
        source_channel: "web",
        related_prospecting_lead_id: data.id,
      } as never)
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    await context.supabase
      .from("prospecting_leads" as never)
      .update({ next_follow_up_at: data.due_date } as never)
      .eq("id", data.id)
      .eq("user_id", context.userId);
    return { id: (created as any)?.id as string };
  });

// ─── Conversão para Imóvel + Oportunidade ───────────────────────────────────

export const convertProspectingLead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => {
    const o = (v ?? {}) as any;
    return {
      id: String(o.id ?? ""),
      person_name: o.person_name ? String(o.person_name).slice(0, 120) : null,
      property_title: o.property_title ? String(o.property_title).slice(0, 200) : null,
      asking_price: typeof o.asking_price === "number" ? o.asking_price : null,
      typology: o.typology ? String(o.typology).slice(0, 20) : null,
    };
  })
  .handler(async ({ context, data }) => {
    if (!data.id) throw new Error("id required");
    const { data: lead, error: lerr } = await context.supabase
      .from("prospecting_leads" as never)
      .select("*")
      .eq("id", data.id)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (lerr) throw new Error(lerr.message);
    if (!lead) throw new Error("Registo não encontrado.");
    const l = lead as any;

    // Pessoa (se nome fornecido e ainda não ligada)
    let personId: string | null = l.related_person_id ?? null;
    if (!personId && data.person_name) {
      const { data: p, error: perr } = await context.supabase
        .from("people")
        .insert({
          user_id: context.userId,
          name: data.person_name,
          phone: l.phone,
          relationship_type: "Proprietário",
          summary: l.location ? `Contacto de placa em ${l.location}` : "Contacto de placa",
        } as never)
        .select("id")
        .single();
      if (perr) throw new Error(perr.message);
      personId = (p as any).id as string;
    }

    // Imóvel
    let propertyId: string | null = l.related_property_id ?? null;
    if (!propertyId) {
      const title = data.property_title ?? l.title ?? "Imóvel em angariação";
      const { data: prop, error: prerr } = await context.supabase
        .from("properties")
        .insert({
          user_id: context.userId,
          owner_person_id: personId,
          title,
          typology: data.typology ?? l.typology,
          location: l.location,
          address: l.address,
          asking_price: data.asking_price ?? l.asking_price,
          property_type: l.property_type,
          status: "Em angariação",
          notes: l.notes,
          source_channel: l.source_channel,
        } as never)
        .select("id")
        .single();
      if (prerr) throw new Error(prerr.message);
      propertyId = (prop as any).id as string;
    }

    await context.supabase
      .from("prospecting_leads" as never)
      .update({
        status: "converted",
        related_person_id: personId,
        related_property_id: propertyId,
      } as never)
      .eq("id", data.id)
      .eq("user_id", context.userId);

    return { person_id: personId, property_id: propertyId };
  });