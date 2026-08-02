// Deteção determinística de "resultado de seguimento" escrito em texto livre.
//
// O check-in da tarde envia botões, mas o consultor responde muitas vezes por
// escrito ("já liguei", "fica sem efeito"). Sem isto, o seguimento continuava
// aberto e voltava no briefing da manhã seguinte.

import type { FollowUpOutcome } from "@/lib/assessor/interactive";

const NO_EFFECT =
  /\b(sem\s+efeito|n[ãa]o\s+se\s+concretizou|escolheu\s+outro|foi\s+com\s+outr|desistiu|j[áa]\s+n[ãa]o\s+faz\s+sentido|n[ãa]o\s+vale\s+a\s+pena|deixa\s+cair|esquece\s+esse|cancela\s+esse|n[ãa]o\s+avan[çc]a)\b/i;

const DONE =
  /(\bj[áa]\s+(liguei|falei|contactei|tratei|resolvi|fiz|enviei|mandei|visitei)\b|\b(liguei|falei|contactei|tratei|enviei)\s+(ontem|hoje|de\s+manh[ãa]|agora|h[áa]\s+pouco)\b|\b(j[áa]\s+est[áa]\s+(feito|tratado|resolvido)|est[áa]\s+feito|fica\s+feito|correu\s+bem|resolvido)\b)/i;

const NEEDS_NEW_ACTION =
  /\b(n[ãa]o\s+atendeu|sem\s+resposta|n[ãa]o\s+consegui\s+falar|volto\s+a\s+ligar|ligo\s+mais\s+tarde|ficou\s+de\s+ligar|remarcar)\b/i;

/**
 * Devolve o resultado que o texto exprime, ou null quando a mensagem não é
 * uma resposta de resultado. "Sem efeito" ganha sempre a "já liguei" quando
 * ambos aparecem ("Já liguei. Fica sem efeito, escolheu outro consultor").
 */
export function detectOutcomeFromText(text: string | null | undefined): FollowUpOutcome | null {
  const t = String(text ?? "").trim();
  if (!t || t.length > 300) return null;
  if (NO_EFFECT.test(t)) return "nao_realizado";
  if (DONE.test(t)) return "concluido";
  if (NEEDS_NEW_ACTION.test(t)) return "precisa_nova_acao";
  return null;
}
