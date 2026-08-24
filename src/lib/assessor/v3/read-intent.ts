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
  | "search_active_reminders"
  | "search_files";

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

// ---------------------------------------------------------------------------
// Excepção ao WRITE_RE: "Manda o contacto do Paulo Lopes".
//
// Caso real (24/08): "manda" e "envia" bloqueavam indiscriminadamente e um
// pedido de INFORMAÇÃO ("manda-me o número da Marta") era tratado como
// escrita. Pedir o contacto DE alguém é leitura; mandar uma mensagem A
// alguém continua a ser acção real e fica bloqueado.

const GIVE_ME_RE =
  /\b(manda|mandas|envia|envias|passa|passas|da|das|diz|dizes|mostra|mostras|partilha|qual\s+(?:e|o|a)?)\b/;

// Objecto pedido, sempre com artigo definido ("o contacto", "a morada").
const CONTACT_OBJ_RE =
  /\b(?:o|a|os|as)\s+(contactos?|numeros?|telefones?|telemoveis?|telemovel|moradas?|emails?|e-mails?)\b/;

// Sinais de envio real para terceiros — nunca leitura.
const SEND_OUT_RE =
  /\b(mensagem|mensagens|sms|whatsapp|recado|convite|proposta|email\s+(?:ao|a|para)|link|ficheiro\s+(?:ao|a|para))\b/;

const CONTACT_NAME_RE =
  /\b(?:contactos?|n[úu]meros?|telefones?|telem[óo]ve(?:l|is)|moradas?|e-?mails?)\s+(?:d[oaeu]s?\s+|de\s+|para\s+(?:o|a)\s+)?(.+)$/i;

const NAME_PREFIX_RE = /^(?:sr\.?a?\.?|senhor[a]?|dona?|do|da|o|a)\s+/i;

/** "Manda o contacto do Paulo Lopes" → "Paulo Lopes"; senão null. */
export function detectContactReadQuery(raw: string): string | null {
  const t = norm(raw ?? "");
  if (!t || t.length > 160) return null;
  if (!GIVE_ME_RE.test(t)) return null;
  if (!CONTACT_OBJ_RE.test(t)) return null;
  if (SEND_OUT_RE.test(t)) return null;

  const m = String(raw ?? "").match(CONTACT_NAME_RE);
  let name = (m?.[1] ?? "").replace(/[?!.,;:]+\s*$/g, "").replace(/\s+/g, " ").trim();
  name = name.replace(NAME_PREFIX_RE, "").trim();
  if (!name || name.length < 2 || name.length > 60) return null;
  if (!/^\p{L}/u.test(name)) return null;
  return name;
}

// Período temporal para perguntas de leitura sem assunto reconhecido
// ("Que temos hoje?"): sem isto ficava sem ferramenta e o motor respondia de cor.
const PERIOD_RE: Array<[RegExp, "today" | "tomorrow" | "week"]> = [
  [/\bhoje\b/, "today"],
  [/\bamanha\b/, "tomorrow"],
  [/\b(esta semana|na semana|semana)\b/, "week"],
];

const TOPICS: Array<{ re: RegExp; tool: ReadTool | null; args?: Record<string, unknown>; topic?: "documents" }> = [
  { re: /\b(placas?|prospe(?:c|ç)ao|prospe(?:c|ç)cao)\b/, tool: "search_prospecting_leads", args: {} },
  { re: /\b(documentos?|ficheiros?|drive|cadernetas?|certificados?)\b/, tool: "search_files", args: { query: "" }, topic: "documents" },
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

  // Pedido de contacto ao próprio consultor: leitura, apesar do "manda".
  const contactName = detectContactReadQuery(raw);
  if (contactName) {
    return { pure: true, tool: "search_people", arguments: { query: contactName }, topic: null };
  }

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

  // "Que temos hoje?" — sem assunto, mas com período: é a agenda.
  for (const [re, period] of PERIOD_RE) {
    if (re.test(text)) {
      return { pure: true, tool: "search_agenda", arguments: { period }, topic: null };
    }
  }

  return { pure: true, tool: null, arguments: {}, topic: null };
}


export const READ_FAILED_REPLY =
  "Não consegui consultar isso agora. Queres que tente outra vez?";

// Frases elípticas ("E documentos?", "E para a próxima semana?") passaram a
// resolver-se pelo tópico da última leitura guardado na memória de conversa.
// Ver `elliptic-read.ts` — já não se procuram palavras no texto anterior.
