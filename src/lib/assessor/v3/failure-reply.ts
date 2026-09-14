// Falhas de escrita explicadas em linguagem normal — módulo puro.
//
// Caso real (13/09): "Proposta à Joana passou para segunda-feira" falhou por
// faltar a hora. O consultor só ouviu "Tentei mas não consegui guardar isso
// agora. Podes tentar outra vez?" — repetiu o pedido, falhou na mesma.
//
// Regra: quando o que falta é informação, o Afonso PERGUNTA o que falta.
// Quando a falha é de outra natureza, diz o que aconteceu em português —
// nunca "tenta outra vez" sem contexto.

export interface FailedTool {
  name: string;
  ok: boolean;
  error?: string | null;
}

/** Perguntas por campo em falta. A chave é o nome do campo no pedido. */
const FIELD_QUESTION: Record<string, string> = {
  new_time: "A que horas?",
  start_time: "A que horas?",
  due_time: "A que horas?",
  time_of_day: "A que horas?",
  new_date: "Para que dia?",
  date: "Para que dia?",
  due_date: "Para que dia?",
  title: "Como queres que lhe chame?",
  name: "Qual é o nome?",
  phone: "Qual é o número?",
  email: "Qual é o email?",
  amount: "De que valor estamos a falar?",
  property_id: "De que imóvel estamos a falar?",
  person_id: "De que pessoa estamos a falar?",
  category_name: "Em que categoria queres pôr isso?",
};

/** Explicações para falhas que não são falta de informação. */
const ERROR_EXPLANATION: Array<{ match: RegExp; text: string }> = [
  { match: /reminder_not_found|not[_ ]found/i, text: "Não encontrei esse registo na tua lista. Dizes-me o título como está guardado?" },
  { match: /ambiguous/i, text: "Encontrei mais do que um registo parecido. Qual deles é?" },
  { match: /permission|denied|rls/i, text: "Não tenho acesso a esse registo, por isso não mexi em nada." },
  { match: /past/i, text: "Essa data e hora já passaram. Para quando queres mesmo?" },
  { match: /timeout|network|fetch|unavailable|503|502/i, text: "O serviço não respondeu a tempo e não cheguei a guardar. Digo-te já se conseguir." },
];

function missingField(error: string): string | null {
  // Formato do validador: "invalid_args:<campo>: <mensagem>" ou "<campo>: <mensagem>".
  const cleaned = error.replace(/^invalid_args:\s*/i, "");
  const m = cleaned.match(/^([a-z_][a-z0-9_.]*)\s*:/i);
  if (!m) return null;
  const field = String(m[1]).split(".").pop() ?? "";
  return FIELD_QUESTION[field] ? field : null;
}

/**
 * Texto honesto para um conjunto de resultados de ferramentas.
 * Devolve null quando não há falhas (ou nada útil a dizer).
 */
export function explainToolFailure(results: FailedTool[]): string | null {
  const failed = results.filter((r) => !r.ok);
  if (!failed.length) return null;

  for (const f of failed) {
    const field = missingField(String(f.error ?? ""));
    if (field) {
      // Falta informação: perguntar é sempre melhor do que falhar.
      return `Falta-me um detalhe para guardar isso: ${FIELD_QUESTION[field]}`;
    }
  }

  for (const f of failed) {
    const err = String(f.error ?? "");
    const hit = ERROR_EXPLANATION.find((e) => e.match.test(err));
    if (hit) return hit.text;
  }

  return "Não consegui guardar isso — o registo não foi aceite como está. Dizes-me outra vez o que queres marcar e para quando?";
}
