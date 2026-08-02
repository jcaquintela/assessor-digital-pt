import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// Categorias de imóveis — mesmo mecanismo das categorias do Drive
// (nome + cor, por consultor), aplicado agora a imóveis.

export type PropertyCategory = { id: string; name: string; color: string | null };

function cleanName(v: unknown): string {
  const s = String(v ?? "").trim();
  if (!s) throw new Error("O nome da categoria não pode ficar vazio.");
  if (s.length > 40) throw new Error("Nome demasiado longo (máx. 40).");
  return s;
}

function cleanColor(v: unknown): string | null {
  const s = String(v ?? "").trim();
  if (!s) return null;
  if (!/^#[0-9a-fA-F]{6}$/.test(s)) return null;
  return s.toLowerCase();
}

export const listPropertyCategories = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data, error } = await (supabase.from("property_categories") as any)
      .select("id, name, color")
      .eq("user_id", userId)
      .order("name");
    if (error) throw new Error(error.message);
    return (data ?? []) as PropertyCategory[];
  });

export const createPropertyCategory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { name: string; color?: string | null }) => ({
    name: cleanName(data?.name),
    color: cleanColor(data?.color),
  }))
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const { data: existing } = await (supabase.from("property_categories") as any)
      .select("id, name, color")
      .eq("user_id", userId)
      .ilike("name", data.name)
      .maybeSingle();
    if (existing) return existing as PropertyCategory;

    const insert: any = { user_id: userId, name: data.name };
    if (data.color) insert.color = data.color;
    const { data: row, error } = await (supabase.from("property_categories") as any)
      .insert(insert)
      .select("id, name, color")
      .single();
    if (error) {
      if (error.code === "23505") {
        const { data: dup } = await (supabase.from("property_categories") as any)
          .select("id, name, color")
          .eq("user_id", userId)
          .ilike("name", data.name)
          .maybeSingle();
        if (dup) return dup as PropertyCategory;
      }
      throw new Error(error.message);
    }
    return row as PropertyCategory;
  });

export const renamePropertyCategory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { id: string; name: string; color?: string | null }) => ({
    id: String(data?.id ?? ""),
    name: cleanName(data?.name),
    color: cleanColor(data?.color),
  }))
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const { error } = await (supabase.from("property_categories") as any)
      .update({ name: data.name, color: data.color })
      .eq("id", data.id)
      .eq("user_id", userId);
    if (error) {
      if (error.code === "23505") throw new Error("Já tens uma categoria com esse nome.");
      throw new Error(error.message);
    }
    return { ok: true };
  });

// Apagar a categoria não apaga imóveis: ficam simplesmente sem categoria.
export const deletePropertyCategory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { id: string }) => data)
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const { error } = await (supabase.from("property_categories") as any)
      .delete()
      .eq("id", data.id)
      .eq("user_id", userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const setPropertyCategory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { propertyId: string; categoryId: string | null }) => data)
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    if (data.categoryId) {
      const { data: cat } = await (supabase.from("property_categories") as any)
        .select("id")
        .eq("id", data.categoryId)
        .eq("user_id", userId)
        .maybeSingle();
      if (!cat) throw new Error("Categoria não encontrada.");
    }
    const { error } = await (supabase.from("properties") as any)
      .update({ category_id: data.categoryId })
      .eq("id", data.propertyId)
      .eq("user_id", userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });