// Ligação segura entre canais de contas separadas — partes puras.
//
// Caso real: o consultor respondeu "não" no primeiro contacto do Telegram e
// ficou com uma conta nova; o WhatsApp está noutra conta. Regras:
// - nunca há fusão automática de contas;
// - a ligação exige prova de posse dos DOIS lados (o chat onde se pede e
//   um código enviado ao outro canal, ou um link de uso único gerado no
//   outro canal);
// - as respostas nunca revelam se um número tem conta (resposta uniforme);
// - o canal só muda de conta se a conta de origem estiver vazia; com
//   registos próprios, fica tudo como está e a equipa é avisada.

export const CROSS_LINK_FLAG = "assessor.cross_link.v1";
export const RELINK_STEP_PHONE = "relink_awaiting_phone";
export const RELINK_STEP_CODE = "relink_awaiting_code";
export const RELINK_MAX_ATTEMPTS = 5;

const LINK_VERB = String.raw`(liga|ligar|ligues|junta|juntar|associa|associar|une|unir|conecta|conectar)`;
const ALREADY_USE = String.raw`(j[aá]\s+(uso|falo|tenho|estou)|tenho\s+(conta|o\s+afonso))`;

export function wantsToLinkChannel(text: string | null | undefined, target: "whatsapp" | "telegram"): boolean {
  const t = String(text ?? "").toLowerCase();
  if (!t.trim() || t.length > 160) return false;
  const name = target === "whatsapp" ? String.raw`whats\s*app|wpp|zap` : String.raw`telegram`;
  const re1 = new RegExp(String.raw`\b${LINK_VERB}\b[^.?!]{0,40}\b(${name})\b`, "i");
  const re2 = new RegExp(String.raw`\b${ALREADY_USE}\b[^.?!]{0,40}\b(${name})\b`, "i");
  const re3 = /\b(juntar|unir|ligar)\s+(as\s+)?(minhas\s+)?(duas\s+)?contas\b/i;
  return re1.test(t) || re2.test(t) || re3.test(t);
}

export function isCancel(text: string | null | undefined): boolean {
  return /^\s*(cancelar|cancela|esquece|deixa|n[ãa]o)\s*[.!]?\s*$/i.test(String(text ?? ""));
}

export const LINK_TEXT = {
  askPhone:
    "Para ligar este Telegram ao teu WhatsApp, diz-me o número de WhatsApp que usas comigo, em formato internacional (por exemplo +351912345678). Escreve cancelar para desistir.",
  phoneInvalid: "Esse número não me parece válido. Escreve-o em formato internacional, por exemplo +351912345678.",
  // Igual exista ou não conta com esse número — nunca revela contas alheias.
  uniformCodeSent:
    "Se esse número estiver ligado ao Afonso, acabou de receber um código no WhatsApp. Escreve-o aqui, ou cancelar para desistir.",
  codeWrong: (left: number) =>
    left > 0
      ? `Esse código não bate certo. Tens mais ${left} ${left === 1 ? "tentativa" : "tentativas"}.`
      : "Esse código não bate certo e esgotaste as tentativas. Não mudei nada; podes pedir outra vez quando quiseres.",
  whatsappCode: (code: string) =>
    `Pediste para ligar um Telegram à tua conta do Afonso. Código: ${code}\n\nEscreve-o no Telegram. Se não foste tu, ignora esta mensagem — nada muda.`,
  relinked:
    "Pronto — este Telegram passou a usar a mesma conta do teu WhatsApp. A conta que tinha nascido aqui estava vazia, por isso não se perde nada.",
  needsTeam:
    "Confirmei que esse WhatsApp é teu. Como a conta deste Telegram já tem registos próprios, não junto as duas sozinho — pedi à equipa para tratar disso contigo. Até lá, cada canal continua com os seus registos.",
  cancelled: "Está bem, não mudei nada.",
  alreadySame: "O teu Telegram e o teu WhatsApp já estão na mesma conta.",
  telegramAlreadyLinked: "Já tens um Telegram ligado a esta conta.",
  telegramLink: (url: string) =>
    `Abre este link no Telegram para o ligar a esta conta: ${url}\nVale 15 minutos e só funciona uma vez. Se o Telegram já tiver uma conta com registos, não junto nada sozinho.`,
  tokenInvalid: "Esse link de ligação já não é válido. Pede-me outro no WhatsApp.",
};

/** Tabelas com registos do consultor: qualquer linha = conta não vazia. */
export const BUSINESS_TABLES = [
  "people", "properties", "opportunities", "follow_ups", "interactions", "uploaded_files",
  "miscellaneous_items", "prospecting_leads", "reminders", "routines", "financial_movements",
  "deal_deadlines", "property_offers", "property_interests", "email_connections",
  "calendar_connections", "promo_redemptions", "subscription_events",
] as const;
