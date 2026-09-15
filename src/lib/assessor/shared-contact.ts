// Cartão de contacto partilhado nativamente (WhatsApp "contacts",
// Telegram "contact"). Lógica pura: converter o cartão do canal para o
// mesmo formato que o cartão de visita fotografado já usa, para reaproveitar
// todo o fluxo de proposta/confirmação/criação de pessoa.

import type { NormalizedContactCard } from "./channel-gateway/types";

export interface SharedContactCard {
  name: string;
  phone: string | null;
  email: string | null;
  company: string | null;
  jobTitle: string | null;
}

export interface SharedContactResult {
  card: SharedContactCard | null;
  /** Números adicionais do cartão (o primeiro fica como principal). */
  extraPhones: string[];
  /** Porque não dá para guardar já: falta nome ou falta contacto. */
  missing: "name" | "phone" | null;
}

/** Mantém o formato internacional quando existe; caso contrário, só dígitos. */
export function normalizeSharedPhone(raw: string | null | undefined): string | null {
  const cleaned = String(raw ?? "").replace(/[^\d+]/g, "");
  const plus = cleaned.startsWith("+");
  const digits = cleaned.replace(/\D/g, "");
  if (digits.length < 9) return null;
  return plus ? `+${digits}` : digits;
}

function cleanEmail(raw: string | null | undefined): string | null {
  const v = String(raw ?? "").trim();
  return /\S+@\S+\.\S+/.test(v) ? v : null;
}

export function sharedContactToCard(contact: NormalizedContactCard): SharedContactResult {
  const name = String(contact?.name ?? "").trim();
  const phones: string[] = [];
  for (const p of contact?.phones ?? []) {
    const norm = normalizeSharedPhone(p);
    if (norm && !phones.includes(norm)) phones.push(norm);
  }
  const email = (contact?.emails ?? []).map(cleanEmail).find(Boolean) ?? null;

  if (!name) return { card: null, extraPhones: [], missing: "name" };
  if (!phones.length && !email) return { card: null, extraPhones: [], missing: "phone" };

  return {
    card: {
      name,
      phone: phones[0] ?? null,
      email,
      company: contact?.company ?? null,
      jobTitle: contact?.jobTitle ?? null,
    },
    extraPhones: phones.slice(1),
    missing: null,
  };
}

/** "Guarda o contacto", "grava este contacto" — pedido já feito em texto. */
export function looksLikeSaveContactRequest(text: string | null | undefined): boolean {
  const t = String(text ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  if (!t.trim()) return false;
  const verb = /(guarda|guardar|grava|gravar|regista|registar|adiciona|adicionar|apontar|aponta)/;
  const noun = /(contacto|contato|numero|pessoa|cartao)/;
  return verb.test(t) && noun.test(t);
}

export function missingContactReply(result: SharedContactResult): string {
  if (result.missing === "name") {
    return "Recebi o cartão de contacto, mas vem sem nome. Como é que o queres guardar?";
  }
  return "Recebi o cartão, mas não traz número nem email. Qual é o contacto?";
}

export function alreadyKnownReply(name: string): string {
  return `Já tinha ${name} nos contactos — não dupliquei nada.`;
}
