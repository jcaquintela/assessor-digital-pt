// Dados 100% sintéticos para o staging AFONSO 2.0. Nunca copiar dados reais.
// Emails no domínio reservado .invalid (RFC 2606), telefones no indicativo 999
// (não atribuído pela UIT) e chat ids Telegram fora da gama de utilizadores.

export const SYNTHETIC_MARKER = "stg-synthetic";
export const SYNTHETIC_EMAIL_DOMAIN = "afonso-staging.invalid";

export interface SyntheticConsultant {
  key: "A" | "B" | "C";
  email: string;
  name: string;
  whatsappPhone: string;
  telegramChatId: string;
}

export interface SyntheticPerson {
  owner: SyntheticConsultant["key"];
  name: string;
  phone: string;
  email: string;
  note: string;
}

export interface SyntheticProperty {
  owner: SyntheticConsultant["key"];
  reference: string;
  title: string;
  typology: string;
  zone: string;
  askingPrice: number;
}

export interface SyntheticDataset {
  marker: string;
  consultants: SyntheticConsultant[];
  people: SyntheticPerson[];
  properties: SyntheticProperty[];
}

const pad = (n: number, w: number) => String(n).padStart(w, "0");

export function buildSyntheticDataset(): SyntheticDataset {
  const keys = ["A", "B", "C"] as const;
  const consultants = keys.map((key, i) => ({
    key,
    email: `consultor-${key.toLowerCase()}@${SYNTHETIC_EMAIL_DOMAIN}`,
    name: `Consultor ${key} (sintético)`,
    whatsappPhone: `999000${pad(i + 1, 4)}`,
    telegramChatId: `900000000${pad(i + 1, 4)}`,
  }));
  const people: SyntheticPerson[] = [];
  const properties: SyntheticProperty[] = [];
  consultants.forEach((c, ci) => {
    for (let j = 1; j <= 3; j++) {
      people.push({
        owner: c.key,
        name: `Cliente ${c.key}${j} (sintético)`,
        phone: `999100${pad(ci * 10 + j, 4)}`,
        email: `cliente-${c.key.toLowerCase()}${j}@${SYNTHETIC_EMAIL_DOMAIN}`,
        note: `${SYNTHETIC_MARKER}: comprador T${j} — dados fictícios`,
      });
      properties.push({
        owner: c.key,
        reference: `STG-${c.key}${pad(j, 3)}`,
        title: `Imóvel sintético ${c.key}${j}`,
        typology: `T${j}`,
        zone: ["Zona Teste Norte", "Zona Teste Centro", "Zona Teste Sul"][j - 1],
        askingPrice: 150000 + 50000 * j,
      });
    }
  });
  return { marker: SYNTHETIC_MARKER, consultants, people, properties };
}

const REAL_PT_MOBILE = /^(\+|00)?351\s?9\d{8}$/;

/** Lista de motivos pelos quais um valor pode não ser sintético (vazio = ok). */
export function syntheticViolations(ds: SyntheticDataset): string[] {
  const out: string[] = [];
  const emails = [...ds.consultants.map((c) => c.email), ...ds.people.map((p) => p.email)];
  const phones = [...ds.consultants.map((c) => c.whatsappPhone), ...ds.people.map((p) => p.phone)];
  for (const e of emails) if (!e.endsWith(`@${SYNTHETIC_EMAIL_DOMAIN}`)) out.push(`email não sintético: ${e}`);
  for (const p of phones) {
    if (REAL_PT_MOBILE.test(p)) out.push(`telefone com formato real PT: ${p}`);
    if (!p.startsWith("999")) out.push(`telefone fora do indicativo 999: ${p}`);
  }
  for (const c of ds.consultants) if (Number(c.telegramChatId) < 9e12) out.push(`chat id na gama real: ${c.telegramChatId}`);
  return out;
}

/**
 * Barreira na própria base de dados: aborta se existir QUALQUER conta que não
 * seja sintética. Na base da produção (contas reais) recusa sempre.
 */
export const STAGING_DB_PREFLIGHT_SQL = `DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.profiles WHERE coalesce(email, '') NOT LIKE '%@${SYNTHETIC_EMAIL_DOMAIN}') THEN
    RAISE EXCEPTION 'staging: existem contas não sintéticas — esta não é uma base de staging';
  END IF;
END $$;`;

/**
 * Limpeza de resíduos herdados das migrações históricas (registos de auditoria
 * de fusões manuais da V1 com texto real). Só corre depois do preflight.
 */
export const STAGING_SANITIZE_SQL = `${STAGING_DB_PREFLIGHT_SQL}
DELETE FROM public.admin_audit_logs WHERE metadata->>'source' = 'manual:migration';`;
