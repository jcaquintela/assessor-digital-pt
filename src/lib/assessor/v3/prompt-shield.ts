// Proteção contra extração das instruções internas do Afonso.
//
// Duas camadas:
//  1. Bloco de regras nos prompts (ver prompts.ts) — cobre variações livres.
//  2. Este detector determinístico — garante resposta estável nos pedidos
//     típicos de extração, mesmo que o modelo hesite.
//
// Nunca confirma nem nega a existência de instruções: desvia com naturalidade
// para o que o Afonso pode fazer. A transparência de decisão ("porque pediste
// confirmação?") NÃO passa por aqui — é explicitamente excluída.

function norm(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

// Aquilo que se tenta extrair — inequivocamente interno.
const TARGET_RE =
  /(system ?prompt|prompt (?:de |do )?(?:sistema|base)|(?:o |teu |teus |tua |tuas )prompt\b|(?:tuas?|suas?) instrucoes|instrucoes (?:internas?|do sistema|de sistema|que te (?:deram|definiram))|configuracao interna|regras? (?:internas?|do sistema|de sistema|que (?:te |lhe )?(?:deram|definiram))|diretrizes internas|directrizes internas|system message|texto (?:de )?sistema|tudo o que te (?:disseram|foi dito)|o que te programaram|nomes das (?:tuas )?ferramentas)/;

// Alvos ambíguos: "regras de X", "instruções", "configuração", "prompt" soltos
// aparecem em trabalho normal ("regras de crédito habitação", "instruções da
// visita"). Só contam como extração quando vêm com um contorno explícito.
const SOFT_TARGET_RE =
  /(\bprompt\b|instrucoes?|instrucao|configuracao|regras? de \w+|diretrizes|directrizes|guidelines|lista de ferramentas)/;

// Verbos/pedidos de exposição.
const ASK_RE =
  /(mostra|revela|imprime|repete|copia|cola|transcreve|lista|enumera|resume|resumir|descreve|diz-me|diz me|conta-me|qual (?:e|era|foi)|quais (?:sao|foram)|dá-me|da-me|envia|partilha|escreve)/;

// Contorno explícito.
const BYPASS_RE =
  /(por palavras tuas|nas tuas palavras|para auditoria|sou o (?:programador|developer|criador|admin)|modo (?:debug|developer)|ignora (?:as )?(?:tuas )?(?:regras|instrucoes)|comecando por|começando por|começa por "|comeca por "|sem censura|na integra|na íntegra|palavra por palavra|verbatim)/;

// Transparência legítima de decisão — nunca bloquear.
const TRANSPARENCY_RE =
  /(porque (?:nao |não )?(?:registaste|criaste|guardaste|pediste|perguntaste|marcaste|escolheste|sugeriste|fizeste|decidiste)|por que motivo|porque e que (?:nao )?(?:registaste|pediste|perguntaste)|o que sabes fazer|o que fazes|em que me podes ajudar|quais sao as tuas competencias)/;

// Pedido de inventário de ferramentas só é extração quando vem com contorno
// ("para auditoria", "sou o programador") — "o que sabes fazer" é legítimo.
const TOOLS_RE = /\bferramentas\b|\btools\b/;

export function detectPromptExtraction(text: string): boolean {
  const t = norm(text);
  if (!t) return false;
  if (TRANSPARENCY_RE.test(t)) return false;
  if (TOOLS_RE.test(t) && BYPASS_RE.test(t)) return true;
  const hasBypass = BYPASS_RE.test(t);
  if (TARGET_RE.test(t)) return ASK_RE.test(t) || hasBypass;
  return hasBypass && SOFT_TARGET_RE.test(t);
}

export const PROMPT_SHIELD_REPLY =
  "Isso não te vai ajudar em nada no dia a dia. Diz-me antes com o que precisas de ajuda agora — agenda, seguimentos, uma pessoa, um imóvel ou um negócio.";
