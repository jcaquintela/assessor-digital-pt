// Central pipeline para receção e classificação de ficheiros.
// Independente do canal (WhatsApp, futuros). Import interno server-only.

import { withUsageHint } from "@/lib/drive/monthly-quota";

export const MAX_SIZES: Record<string, number> = {
  "image/jpeg": 10 * 1024 * 1024,
  "image/png": 10 * 1024 * 1024,
  "application/pdf": 20 * 1024 * 1024,
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": 20 * 1024 * 1024,
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": 20 * 1024 * 1024,
  "text/csv": 5 * 1024 * 1024,
  "text/plain": 5 * 1024 * 1024,
  "audio/ogg": 25 * 1024 * 1024,
  "audio/mpeg": 25 * 1024 * 1024,
  "audio/mp4": 25 * 1024 * 1024,
  "audio/wav": 25 * 1024 * 1024,
  "audio/webm": 25 * 1024 * 1024,
  "audio/aac": 25 * 1024 * 1024,
};

const BLOCKED_MIME_PREFIXES = [
  "application/x-msdownload",
  "application/x-executable",
  "application/x-sh",
  "application/x-msi",
  "application/x-dosexec",
  "application/javascript",
  "application/x-mach-binary",
  "application/zip",
  "application/x-rar",
  "application/x-7z-compressed",
  "application/x-tar",
  "application/gzip",
];

export type ProcessIncomingFileInput = {
  supabase: any;
  userId: string;
  channel: string;
  externalFileId?: string | null;
  fileName?: string | null;
  mimeType: string;
  size: number;
  bytes: Uint8Array | ArrayBuffer;
  sourceMessageId?: string | null;
  /** Imagens no gateway: a ligação automática corre só depois do OCR. */
  deferAutoLink?: boolean;
};

export type ProcessIncomingFileResult = {
  ok: boolean;
  fileId: string | null;
  classification: string;
  status: string;
  reply: string;
  extractedText: string | null;
  errorCode?: string;
};

function safeName(original?: string | null): string | null {
  if (!original) return null;
  const clean = original.replace(/[^a-zA-Z0-9._\- ]+/g, "_").slice(0, 120).trim();
  // Nomes genéricos dos canais ("file", "ficheiro", "audio.ogg") não contam.
  if (!clean || /^(ficheiro|file|image|photo|audio|voice|document|untitled)([._-]?\d*)?(\.[a-z0-9]+)?$/i.test(clean)) {
    return null;
  }
  return clean;
}

const MONTHS_PT = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

/**
 * Nome identificável quando o canal não envia nome nenhum: tipo + data/hora.
 * Nunca devolve o genérico "ficheiro" — é sempre reconhecível na lista.
 */
function fallbackName(classification: string, when = new Date()): string {
  const base: Record<string, string> = {
    audio: "Mensagem de voz",
    imagem: "Foto",
    documento_pdf: "Documento PDF",
    documento_docx: "Documento Word",
    planilha: "Folha de cálculo",
    texto: "Nota de texto",
  };
  const dia = String(when.getDate()).padStart(2, "0");
  const mes = MONTHS_PT[when.getMonth()];
  const hora = `${String(when.getHours()).padStart(2, "0")}h${String(when.getMinutes()).padStart(2, "0")}`;
  return `${base[classification] ?? "Ficheiro recebido"} ${dia} ${mes} ${hora}`;
}

/** Um nome só gerado por nós (não veio do canal) pode ser melhorado depois. */
export function isAutoName(name: string | null | undefined): boolean {
  if (!name) return true;
  const n = name.trim();
  if (/^ficheiro$/i.test(n)) return true;
  return /^(Mensagem de voz|Foto|Documento PDF|Documento Word|Folha de cálculo|Nota de texto|Ficheiro recebido) \d{2} [a-z]{3} \d{2}h\d{2}$/.test(n);
}

/**
 * Descrição curta a partir do conteúdo (transcrição/texto lido), para dar um
 * nome humano ao ficheiro quando o canal não enviou nome — ex.: "Áudio sobre
 * despesa da Rua das Flores".
 */
export function describeFromContent(classification: string, text: string | null | undefined): string | null {
  const raw = (text ?? "").replace(/\s+/g, " ").trim();
  if (raw.length < 8) return null;
  const words = raw.split(" ").slice(0, 8).join(" ").replace(/[.,;:!?]+$/, "");
  if (words.length < 6) return null;
  const prefix =
    classification === "audio" ? "Áudio sobre " : classification === "imagem" ? "Foto de " : "";
  const body = prefix ? words.charAt(0).toLowerCase() + words.slice(1) : words.charAt(0).toUpperCase() + words.slice(1);
  return `${prefix}${body}`.slice(0, 90);
}

/**
 * Renomeia o ficheiro depois de haver conteúdo lido, mas só quando o nome
 * actual foi gerado por nós — um nome real enviado pelo canal nunca é tocado.
 * O nome novo é um resumo de 3-5 palavras do assunto (IA), não a transcrição.
 */
export async function refineFileName(
  supabase: any,
  fileId: string,
  classification: string,
  text: string | null | undefined,
): Promise<void> {
  try {
    const { data } = await supabase
      .from("uploaded_files")
      .select("original_file_name, user_id, channel")
      .eq("id", fileId)
      .maybeSingle();
    const row = data as { original_file_name: string | null; user_id?: string; channel?: string } | null;
    if (!isAutoName(row?.original_file_name)) return;

    // 1º: resumo curto por IA. 2º (se falhar): corte simples do conteúdo.
    let description: string | null = null;
    try {
      const { summarizeForName } = await import("@/lib/ai/short-name.server");
      const { composeShortName } = await import("@/lib/drive/short-name");
      const res = await summarizeForName(String(text ?? ""), {
        supabase,
        userId: row?.user_id ?? null,
        channel: row?.channel ?? null,
      } as any);
      if (res.ok) description = composeShortName(classification, res.summary);
    } catch (err) {
      console.error("[files] shortName:", err instanceof Error ? err.message : err);
    }
    if (!description) description = describeFromContent(classification, text);
    if (!description) return;
    await supabase
      .from("uploaded_files")
      .update({ original_file_name: description } as never)
      .eq("id", fileId);
  } catch (err) {
    console.error("[files] refineFileName:", err instanceof Error ? err.message : err);
  }
}

function extensionFor(mime: string): string {
  const map: Record<string, string> = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "application/pdf": "pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
    "text/csv": "csv",
    "text/plain": "txt",
    "audio/ogg": "ogg",
    "audio/mpeg": "mp3",
    "audio/mp4": "m4a",
    "audio/wav": "wav",
    "audio/webm": "webm",
    "audio/aac": "aac",
  };
  return map[mime] ?? "bin";
}

function classifyByMime(mime: string): string {
  if (mime.startsWith("audio/")) return "audio";
  if (mime.startsWith("image/")) return "imagem";
  if (mime === "application/pdf") return "documento_pdf";
  if (mime.includes("wordprocessingml")) return "documento_docx";
  if (mime.includes("spreadsheetml") || mime === "text/csv") return "planilha";
  if (mime === "text/plain") return "texto";
  return "diversos";
}

function friendlyLabel(classification: string): string {
  switch (classification) {
    case "audio":
      return "mensagem de voz";
    case "imagem":
      return "imagem";
    case "documento_pdf":
      return "documento PDF";
    case "documento_docx":
      return "documento Word";
    case "planilha":
      return "folha de cálculo";
    case "texto":
      return "ficheiro de texto";
    default:
      return "ficheiro";
  }
}

function toUint8(bytes: Uint8Array | ArrayBuffer): Uint8Array {
  return bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
}

/**
 * Extração de dados do documento (OCR + IA): datas, NIF, artigo matricial,
 * fração e morada. Renomeia ficheiros com nomes ilegíveis ("SCAN_2026…"),
 * mantendo sempre um nome legível já escolhido pelo consultor ou por nós.
 * Nunca falha o processamento: se não conseguir ler, segue em frente.
 */
export async function applyDocumentExtraction(args: {
  supabase: any;
  fileId: string;
  bytes: Uint8Array;
  mimeType: string;
  currentName: string | null;
  userId?: string | null;
  channel?: string | null;
}): Promise<{ text: string | null; expiresOn: string | null; reading: import("@/lib/ai/doc-extract.server").DocReading } | null> {
  try {
    const { readDocument, supportsDocExtraction, hasAnyDocData } = await import(
      "@/lib/ai/doc-extract.server"
    );
    if (!supportsDocExtraction(args.mimeType)) return null;
    const res = await readDocument(args.bytes, args.mimeType, args.currentName, {
      supabase: args.supabase,
      userId: args.userId ?? null,
      channel: args.channel ?? null,
    });
    if (!res.ok) {
      console.error("[files] doc-extract:", res.error);
      return null;
    }
    const r = res.reading;
    if (!hasAnyDocData(r) && !r.visible_text) return null;

    const patch: Record<string, unknown> = {
      doc_issued_on: r.issued_on,
      doc_expires_on: r.expires_on,
      doc_nif: r.nif,
      doc_artigo_matricial: r.artigo_matricial,
      doc_fracao: r.fracao,
      doc_morada: r.morada,
    };
    if (r.doc_type) patch.document_type = r.doc_type;
    if (r.visible_text) patch.extracted_text = r.visible_text;

    const { isIllegibleName, suggestDocumentName } = await import("@/lib/drive/doc-meta");
    if (isAutoName(args.currentName) || isIllegibleName(args.currentName)) {
      const nome = suggestDocumentName(r);
      if (nome) patch.original_file_name = nome;
    }

    await args.supabase.from("uploaded_files").update(patch as never).eq("id", args.fileId);
    return { text: r.visible_text, expiresOn: r.expires_on, reading: r };
  } catch (err) {
    console.error("[files] applyDocumentExtraction:", err instanceof Error ? err.message : err);
    return null;
  }
}

export async function processIncomingFile(
  input: ProcessIncomingFileInput,
): Promise<ProcessIncomingFileResult> {
  const { supabase, userId, channel, mimeType, size, sourceMessageId } = input;
  // Nome real enviado pelo canal; se não houver, um nome identificável nosso.
  const originalName = safeName(input.fileName) ?? fallbackName(classifyByMime(mimeType));

  // 1. Validar MIME/extensão bloqueada
  if (BLOCKED_MIME_PREFIXES.some((p) => mimeType.startsWith(p))) {
    return failLog(supabase, {
      userId,
      channel,
      sourceMessageId,
      originalName,
      mimeType,
      size,
      errorCode: "mime_blocked",
      reply: "Este tipo de ficheiro não é permitido por questões de segurança.",
    });
  }

  // 2. Validar tamanho por tipo
  const cap = MAX_SIZES[mimeType];
  if (!cap) {
    return failLog(supabase, {
      userId,
      channel,
      sourceMessageId,
      originalName,
      mimeType,
      size,
      errorCode: "mime_unsupported",
      reply: `Recebi o ficheiro mas ainda não sei processar este formato (${mimeType}).`,
    });
  }
  if (size <= 0) {
    return failLog(supabase, {
      userId,
      channel,
      sourceMessageId,
      originalName,
      mimeType,
      size,
      errorCode: "empty_file",
      reply: "O ficheiro chegou vazio. Podes tentar enviar novamente?",
    });
  }
  if (size > cap) {
    const mb = Math.round(cap / (1024 * 1024));
    return failLog(supabase, {
      userId,
      channel,
      sourceMessageId,
      originalName,
      mimeType,
      size,
      errorCode: "too_large",
      reply: `Este ficheiro é maior do que o limite permitido (${mb} MB).`,
    });
  }

  const classification = classifyByMime(mimeType);

  // Plano efetivo do consultor (aplica beta override). Serve as duas regras
  // seguintes: espaço incluído e ficheiros por mês.
  let effectiveTier: string | null = null;
  {
    const { data: rpcTier } = await supabase.rpc("effective_tier", { _user_id: userId });
    if (typeof rpcTier === "string") effectiveTier = rpcTier;
    if (!effectiveTier) {
      const { data: prof } = await supabase
        .from("profiles")
        .select("subscription_tier")
        .eq("id", userId)
        .maybeSingle();
      effectiveTier = (prof as any)?.subscription_tier ?? null;
    }
  }

  // Espaço incluído no plano Base (100 MB). Planos pagos não têm este limite.
  {
    const { canStoreDocument } = await import("@/lib/retention/documents.server");
    const room = await canStoreDocument(supabase, userId, size, effectiveTier);
    if (!room.ok) {
      return failLog(supabase, {
        userId,
        channel,
        sourceMessageId,
        originalName,
        mimeType,
        size,
        errorCode: "quota_exceeded",
        reply: room.reply,
      });
    }
  }

  // Ficheiros por mês incluídos no plano. O gate é ANTES do upload: processar
  // e só depois recusar gastaria custo real e daria pior experiência.
  let usageHint: string | null = null;
  {
    const { canProcessAnotherFile } = await import("@/lib/drive/monthly-quota.server");
    const room = await canProcessAnotherFile(supabase, userId, effectiveTier);
    if (!room.ok) {
      return failLog(supabase, {
        userId,
        channel,
        sourceMessageId,
        originalName,
        mimeType,
        size,
        errorCode: "monthly_files_exceeded",
        reply: room.reply,
      });
    }
    usageHint = room.hint;
  }

  const ext = extensionFor(mimeType);
  const internalName = `${crypto.randomUUID()}.${ext}`;
  const storagePath = `${userId}/${new Date().getFullYear()}/${internalName}`;

  // 3. Upload para bucket privado
  const body = toUint8(input.bytes);
  const upload = await supabase.storage
    .from("assessor-files")
    .upload(storagePath, body, {
      contentType: mimeType,
      upsert: false,
    });
  if (upload.error) {
    console.error("[files] upload error:", upload.error.message);
    return failLog(supabase, {
      userId,
      channel,
      sourceMessageId,
      originalName,
      mimeType,
      size,
      errorCode: "storage_upload_failed",
      reply: "Recebi o ficheiro mas não consegui guardá-lo. Tenta novamente.",
    });
  }

  // 4. Persistir metadados
  const { data: fileRow, error: insertErr } = await supabase
    .from("uploaded_files")
    .insert({
      user_id: userId,
      channel,
      source_message_id: sourceMessageId ?? null,
      external_file_id: input.externalFileId ?? null,
      original_file_name: originalName,
      internal_file_name: internalName,
      mime_type: mimeType,
      size_bytes: size,
      storage_path: storagePath,
      processing_status: "processed",
      classification,
      extracted_metadata: {},
    })
    .select("id")
    .single();

  if (insertErr || !fileRow) {
    console.error("[files] insert error:", insertErr?.message);
    // Cleanup do storage se metadados falharem
    await supabase.storage.from("assessor-files").remove([storagePath]);
    return {
      ok: false,
      fileId: null,
      classification,
      status: "failed",
      reply: "Recebi o ficheiro mas houve um erro ao registá-lo.",
      extractedText: null,
      errorCode: "db_insert_failed",
    };
  }

  const fileId = (fileRow as { id: string }).id;
  const label = friendlyLabel(classification);
  const article = label === "imagem" || label === "mensagem de voz" ? "a" : "o";
  let reply = `Recebi ${article} ${label}. A que se refere?`;

  // Drive Inteligente: se o conteúdo aponta claramente para registos já
  // existentes, liga o mais óbvio e propõe o seguinte (com confirmação).
  try {
    if (classification !== "audio" && !input.deferAutoLink) {
      let extraText: string | null = null;
      if (mimeType.startsWith("text/") || mimeType === "application/json") {
        extraText = new TextDecoder().decode(body).slice(0, 20000);
        if (extraText.trim()) {
          await supabase
            .from("uploaded_files")
            .update({ extracted_text: extraText } as never)
            .eq("id", fileId);
        }
      }
      // Documentos (PDF) passam pela extração antes de tentarmos ligar:
      // a morada/NIF lidos ajudam a encontrar o imóvel certo.
      if (classification === "documento_pdf") {
        const meta = await applyDocumentExtraction({
          supabase,
          fileId,
          bytes: body,
          mimeType,
          currentName: originalName,
          userId,
          channel,
        });
        if (meta?.text) extraText = [extraText, meta.text].filter(Boolean).join("\n").slice(0, 20000);
        // Já sabemos o que é o documento: dizemos-lhe o nome em vez de
        // perguntar "a que se refere?" às cegas.
        if (meta?.reading) {
          const { documentToEngineText, docLinkText } = await import("@/lib/drive/doc-engine-text");
          const link = docLinkText(meta.reading);
          if (link) extraText = [extraText, link].filter(Boolean).join("\n").slice(0, 20000);
          const docText = documentToEngineText(meta.reading);
          if (docText) {
            reply = `${docText} Queres que associe este documento a alguém ou a um imóvel em particular?`;
          }
        }
      }

      const { autoLinkAndSuggest } = await import("@/lib/drive/link-suggestions.server");
      const auto = await autoLinkAndSuggest({
        supabase,
        userId,
        channel,
        fileId,
        fileLabel: `${article} ${label}`,
        extraText,
        sourceMessageId: sourceMessageId ?? null,
      });
      if (auto.reply) {
        return {
          ok: true,
          fileId,
          classification,
          status: "processed",
          reply: withUsageHint(auto.reply, usageHint),
          extractedText: extraText,
        };
      }
    }
  } catch (err) {
    console.error("[files] autoLink error:", err instanceof Error ? err.message : err);
  }

  // Regista uma ação pendente de classificação para conduzir a conversa
  // progressiva (descrição → confirmação de lembrete → data/hora).
  // Áudio segue o motor via transcrição — não precisa de classificação.
  try {
    if (classification !== "audio") {
    const { findActivePendingAction, markPendingActionStatus, createPendingAction } =
      await import("./memory.server");
    const prev = await findActivePendingAction(supabase, userId, channel);
    if (prev) await markPendingActionStatus(supabase, prev.id, "cancelled");
    await createPendingAction(supabase, {
      userId,
      channel,
      intent: "classify_file",
      originalContent: `[${classification}] ${originalName}`,
      payload: {
        file_id: fileId,
        file_label: label,
        file_article: article,
        classification,
        original_file_name: originalName,
        mime_type: mimeType,
      },
      pendingQuestion: reply,
      currentQuestion: "file_description",
      sourceMessageId: sourceMessageId ?? null,
    });
    }
  } catch (err) {
    console.error(
      "[files] createPendingAction error:",
      err instanceof Error ? err.message : err,
    );
  }

  return {
    ok: true,
    fileId,
    classification,
    status: "processed",
    reply: withUsageHint(reply, usageHint),
    extractedText: null,
  };
}

async function failLog(
  supabase: any,
  args: {
    userId: string;
    channel: string;
    sourceMessageId?: string | null;
    originalName: string;
    mimeType: string;
    size: number;
    errorCode: string;
    reply: string;
  },
): Promise<ProcessIncomingFileResult> {
  try {
    await supabase.from("uploaded_files").insert({
      user_id: args.userId,
      channel: args.channel,
      source_message_id: args.sourceMessageId ?? null,
      original_file_name: args.originalName,
      internal_file_name: `rejected-${Date.now()}`,
      mime_type: args.mimeType,
      size_bytes: args.size,
      storage_path: "",
      processing_status: "failed",
      error_code: args.errorCode,
      error_message: args.reply,
    });
  } catch (err) {
    console.error("[files] failLog insert error:", err instanceof Error ? err.message : err);
  }
  return {
    ok: false,
    fileId: null,
    classification: "diversos",
    status: "failed",
    reply: args.reply,
    extractedText: null,
    errorCode: args.errorCode,
  };
}