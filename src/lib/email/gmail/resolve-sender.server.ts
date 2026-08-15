// Liga um email recebido a uma Pessoa.
//
// Ordem: endereço de email (determinístico) → resolução por nome com as
// mesmas regras já validadas em produção (confirmação obrigatória em
// correspondências parciais, memória de rejeição, sem duplicados).

import { resolvePersonForWrite, type PersonResolution } from "@/lib/people/resolve-person.server";
import { parseFromHeader, normalizeEmail } from "./sender";

export interface IncomingEmail {
  from: string | null;
  subject?: string | null;
  snippet?: string | null;
}

export async function resolveSenderPerson(
  ctx: { supabase: any; userId: string; channel?: string },
  email: IncomingEmail,
  opts?: { excludeIds?: string[] },
): Promise<PersonResolution & { matchedBy: "email" | "name" | "none" }> {
  const parsed = parseFromHeader(email.from);
  const senderEmail = normalizeEmail(parsed?.email);

  if (senderEmail) {
    const byEmail = await resolvePersonForWrite(ctx, "", {
      excludeIds: opts?.excludeIds ?? [],
      senderEmail,
    });
    if (byEmail.status === "linked" && byEmail.personId) {
      return { ...byEmail, matchedBy: "email" };
    }
  }

  // Sem correspondência de email: cai na resolução por nome (mesmas regras).
  const nameText = [parsed?.name, email.subject].filter(Boolean).join(" ");
  if (!nameText.trim()) {
    return { status: "none", personId: null, name: null, candidates: [], matchedBy: "none" };
  }
  const byName = await resolvePersonForWrite(ctx, nameText, {
    excludeIds: opts?.excludeIds ?? [],
  });
  return { ...byName, matchedBy: byName.status === "none" ? "none" : "name" };
}