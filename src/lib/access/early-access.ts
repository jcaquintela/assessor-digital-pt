// Early Access por convite — partes puras (sem base de dados).
// Códigos, deteção de pedidos na conversa e textos PT-PT.

export const EARLY_ACCESS_GATE_FLAG = "access.early_access_gate.v1";
export const REFERRAL_INVITES_FLAG = "access.referral_invites.v1";
export const WAITLIST_FLAG = "access.waitlist.v1";

/** Convites por beta tester ativo (vivos + usados). */
export const REFERRAL_QUOTA = 3;
/** Validade de cada convite, em dias. */
export const INVITE_TTL_DAYS = 7;
/** Tentativas falhadas de código por conta por hora. */
export const MAX_FAILED_ATTEMPTS_PER_HOUR = 5;
/** Janela para responder "sim" ao pedido de consentimento da lista de espera. */
export const WAITLIST_CONSENT_WINDOW_MS = 60 * 60 * 1000;

export type AccessState = "registered_waiting" | "invited" | "activated" | "trialing" | "subscribed";

/** Estados sem acesso às funções comerciais. */
export function isBlockedState(state: string | null | undefined): boolean {
  return state === "registered_waiting" || state === "invited";
}

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // 32 símbolos, sem 0/O/1/I

/** AF-XXXXX-XXXXX-XXXXX-XXXXX (100 bits aleatórios, gerador criptográfico). */
export function generateInviteCode(rand: (n: number) => Uint8Array = cryptoBytes): string {
  const bytes = rand(20);
  let s = "";
  for (let i = 0; i < 20; i++) s += ALPHABET[bytes[i]! & 31];
  return `AF-${s.slice(0, 5)}-${s.slice(5, 10)}-${s.slice(10, 15)}-${s.slice(15, 20)}`;
}

function cryptoBytes(n: number): Uint8Array {
  const b = new Uint8Array(n);
  crypto.getRandomValues(b);
  return b;
}

const CODE_RE = /\bAF[\s-]+([A-Z0-9]{5}[\s-]*[A-Z0-9]{5}[\s-]*[A-Z0-9]{5}[\s-]*[A-Z0-9]{5})(?![A-Z0-9])/i;

/** Extrai um código de convite de texto livre, em forma canónica. */
export function extractInviteCode(text: string | null | undefined): string | null {
  const m = CODE_RE.exec(String(text ?? ""));
  if (!m) return null;
  const raw = m[1]!.replace(/[\s-]/g, "").toUpperCase();
  if (raw.length !== 20) return null;
  for (const c of raw) if (!ALPHABET.includes(c)) return null;
  return `AF-${raw.slice(0, 5)}-${raw.slice(5, 10)}-${raw.slice(10, 15)}-${raw.slice(15, 20)}`;
}

/** Algo parecido com um código, mas inválido (conta como tentativa falhada). */
export function looksLikeInviteAttempt(text: string | null | undefined): boolean {
  return /\bAF[\s-]+[A-Z0-9]{4,}/i.test(String(text ?? ""));
}

