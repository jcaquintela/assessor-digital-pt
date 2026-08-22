// Convenção de arquivado para IMÓVEIS: a fonte única de verdade é
// `properties.archived_at`. O estado textual (`status = 'arquivado'`) é apenas
// um espelho para leitura humana. Toda a leitura de listas filtra por
// `archived_at is null`, tal como o resumo de /hoje.

export interface PropertyListRow {
  id: string;
  [k: string]: unknown;
}

const COLUMNS =
  "id, title, typology, property_type, city, location, address, source_channel, asking_price, status, owner_person_id, category_id, updated_at";

export async function fetchPropertiesList(
  supabase: any,
  userId: string,
): Promise<PropertyListRow[]> {
  const { data, error } = await supabase
    .from("properties")
    .select(COLUMNS)
    .eq("user_id", userId)
    .is("archived_at", null)
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
}
