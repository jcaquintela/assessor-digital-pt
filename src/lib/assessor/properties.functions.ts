import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const listProperties = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data, error } = await supabase
      .from("properties")
      .select("id, title, typology, property_type, city, location, address, source_channel, asking_price, status, owner_person_id, category_id, updated_at")
      .eq("user_id", userId)
      .order("updated_at", { ascending: false })
      .limit(200);
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as any[];
    const ids = rows.map((r) => r.id);
    const counts: Record<string, number> = {};
    if (ids.length) {
      const { data: files } = await supabase
        .from("uploaded_files")
        .select("related_resource_id")
        .eq("user_id", userId)
        .eq("related_resource_type", "property")
        .in("related_resource_id", ids);
      for (const f of (files ?? []) as any[]) {
        const k = f.related_resource_id as string;
        counts[k] = (counts[k] ?? 0) + 1;
      }
    }
    return rows.map((r) => ({ ...r, file_count: counts[r.id] ?? 0 }));
  });

export const getProperty = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { id: string }) => data)
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const [propRes, filesRes, fuRes] = await Promise.all([
      supabase
        .from("properties")
        .select("*")
        .eq("id", data.id)
        .eq("user_id", userId)
        .maybeSingle(),
      (async () => {
        // Inclui documentos ligados por qualquer via (também via negócio).
        const { listRelatedFiles } = await import("@/lib/drive/related-files.server");
        const rows = await listRelatedFiles(supabase, userId, "property", data.id);
        return {
          data: rows.map((f: any) => ({
            id: f.id,
            original_file_name: f.name,
            mime_type: f.mime_type,
            document_type: f.document_type,
            user_description: f.user_description,
            created_at: f.created_at,
            via: f.via?.label ?? null,
          })),
        } as any;
      })(),
      (supabase.from("follow_ups") as any)
        .select("id, title, type, due_date, due_time, status")
        .eq("user_id", userId)
        .eq("related_property_id", data.id)
        .order("due_date", { ascending: false })
        .limit(20),
    ]);
    if (propRes.error) throw new Error(propRes.error.message);
    if (!propRes.data) throw new Error("Imóvel não encontrado.");
    let owner: { id: string; name: string } | null = null;
    const ownerId = (propRes.data as any).owner_person_id as string | null;
    if (ownerId) {
      const { data: p } = await supabase
        .from("people")
        .select("id, name")
        .eq("id", ownerId)
        .maybeSingle();
      owner = (p as any) ?? null;
    }
    return {
      property: propRes.data,
      owner,
      files: filesRes.data ?? [],
      followUps: fuRes.data ?? [],
    };
  });

export const updatePropertyFields = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { id: string; patch: Record<string, unknown> }) => data)
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const allowed = new Set([
      "title", "typology", "property_type", "city", "location", "address",
      "postal_code", "parish", "asking_price", "estimated_value",
      "area_gross", "area_useful", "bedrooms", "bathrooms", "parking",
      "energy_rating", "status", "notes", "owner_person_id", "category",
    ]);
    const patch: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(data.patch)) {
      if (allowed.has(k)) patch[k] = v === "" ? null : v;
    }
    if (Object.keys(patch).length === 0) return { ok: true };
    const { error } = await (supabase.from("properties") as any)
      .update(patch)
      .eq("id", data.id)
      .eq("user_id", userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// O dashboard pode criar imóveis diretamente (já não só por conversa).
export const createProperty = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { address: string; typology?: string; asking_price?: number | null; status?: string }) => {
    const address = String(data?.address ?? "").trim();
    if (!address) throw new Error("A morada é obrigatória.");
    return { ...data, address };
  })
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const { data: row, error } = await (supabase.from("properties") as any)
      .insert({
        user_id: userId,
        title: data.address,
        address: data.address,
        typology: data.typology?.trim() || null,
        asking_price: data.asking_price ?? null,
        status: data.status || "por_angariar",
        source_channel: "web",
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return row as { id: string };
  });

export const deleteProperty = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { id: string }) => data)
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const { error } = await (supabase.from("properties") as any)
      .delete().eq("id", data.id).eq("user_id", userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });