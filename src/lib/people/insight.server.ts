// Factos de contacto das pessoas — usa a fonte única de "contacto real"
// (`src/lib/insights/last-contact.server.ts`), nunca lógica própria.

import type { StalledItem } from "@/lib/insights/factual";
import { computeLastContact } from "@/lib/insights/last-contact.server";
import { personCategoryKeys, SEM_CATEGORIA } from "./category-cards";
import type { PeopleExtras } from "./insight";

export async function computePeopleFacts(
  supabase: any,
  userId: string,
): Promise<{ items: StalledItem[]; extras: PeopleExtras; total: number }> {
  const [{ maps }, res] = await Promise.all([
    computeLastContact(supabase, userId),
    supabase
      .from("people")
      .select("id, name, phone, email, roles, relationship_type, created_at, archived_at")
      .eq("user_id", userId)
      .is("archived_at", null)
      .limit(1000),
  ]);

  const now = Date.now();
  const dias = (iso: string | null) => (iso ? Math.floor((now - new Date(iso).getTime()) / 864e5) : 0);
  const rows = ((res.data as any[]) ?? []);

  const items: StalledItem[] = rows.map((p) => {
    const desde = maps.byPerson.get(p.id) ?? p.created_at ?? null;
    return {
      id: p.id as string,
      label: String(p.name ?? "").trim() || "Pessoa sem nome",
      days: dias(desde),
      since: desde,
    };
  });

  const extras: PeopleExtras = {
    semCategoria: rows.filter((p) =>
      personCategoryKeys({ id: p.id, papeis: p.roles, relacao: p.relationship_type })[0] === SEM_CATEGORIA,
    ).length,
    semContacto: rows.filter((p) => !String(p.phone ?? "").trim() && !String(p.email ?? "").trim()).length,
  };

  return { items, extras, total: rows.length };
}
