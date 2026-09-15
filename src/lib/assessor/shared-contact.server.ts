// Cartão de contacto partilhado → pessoa.
// Reaproveita integralmente o fluxo já testado do cartão de visita
// fotografado (proposta → confirmação → criação), trocando apenas a leitura
// da imagem pelos campos que o canal já entrega prontos.

import type { SharedContactCard } from "./shared-contact";
import { normalizeSharedPhone } from "./shared-contact";

export interface ExistingPerson {
  id: string;
  name: string | null;
}

/** Já existe esta pessoa? Telefone e email são identificadores fortes. */
export async function findExistingPersonForCard(
  supabase: any,
  userId: string,
  card: SharedContactCard,
): Promise<ExistingPerson | null> {
  const digits = card.phone ? card.phone.replace(/\D/g, "") : null;

  if (digits) {
    try {
      const { data } = await supabase
        .from("person_phones")
        .select("person_id, people:person_id(id, name)")
        .eq("user_id", userId)
        .eq("e164", card.phone)
        .limit(1);
      const hit = (data as any[])?.[0];
      if (hit?.person_id) {
        return { id: String(hit.person_id), name: hit?.people?.name ?? null };
      }
    } catch { /* best-effort */ }
  }

  const filters: string[] = [];
  if (card.phone) filters.push(`phone.eq.${card.phone}`);
  if (digits && digits !== card.phone) filters.push(`phone.eq.${digits}`);
  if (card.email) filters.push(`email.eq.${card.email}`);
  if (filters.length) {
    try {
      const { data } = await supabase
        .from("people")
        .select("id, name")
        .eq("user_id", userId)
        .or(filters.join(","))
        .limit(1);
      const hit = (data as any[])?.[0];
      if (hit?.id) return { id: String(hit.id), name: hit.name ?? null };
    } catch { /* best-effort */ }
  }

  // Sem telefone nem email coincidentes: nome exacto na mesma conta.
  try {
    const { resolvePersonForWrite } = await import("@/lib/people/resolve-person.server");
    const res = await resolvePersonForWrite(
      { supabase, userId } as any,
      card.name,
      { nameOverride: card.name },
    );
    if (res.status === "linked" && res.personId) {
      return { id: res.personId, name: res.name ?? card.name };
    }
  } catch { /* best-effort */ }

  return null;
}

/** Números secundários do cartão ficam associados à pessoa. */
export async function saveExtraPhones(
  supabase: any,
  userId: string,
  personId: string,
  phones: string[],
): Promise<void> {
  for (const raw of phones) {
    const e164 = normalizeSharedPhone(raw);
    if (!e164) continue;
    try {
      const { data: exists } = await supabase
        .from("person_phones")
        .select("id")
        .eq("user_id", userId)
        .eq("e164", e164)
        .limit(1);
      if ((exists as any[])?.length) continue;
      await supabase.from("person_phones").insert({
        user_id: userId,
        person_id: personId,
        raw,
        e164,
        kind: "unknown",
        is_primary: false,
      } as never);
    } catch { /* best-effort */ }
  }
}

/** Houve um pedido explícito ("guarda o contacto") mesmo antes do cartão? */
export async function hadRecentSaveRequest(
  supabase: any,
  userId: string,
  channel: string,
  now: Date = new Date(),
): Promise<boolean> {
  try {
    const { looksLikeSaveContactRequest } = await import("./shared-contact");
    const since = new Date(now.getTime() - 15 * 60 * 1000).toISOString();
    const { data } = await supabase
      .from("assessor_messages")
      .select("content, role, created_at")
      .eq("user_id", userId)
      .eq("channel", channel)
      .eq("role", "user")
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(4);
    for (const row of ((data as any[]) ?? [])) {
      if (looksLikeSaveContactRequest(row?.content)) return true;
    }
    return false;
  } catch {
    return false;
  }
}
