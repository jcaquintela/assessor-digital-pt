// Pedidos de leitura pura ("lista os contactos", "que pessoas tenho?").
//
// Caso real (05/08): "Entretanto lista aqui os contactos todos que tens meus"
// foi tratado como escrita e o consultor recebeu "Tentei mas não consegui
// guardar isso agora". Quem pede para VER nunca pode passar pelo caminho de
// gravação. Módulo puro, sem I/O.

export type ReadTool =
  | "search_people"
  | "search_properties"
  | "search_prospecting_leads"
  | "search_agenda"
  | "search_active_reminders";

export interface ReadRequest {
  pure: boolean;
  tool: ReadTool | null;
  arguments: Record<string, unknown>;
  /** Assunto reconhecido sem ferramenta associada (ex.: documentos). */
  topic: "documents" | null;
}

const NONE: ReadRequest = { pure: false, tool: null, arguments: {}, topic: null };

function norm(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

// Verbos e formas que indicam pedido de consulta.
const READ_RE =
  /\b(lista|listar|listas|mostra|mostrar|mostras|enumera|diz-?me quais|quais(?: sao| s[ao]o)?|quantos|quantas|que .{0,30}\b(tenho|tens|temos)\b|o que .{0,20}\b(tenho|tens)\b|ver (?:a |os |as |o )?(?:lista|contactos|pessoas|imoveis|agenda)|resumo d[ao]s?)\b/;

// Verbos que implicam escrita/alteração. Se aparecerem, não é leitura pura.
const WRITE_RE =
  /\b(marca|marcar|agenda(?:r)?|regista|registar|guarda|guardar|cria|criar|adiciona|adicionar|apaga|apagar|elimina|eliminar|remove|remover|cancela|cancelar|desmarca|desmarcar|altera|alterar|actualiza|atualiza|lembra-?me|envia|enviar|manda|mandar|corrige|corrigir)\b/;

const TOPICS: Array<{ re: RegExp; tool: ReadTool | null; args?: Record<string, unknown>; topic?: "documents" }> = [
  { re: /\b(placas?|prospe(?:c|ç)ao|prospe(?:c|ç)cao)\b/, tool: "search_prospecting_leads", args: {} },
  { re: /\b(documentos?|ficheiros?|drive|cadernetas?|certificados?)\b/, tool: null, topic: "documents" },
  { re: /\b(contactos?|pessoas?|clientes?|proprietarios?|compradores?|leads?)\b/, tool: "search_people", args: { query: "" } },
  { re: /\b(imoveis?|casas?|apartamentos?|moradias?|propriedades?|terrenos?)\b/, tool: "search_properties", args: { query: "" } },
  { re: /\b(agenda|compromissos?|visitas?|reunioes?|marca(?:c|ç)oes?)\b/, tool: "search_agenda", args: { period: "today" } },
  { re: /\b(lembretes?|seguimentos?|tarefas?)\b/, tool: "search_active_reminders", args: {} },
];

/**
 * Devolve `pure: true` quando a mensagem é apenas um pedido de consulta.
 * `tool` é a ferramenta de leitura inferida (pode ser null quando o assunto
 * não tem ferramenta directa, ex.: documentos).
 */
export function detectReadRequest(raw: string): ReadRequest {
  const text = norm(raw ?? "");
  if (!text) return NONE;
  if (WRITE_RE.test(text)) return NONE;
  if (!READ_RE.test(text)) return NONE;

  for (const t of TOPICS) {
    if (t.re.test(text)) {
      return {
        pure: true,
        tool: t.tool,
        arguments: t.args ?? {},
        topic: t.topic ?? null,
      };
    }
  }
  return { pure: true, tool: null, arguments: {}, topic: null };
}

export const READ_FAILED_REPLY =
  "Não consegui consultar isso agora. Queres que tente outra vez?";
