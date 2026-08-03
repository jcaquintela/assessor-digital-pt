// Recuperador do Drive — deteção em linguagem natural de pedidos de
// documentos ("manda-me a caderneta predial do T2 de Benfica") e de
// listagens ("que documentos tenho da Sra. Ana?").
//
// Módulo puro: sem base de dados, sem canal. Testável.

export type DocTypeKey =
  | "caderneta"
  | "certidao"
  | "cpu"
  | "cpcv"
  | "escritura"
  | "licenca"
  | "energia"
  | "planta"
  | "contrato"
  | "procuracao"
  | "ficha_tecnica"
  | "recibo"
  | "fatura";

export const DOC_TYPES: { key: DocTypeKey; label: string; words: string[] }[] = [
  { key: "caderneta", label: "caderneta predial", words: ["caderneta predial", "caderneta", "cpu urbana"] },
  { key: "certidao", label: "certidão permanente", words: ["certidao permanente", "certidão permanente", "certidao", "certidão", "crp", "registo predial"] },
  { key: "cpu", label: "CPU", words: ["cpu"] },
  { key: "cpcv", label: "CPCV", words: ["cpcv", "contrato promessa", "contrato de promessa"] },
  { key: "escritura", label: "escritura", words: ["escritura"] },
  { key: "licenca", label: "licença de utilização", words: ["licenca de utilizacao", "licença de utilização", "licenca", "licença"] },
  { key: "energia", label: "certificado energético", words: ["certificado energetico", "certificado energético", "certificado de energia", "ce energetico"] },
  { key: "planta", label: "planta", words: ["planta", "plantas"] },
  { key: "contrato", label: "contrato", words: ["contrato de mediacao", "contrato de mediação", "contrato"] },
  { key: "procuracao", label: "procuração", words: ["procuracao", "procuração"] },
  { key: "ficha_tecnica", label: "ficha técnica", words: ["ficha tecnica", "ficha técnica"] },
  { key: "recibo", label: "recibo", words: ["recibo", "recibos"] },
  { key: "fatura", label: "fatura", words: ["fatura", "faturas", "factura"] },
];

const GENERIC_DOC =
  /\b(documento|documentos|ficheiro|ficheiros|anexo|anexos|pdf|papelada|papéis|papeis)\b/i;

const SEND_VERB =
  /\b(manda|mandas|mandar|envia|envias|enviar|reenvia|passa|passas|passar|d[áa]-me|da-me|d[áa]s-me|arranja|arranjas|preciso|preciso\s+d[eoa]|quero|mostra|mostras|mostrar|encontra|procura|localiza)\b/i;

const LIST_RE =
  /\b(que|quais|qu[ea]is)\b[^?]*\b(documentos|ficheiros|papelada|anexos)\b/i;

export function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function detectDocType(text: string): { key: DocTypeKey; label: string } | null {
  const n = normalize(text);
  let best: { key: DocTypeKey; label: string; len: number } | null = null;
  for (const t of DOC_TYPES) {
    for (const w of t.words) {
      const nw = normalize(w);
      if (n.includes(nw) && (!best || nw.length > best.len)) {
        best = { key: t.key, label: t.label, len: nw.length };
      }
    }
  }
  return best ? { key: best.key, label: best.label } : null;
}

const SUBJECT_STOP =
  /^(o|a|os|as|do|da|dos|das|de|d|para|no|na|em|meu|minha|meus|minhas|sr|sra|senhor|senhora|dona|dr|dra|que|tenho|temos|ha|existe|existem|guardados?|arquivados?|drive|por|favor|ja|agora|se|faz|favor|me|te|nos|um|uma|uns|umas|documento|documentos|ficheiro|ficheiros|anexo|anexos)$/;

/** Extrai o "assunto" (imóvel, morada ou pessoa) a que o documento diz respeito. */
export function extractSubject(text: string, docLabel: string | null): string | null {
  let n = normalize(text);
  // Retira a parte do pedido antes do assunto.
  if (docLabel) n = n.replace(normalize(docLabel), " ");
  n = n
    .replace(/[?!.,;:]/g, " ")
    .replace(SEND_VERB, " ")
    .replace(/\b(documento|documentos|ficheiro|ficheiros|anexo|anexos|papelada)\b/g, " ")
    .replace(/\b(afonso|por favor|se faz favor|obrigado|obrigada)\b/g, " ");
  const words = n
    .replace(/-\s*(me|mos|nos|lo|la)\b/g, " ")
    .split(/\s+/)
    .map((w) => w.replace(/^-+|-+$/g, ""))
    .filter(Boolean)
    .filter((w) => !SUBJECT_STOP.test(w));
  const subject = words.join(" ").trim();
  return subject.length >= 2 ? subject : null;
}

export type DocRequest =
  | { kind: "send"; docLabel: string | null; docType: DocTypeKey | null; subject: string | null }
  | { kind: "list"; subject: string | null }
  | { kind: "meta"; nif: string | null; artigo: string | null };

const NIF_WORD = /\b(nif|nipc|contribuinte|n[ºo°]?\s*de\s*contribuinte)\b/i;
const ARTIGO_WORD = /\b(artigo\s*matricial|artigo|matriz|matricial|fra[cç][ãa]o)\b/i;

