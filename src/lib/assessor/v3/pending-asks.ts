// Itens que ficaram à espera de confirmação — módulo puro (sem I/O).
//
// Uma mensagem pode conter vários pedidos. Alguns escrevem logo; outros ficam
// à espera de saber QUEM (contacto) ou QUAL (imóvel). Até 4/9/2026 o motor
// escolhia UMA pergunta e calava as restantes — e a resposta final podia até
// ser substituída por um recibo de escrita, dando a entender que estava tudo
// tratado. Aqui juntamos todos os pendentes numa única mensagem estruturada:
// nada é silenciado e o consultor vê exactamente o que falta.

export interface PendingAskItem {
  kind: "person" | "property";
  /** O que ficou por resolver ("Apresentar proposta à Joana"). */
  label: string | null;
  /** Pergunta em PT-PT já formulada. */
  question: string;
}

const OBJECT_BY_TOOL: Record<string, string> = {
  create_event: "o compromisso",
  create_follow_up: "o seguimento",
  update_property: "o imóvel",
};

/** Título do item a partir do payload que ia ser escrito. */
export function askLabel(toolName: string, data: unknown): string | null {
  const d = (data ?? {}) as Record<string, any>;
  const incoming = (d.incoming ?? {}) as Record<string, any>;
  const raw =
    incoming.title ??
    incoming.summary ??
    incoming.subject ??
    d.title ??
    null;
  const title = typeof raw === "string" && raw.trim() ? raw.trim() : null;
  return title ?? OBJECT_BY_TOOL[toolName] ?? null;
}

function ensureSentence(text: string): string {
  const base = text.trim();
  if (!base) return "";
  return /[.!?…]$/.test(base) ? base : `${base}.`;
}

/**
 * Junta o recibo do que foi mesmo escrito com os itens por resolver.
 * Com um só pendente mantém-se a frase natural de sempre; com dois ou mais
 * enumeram-se todos, para nenhum se perder.
 */
export function composeAsksReply(receipt: string | null, asks: PendingAskItem[]): string {
  const head = receipt ? ensureSentence(receipt) : "";
  if (asks.length === 0) return head;
  if (asks.length === 1) {
    return [head, asks[0]!.question.trim()].filter(Boolean).join(" ");
  }
  const lines = asks.map((a) =>
    a.label ? `• ${a.label} — ${a.question.trim()}` : `• ${a.question.trim()}`,
  );
  const intro = `Ficaram ${asks.length === 2 ? "dois" : String(asks.length)} por resolver:`;
  const tail = "Responde-me a estes por ordem e eu trato do resto.";
  return [head, intro, lines.join("\n"), tail].filter(Boolean).join("\n");
}
