// Motivos de falha do resumo diário em português simples.
//
// O que fica gravado em `daily_digests.note` é a resposta crua do serviço de
// email ("Resend 403: The … domain is not verified"). Isso não é linguagem de
// painel: aqui traduz-se para uma frase que diz o que aconteceu e o que fazer.

export type DigestFailure = { label: string; hint: string };

const RULES: { match: RegExp; label: string; hint: string }[] = [
  {
    match: /domain is not verified|not verified/i,
    label: "O domínio de envio não está verificado",
    hint: "Verifica o domínio na conta de email ligada ao projeto. Até lá, qualquer envio é recusado.",
  },
  {
    match: /provider de email não ligado|conector .* não ligado/i,
    label: "Serviço de email não está ligado",
    hint: "Falta ligar o serviço de email ao projeto — sem isso não há envios.",
  },
  {
    match: /sem beta testers/i,
    label: "Não havia ninguém para receber",
    hint: "Nenhum beta tester ativo com email real nesse dia.",
  },
  {
    match: /\b429\b|rate limit/i,
    label: "Demasiados envios de uma vez",
    hint: "O serviço de email travou o envio por excesso de pedidos. Tenta novamente daqui a pouco.",
  },
  {
    match: /\b(401|403)\b|unauthorized|forbidden|api key/i,
    label: "Credenciais do email recusadas",
    hint: "A ligação ao serviço de email deixou de ser aceite — é preciso voltar a ligá-la.",
  },
  {
    match: /falha de rede|fetch failed|timeout|ETIMEDOUT/i,
    label: "Não consegui falar com o serviço de email",
    hint: "Falha de rede momentânea. Tentar novamente costuma resolver.",
  },
];

/** Traduz a nota crua guardada num motivo legível. `null` quando não há nota. */
export function digestFailure(note: string | null | undefined): DigestFailure | null {
  const raw = String(note ?? "").trim();
  if (!raw) return null;
  const rule = RULES.find((r) => r.match.test(raw));
  if (rule) return { label: rule.label, hint: rule.hint };
  return { label: "O envio falhou", hint: raw.slice(0, 160) };
}
