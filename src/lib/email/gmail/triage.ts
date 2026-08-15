// Triagem de inbox: separar sinal de ruído.
//
// Um consultor não quer saber que a Zara tem saldos. Quer saber que a Ana
// Silva respondeu. Por isso o default é: primeiro quem já é pessoa conhecida
// no Afonso, depois pessoas desconhecidas mas com ar de conversa real, e o
// resto (newsletters, notificações, promoções) fica contado mas fora da lista.
//
// Sem IA e sem escritas: só heurística sobre o remetente e o assunto.

import { parseFromHeader } from "./sender";

export type EmailRow = {
  id: string;
  thread_id?: string | null;
  from: string | null;
  subject: string | null;
  snippet?: string | null;
  sent_at?: string | null;
  is_read?: boolean | null;
};

export type EmailBucket = "known_person" | "personal" | "noise";

export type TriagedEmail = EmailRow & {
  bucket: EmailBucket;
  person_id?: string | null;
  person_name?: string | null;
};

const NOREPLY_LOCAL =
  /(^|[._-])(no-?reply|do-?not-?reply|nao-?responder|notification[s]?|notifica(coes|ções)|newsletter|news|mailer|mailing|marketing|promo(cao|ções|tions)?|info|noticias|updates?|alerts?|support|suporte|billing|faturacao|automated|auto|bounce|postmaster|hello|contact[o]?)([._-]|\d|$)/i;

const NOISE_DOMAIN =
  /(^|\.)(mailchimp|mailchimpapp|sendgrid|sendinblue|brevo|hubspot|klaviyo|substack|mailerlite|campaign-archive|sparkpostmail|amazonses|intercom|zendesk|salesforce|braze)\b/i;

const NOISE_BRAND_DOMAIN =
  /(^|\.)(linkedin|facebook|facebookmail|instagram|twitter|x|tiktok|youtube|netflix|spotify|strava|zara|hm|shein|amazon|aliexpress|ebay|glovo|uber|booking|airbnb|ryanair|pinterest|reddit|medium|slack|notion|trello|indeed|glassdoor|net-empregos|discord|steam|paypal|temu|worten|fnac|continente|pingodoce)\./i;

const NOISE_SUBJECT =
  /(newsletter|unsubscribe|cancelar (a )?subscri|promo(ç|c)(ão|ao|ões|oes)|desconto|saldos?|black friday|últimas? (horas|unidades)|encomenda|fatura mensal|novidades da semana|webinar|vagas? de emprego|novas? oport(unidade)s? de emprego|resumo semanal|weekly (digest|recap)|% off|oferta[s]? (especial|exclusiv))/i;

/** Verdadeiro quando o email tem cara de automático/marketing. */
export function looksLikeNoise(row: Pick<EmailRow, "from" | "subject">): boolean {
  const parsed = parseFromHeader(row.from);
  const email = parsed?.email ?? String(row.from ?? "").toLowerCase();
  const [local = "", domain = ""] = email.split("@");
  if (NOREPLY_LOCAL.test(local)) return true;
  if (NOISE_DOMAIN.test(domain)) return true;
  if (NOISE_BRAND_DOMAIN.test(`${domain}.`)) return true;
  if (NOISE_SUBJECT.test(String(row.subject ?? ""))) return true;
  return false;
}

export type KnownPerson = { id: string; name: string | null; email_normalized: string };

/**
 * Classifica e ordena: pessoas conhecidas primeiro, depois humanos
 * desconhecidos, e o ruído no fim (contado, não sugerido).
 */
export function triageEmails(rows: EmailRow[], known: KnownPerson[]): TriagedEmail[] {
  const byEmail = new Map<string, KnownPerson>();
  for (const p of known) {
    const e = String(p.email_normalized ?? "").trim().toLowerCase();
    if (e) byEmail.set(e, p);
  }
  const rank: Record<EmailBucket, number> = { known_person: 0, personal: 1, noise: 2 };
  return rows
    .map((r) => {
      const email = parseFromHeader(r.from)?.email ?? "";
      const person = email ? byEmail.get(email) : undefined;
      if (person) {
        return { ...r, bucket: "known_person" as const, person_id: person.id, person_name: person.name };
      }
      return { ...r, bucket: looksLikeNoise(r) ? ("noise" as const) : ("personal" as const) };
    })
    .sort((a, b) => {
      const d = rank[a.bucket] - rank[b.bucket];
      if (d !== 0) return d;
      return String(b.sent_at ?? "").localeCompare(String(a.sent_at ?? ""));
    });
}

/** Nomes legíveis dos remetentes relevantes, para a frase de resumo. */
export function senderLabel(row: TriagedEmail): string {
  if (row.person_name) return row.person_name;
  const parsed = parseFromHeader(row.from);
  return parsed?.name || parsed?.email || String(row.from ?? "").trim() || "Remetente";
}