export async function hashInviteCode(code: string): Promise<string> {
  const data = new TextEncoder().encode(`afonso-invite:${code}`);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

const norm = (t: string) =>
  String(t ?? "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();

export function wantsWaitlist(text: string): boolean {
  return /\b(lista de espera|waiting ?list|entrar na lista|por-me na lista|poe-me na lista|quero (esperar|ficar na lista|entrar na lista))\b/.test(norm(text));
}
export function wantsLeaveWaitlist(text: string): boolean {
  const t = norm(text);
  return /\b(sair da lista|tira-me da lista|retira-me da lista|remove-me da lista|apaga os meus dados)\b/.test(t);
}
export function isYes(text: string): boolean {
  return /^(sim|s|aceito|ok|claro|pode ser|sim,? aceito)\b/.test(norm(text));
}
export function isNo(text: string): boolean {
  return /^(nao|n|nao aceito)\b/.test(norm(text));
}

export type ReferralCommand = { kind: "issue" } | { kind: "list" } | { kind: "revoke"; code: string | null };

export function parseReferralCommand(text: string): ReferralCommand | null {
  const t = norm(text);
  if (/\b(anula|revoga|cancela|desativa)\b.*\bconvite\b/.test(t)) {
    return { kind: "revoke", code: extractInviteCode(text) };
  }
  if (/\b(os )?meus convites\b|\bquantos convites\b/.test(t)) return { kind: "list" };
  if (/\b(da-me|dá-me|gera|gerar|cria|criar|quero|preciso de|manda-me|arranja-me)\b.{0,15}\bconvite\b/.test(t)) {
    return { kind: "issue" };
  }
  return null;
}

// --- Textos (PT-PT, "tu") ---------------------------------------------------

export function earlyAccessReply(opts: { waitlist: boolean }): string {
  return opts.waitlist
    ? "Olá! Sou o Afonso. Por agora estou em acesso antecipado, só por convite. " +
        "Se tens um código de convite, envia-mo aqui. Se não tens, posso pôr-te na lista de espera — " +
        "ou pede um convite a um colega que já fale comigo."
    : "Olá! Sou o Afonso. Por agora estou em acesso antecipado, só por convite. " +
        "Se tens um código de convite, envia-mo aqui. Se não tens, pede um a um colega que já fale comigo.";
}

export const INVITE_ACCEPTED_REPLY =
  "Convite aceite, bem-vindo! Os teus 14 dias de experiência, sem cartão, começam na tua próxima mensagem. " +
  "Para arrancar, diz-me as 3 coisas mais importantes no teu negócio esta semana.";

export const INVITE_INVALID_REPLY =
  "Esse código não está válido. Confirma com quem to enviou ou, se preferires, entra na lista de espera.";
export const INVITE_INVALID_REPLY_NO_WAITLIST =
  "Esse código não está válido. Confirma com quem to enviou.";
export const INVITE_RATE_LIMIT_REPLY =
  "Houve demasiadas tentativas de código. Tenta outra vez daqui a uma hora.";

export const WAITLIST_CONSENT_QUESTION =
  "Posso avisar-te quando houver lugar. Aceitas que te contacte por aqui só para isso? (sim/não)";
export const WAITLIST_JOINED_REPLY =
  "Ficaste na lista de espera. Aviso-te por aqui quando houver lugar. Para saíres, escreve \"sair da lista\".";
export const WAITLIST_DECLINED_REPLY =
  "Sem problema, não guardo nada. Se arranjares um convite, envia-mo aqui.";
export const WAITLIST_LEFT_REPLY =
  "Saíste da lista de espera e não volto a contactar-te por isso.";

export function referralIssuedReply(code: string, remaining: number): string {
  const rest = remaining === 0 ? "Era o teu último convite disponível." : `Ficas com ${remaining} por usar.`;
  return `Aqui tens um convite pessoal, válido ${INVITE_TTL_DAYS} dias e só para uma pessoa:\n\n${code}\n\n` +
    `A pessoa só tem de mo enviar na primeira conversa. ${rest}`;
}
export const REFERRAL_NOT_ELIGIBLE_REPLY = "Por agora, só os beta testers podem convidar colegas.";
export const REFERRAL_QUOTA_REPLY =
  `Já tens os teus ${REFERRAL_QUOTA} convites em uso. Quando um expirar sem ser usado, ou o anulares, voltas a poder gerar.`;
export const REFERRAL_REVOKE_NEED_CODE = "Diz-me o código do convite que queres anular.";
export const REFERRAL_REVOKED_REPLY = "Convite anulado. Já não pode ser usado.";
export const REFERRAL_REVOKE_NOT_FOUND = "Não encontrei nenhum convite teu por usar com esse código.";