/**
 * Pesquisa de documento por metadado extraído: NIF ("NIF 221498605"),
 * artigo matricial ("artigo 1234") ou fração ("fração B").
 * Isto NÃO é procura de pessoa por nome — um número nunca é um nome.
 */
export function detectDocMetaQuery(text: string): { nif: string | null; artigo: string | null } | null {
  const raw = String(text ?? "").trim();
  if (!raw || raw.length > 400) return null;

  let nif: string | null = null;
  const nifNear = raw.match(/\b(?:nif|nipc|contribuinte)\b[^0-9]{0,12}(\d[\d\s.]{7,14})/i);
  if (nifNear) {
    const digits = nifNear[1].replace(/\D/g, "");
    if (digits.length === 9) nif = digits;
  }
  if (!nif) {
    // 9 dígitos isolados só contam quando o pedido fala de documentos.
    const bare = raw.match(/(?<!\d)(\d{9})(?!\d)/);
    if (bare && (GENERIC_DOC.test(raw) || NIF_WORD.test(raw) || detectDocType(raw))) {
      nif = bare[1];
    }
  }

  let artigo: string | null = null;
  const art = raw.match(
    /\b(?:artigo(?:\s+matricial)?|matriz|matricial|fra[cç][ãa]o)\b[^\w]{0,6}([\p{L}\d][\p{L}\d\-/.]{0,15})/iu,
  );
  if (art && !/^(matricial|do|da|de|no|na|com|este|esta|deste)$/i.test(art[1])) {
    artigo = art[1].replace(/[.,;:]$/, "");
  }

  if (!nif && !artigo) return null;
  // Precisa de contexto documental ou de um NIF explícito para não roubar turnos.
  if (!nif && !(GENERIC_DOC.test(raw) || detectDocType(raw) || ARTIGO_WORD.test(raw))) return null;
  return { nif, artigo };
}

export function detectDocumentRequest(text: string): DocRequest | null {
  const raw = String(text ?? "").trim();
  if (!raw || raw.length > 400) return null;
  const meta = detectDocMetaQuery(raw);
  if (meta) return { kind: "meta", nif: meta.nif, artigo: meta.artigo };
  const doc = detectDocType(raw);
  const hasGeneric = GENERIC_DOC.test(raw);

  if (LIST_RE.test(raw) && !doc) {
    return { kind: "list", subject: extractSubject(raw, null) };
  }
  if (!doc && !hasGeneric) return null;
  if (!SEND_VERB.test(raw) && !LIST_RE.test(raw)) return null;

  if (!doc && LIST_RE.test(raw)) {
    return { kind: "list", subject: extractSubject(raw, null) };
  }
  return {
    kind: "send",
    docLabel: doc?.label ?? null,
    docType: doc?.key ?? null,
    subject: extractSubject(raw, doc?.label ?? null),
  };
}

/** "o 2", "segundo", "o primeiro" → índice 0-based. Devolve null se não for escolha. */
export function parseChoice(text: string, max: number): number | null {
  const n = normalize(text);
  const words: Record<string, number> = {
    primeiro: 1, primeira: 1, segundo: 2, segunda: 2, terceiro: 3, terceira: 3,
    quarto: 4, quarta: 4, quinto: 5, quinta: 5,
  };
  for (const [w, i] of Object.entries(words)) {
    if (new RegExp(`\\b${w}\\b`).test(n) && i <= max) return i - 1;
  }
  const m = n.match(/\b([1-9])\b/);
  if (m) {
    const i = Number(m[1]);
    if (i >= 1 && i <= max) return i - 1;
  }
  return null;
}

export function formatCandidateList(
  items: { fileName: string; label: string | null }[],
  header: string,
): string {
  const lines = items.map((it, i) => {
    const extra = it.label ? ` — ${it.label}` : "";
    return `${i + 1}. ${it.fileName}${extra}`;
  });
  return `${header}\n${lines.join("\n")}\n\nDiz-me o número do que queres que te mande.`;
}

// ---- Escolha por toque -------------------------------------------------
// Quando há vários documentos possíveis, a lista é enviada como opções
// tocáveis (botões / lista do canal). O id codifica o ficheiro escolhido —
// o consultor não tem de escrever nada. Escrever o número continua a valer.

export const DOC_COMMAND_PREFIX = "#documento:";

/** Id curto (cabe no limite de 64 bytes do callback do Telegram). */
export function shortDocId(fileId: string): string {
  return String(fileId).replace(/-/g, "").slice(0, 10);
}

export function encodeDocCommand(fileId: string): string {
  return `${DOC_COMMAND_PREFIX}${shortDocId(fileId)}`;
}

export function parseDocCommand(text: string | null | undefined): string | null {
  const raw = String(text ?? "").trim();
  if (!raw.startsWith(DOC_COMMAND_PREFIX)) return null;
  const id = raw.slice(DOC_COMMAND_PREFIX.length).trim();
  return id || null;
}

/** Rótulo curto e legível para um documento na lista de escolha. */
export function docOptionLabel(fileName: string, max = 24): string {
  const clean = fileName.replace(/\.[a-z0-9]{2,5}$/i, "").replace(/[_-]+/g, " ").trim();
  return clean.length <= max ? clean : `${clean.slice(0, max - 1)}…`;
}
