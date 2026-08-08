// Guião de abordagem a uma placa de "vende o próprio" (FSBO).
//
// Regras do produto:
//  • só é oferecido dentro do fluxo placa → lead, e só para owner_sale;
//  • nunca é enviado a ninguém — é sempre um rascunho para o consultor rever
//    e reescrever à maneira dele;
//  • não se apresenta como técnica "comprovada" nem se citam taxas de
//    conversão: é boa prática de abordagem, não promessa de resultado.
//
// Módulo puro (sem I/O), para poder ser testado e para não gastar IA numa
// coisa que é sempre a mesma estrutura.

import { withSuggestion } from "@/lib/assessor/culture/suggested-message";

export type ScriptKind = "chamada" | "mensagem";

export interface ScriptLeadInfo {
  /** owner_sale | other_agency | own_agency | unknown */
  listingType?: string | null;
  location?: string | null;
  propertyType?: string | null;
  typology?: string | null;
  consultantName?: string | null;
}

/** A oferta do guião só existe para o caso que estamos a testar: FSBO. */
export function isOwnerSaleLead(listingType: string | null | undefined): boolean {
  return String(listingType ?? "").trim() === "owner_sale";
}

export const SCRIPT_OFFER_QUESTION =
  "Queres que prepare um guião para a abordagem? Diz-me \"chamada\" ou \"mensagem\".";

/** Lê a escolha do consultor. Um "sim" solto não chega — seria ambíguo com o lembrete. */
export function readScriptChoice(text: string | null | undefined): ScriptKind | "none" | "refuse" {
  const t = String(text ?? "").toLowerCase().trim();
  if (!t || t.length > 120) return "none";
  if (/\b(?:n[ãa]o|sem)\s+(?:quero\s+)?(?:gui[ãa]o|script)\b/.test(t)) return "refuse";
  const wantsScript = /\bgui[ãa]o\b|\bscript\b/.test(t);
  if (/\b(?:mensagem|sms|texto|escrit[ao])\b/.test(t)) return "mensagem";
  if (/\b(?:chamada|liga[rç]|telefon\w*|voz)\b/.test(t)) return "chamada";
  if (wantsScript) return "chamada";
  return "none";
}

function imovel(lead: ScriptLeadInfo): string {
  const bits = [lead.typology, lead.propertyType].filter(Boolean).join(" ");
  return (bits || "imóvel").toString();
}

function ondeFica(lead: ScriptLeadInfo): string {
  const l = String(lead.location ?? "").trim();
  return l ? ` em ${l}` : "";
}

function assinatura(lead: ScriptLeadInfo): string {
  const n = String(lead.consultantName ?? "").trim();
  return n ? n : "[o teu nome]";
}

/**
 * Rascunho curto. Em FSBO a conversa costuma ficar tensa quando se fala de
 * comissão logo no início, por isso o guião abre pelo imóvel e deixa o tema
 * para o fim, com uma resposta pronta e sem defensiva.
 */
export function buildProspectingScript(kind: ScriptKind, lead: ScriptLeadInfo): string {
  const bem = `${imovel(lead)}${ondeFica(lead)}`;
  if (kind === "mensagem") {
    return [
      `Boa tarde, vi o anúncio do seu ${bem}. Sou ${assinatura(lead)}, trabalho aqui na zona.`,
      "Não é para lhe pedir exclusividade nem nada disso — tenho pessoas à procura precisamente nesta zona e queria perceber se faz sentido mostrar-lhes.",
      "Se preferir tratar por si, sem problema: posso só dizer-lhe o que estou a ver de valores em negócios fechados aqui perto.",
      "Quando lhe der jeito falamos dois minutos?",
    ].join("\n\n");
  }
  return [
    `Abertura: "Boa tarde, é o/a proprietário/a do ${bem}? Sou ${assinatura(lead)}, trabalho aqui na zona. Vi a sua placa."`,
    "Motivo (sem pedir nada): \"Não estou a ligar para lhe pedir o imóvel. Tenho compradores a procurar nesta zona e queria perceber se algum encaixa no seu.\"",
    "Escuta: pergunta porque decidiu vender por si e há quanto tempo está no mercado — deixa-o falar sem interromper.",
    "Se falar em comissão: \"Compreendo, e não tem de decidir isso hoje. Só lhe pago o tempo se lhe trouxer um comprador; se vender sozinho, ficou a ganhar.\"",
    "Fecho: propõe uma visita curta ao imóvel para poder falar dele com quem procura — dia e hora concretos.",
  ].join("\n\n");
}

/** Cabeçalho honesto: é um rascunho, não é para enviar como está. */
export function formatScriptReply(kind: ScriptKind, body: string): string {
  const intro = kind === "mensagem"
    ? "Rascunho de mensagem — lê e muda o que quiseres antes de enviares. Não envio nada por ti."
    : "Rascunho para a chamada — usa as ideias, as palavras são tuas.";
  // O guião sai numa mensagem só dele, pronto a copiar de uma vez.
  return withSuggestion(intro, body);
}
