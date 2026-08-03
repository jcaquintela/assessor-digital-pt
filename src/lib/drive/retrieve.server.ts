// Recuperador do Drive — pesquisa e entrega do ficheiro real.
//
// A pesquisa é em linguagem natural: tipo de documento (caderneta, CPU,
// certidão...) cruzado com o assunto (morada, título do imóvel ou nome da
// pessoa) através das ligações do Drive Inteligente (file_links), e não só
// pelo nome exacto do ficheiro.

import { DOC_TYPES, normalize, type DocTypeKey } from "./retrieve";

export type DocHit = {
  id: string;
  fileName: string;
  mimeType: string;
  storagePath: string | null;
  docType: string | null;
  summary: string | null;
  entityLabels: string[];
  score: number;
};

const ENTITY_TABLES: Record<string, [string, string[]]> = {
  person: ["people", ["name"]],
  property: ["properties", ["title", "address", "city"]],
  opportunity: ["opportunities", ["title"]],
  prospecting_lead: ["prospecting_leads", ["title", "address", "location"]],
  miscellaneous: ["miscellaneous_items", ["title"]],
};

function typeWords(key: DocTypeKey | null): string[] {
  if (!key) return [];
  return (DOC_TYPES.find((t) => t.key === key)?.words ?? []).map(normalize);
}

/** Procura documentos por tipo e/ou assunto. Devolve por ordem de relevância. */
export async function findDocuments(
  supabase: any,
  userId: string,
  q: { docType?: DocTypeKey | null; docLabel?: string | null; subject?: string | null },
  limit = 5,
): Promise<DocHit[]> {
  const { data: files } = await supabase
    .from("uploaded_files")
    .select(
      "id, original_file_name, internal_file_name, mime_type, storage_path, document_type, classification, ai_summary, extracted_text, user_description, created_at",
    )
    .eq("user_id", userId)
    .is("deleted_at", null)
    .not("storage_path", "is", null)
    .order("created_at", { ascending: false })
    .limit(300);

  const rows = (files ?? []) as any[];
  if (!rows.length) return [];

  // Ligações + nomes das entidades (ligações múltiplas do Drive Inteligente).
  const ids = rows.map((r) => r.id);
  const { data: linkRows } = await supabase
    .from("file_links")
    .select("file_id, entity_type, entity_id")
    .eq("user_id", userId)
    .in("file_id", ids);
  const links = (linkRows ?? []) as any[];

  const byType: Record<string, string[]> = {};
  for (const l of links) (byType[l.entity_type] ??= []).push(l.entity_id);
  const labels = new Map<string, string>();
  await Promise.all(
    Object.entries(byType).map(async ([type, entityIds]) => {
      const t = ENTITY_TABLES[type];
      if (!t) return;
      const { data: ents } = await supabase
        .from(t[0])
        .select(["id", ...t[1]].join(", "))
        .eq("user_id", userId)
        .in("id", [...new Set(entityIds)]);
      for (const e of ((ents ?? []) as any[])) {
        const label = t[1].map((c) => e?.[c]).filter(Boolean).join(" · ");
        if (label) labels.set(`${type}:${e.id}`, label);
      }
    }),
  );
  const labelsByFile = new Map<string, string[]>();
  for (const l of links) {
    const lab = labels.get(`${l.entity_type}:${l.entity_id}`);
    if (!lab) continue;
    const arr = labelsByFile.get(l.file_id) ?? [];
    arr.push(lab);
    labelsByFile.set(l.file_id, arr);
  }

  const words = typeWords(q.docType ?? null);
  // "manda-me o pdf" restringe ao formato pedido.
  const wantsPdf = /\bpdf\b/i.test(String(q.subject ?? "")) || /\bpdf\b/i.test(String(q.docLabel ?? ""));
  const subject = q.subject ? normalize(q.subject) : null;
  const subjectTokens = (subject ?? "")
    .split(/\s+/)
    .filter((w) => w.length >= 3);

  const hits: DocHit[] = [];
  for (const r of rows) {
    if (wantsPdf && !String(r.mime_type ?? "").includes("pdf")) continue;
    const fileName = String(r.original_file_name ?? r.internal_file_name ?? "ficheiro");
    const entityLabels = labelsByFile.get(r.id) ?? [];
    const haystack = normalize(
      [
        fileName,
        r.document_type,
        r.classification,
        r.ai_summary,
        r.user_description,
        String(r.extracted_text ?? "").slice(0, 4000),
        entityLabels.join(" "),
      ]
        .filter(Boolean)
        .join(" "),
    );

    let score = 0;
    if (words.length) {
      const nameHit = words.some((w) => normalize(fileName).includes(w));
      const typeHit = words.some((w) => normalize(String(r.document_type ?? "")).includes(w) || w.includes(normalize(String(r.document_type ?? "x"))));
      const bodyHit = words.some((w) => haystack.includes(w));
      if (nameHit) score += 4;
      if (typeHit) score += 3;
      else if (bodyHit) score += 2;
      if (!nameHit && !typeHit && !bodyHit) continue; // tipo pedido não bate
    }
    if (subjectTokens.length) {
      const entityHay = normalize(entityLabels.join(" "));
      let matched = 0;
      for (const tok of subjectTokens) {
        if (normalize(fileName).includes(tok)) { score += 3; matched++; }
        else if (entityHay.includes(tok)) { score += 3; matched++; }
        else if (haystack.includes(tok)) { score += 1; matched++; }
      }
      if (!matched && words.length === 0) continue;
      if (!matched && words.length) score -= 1;
    }
    if (!words.length && !subjectTokens.length) score += 1; // pedido genérico
    if (score <= 0) continue;
    hits.push({
      id: r.id,
      fileName,
      mimeType: String(r.mime_type ?? "application/octet-stream"),
      storagePath: r.storage_path ?? null,
      docType: r.document_type ?? r.classification ?? null,
      summary: r.ai_summary ?? null,
      entityLabels,
      score,
    });
  }

  hits.sort((a, b) => b.score - a.score);
  return hits.slice(0, limit);
}

/** Documentos ligados a uma pessoa/imóvel pelo nome ("que documentos tenho da Sra. Ana?"). */
/**
 * Procura documentos por metadado extraído: NIF, artigo matricial ou fração.
 * Além dos campos extraídos, procura também no texto lido do documento, para
 * apanhar ficheiros guardados antes da extração automática existir.
 */
export async function findDocumentsByMeta(
  supabase: any,
  userId: string,
  q: { nif?: string | null; artigo?: string | null },
  limit = 5,
): Promise<DocHit[]> {
  const nif = String(q.nif ?? "").replace(/\D/g, "");
  const artigo = String(q.artigo ?? "").trim().replace(/[%_]/g, "");
  if (!nif && !artigo) return [];

  const ors: string[] = [];
  if (nif) {
    ors.push(`doc_nif.eq.${nif}`, `extracted_text.ilike.%${nif}%`);
  }
  if (artigo) {
    ors.push(
      `doc_artigo_matricial.ilike.%${artigo}%`,
      `doc_fracao.ilike.%${artigo}%`,
    );
  }

  const { data: files } = await supabase
    .from("uploaded_files")
    .select(
      "id, original_file_name, internal_file_name, mime_type, storage_path, document_type, classification, ai_summary, doc_nif, doc_artigo_matricial, doc_fracao, created_at",
    )
    .eq("user_id", userId)
    .is("deleted_at", null)
    .not("storage_path", "is", null)
    .or(ors.join(","))
    .order("created_at", { ascending: false })
    .limit(limit);

  return ((files ?? []) as any[]).map((r) => ({
    id: r.id,
    fileName: String(r.original_file_name ?? r.internal_file_name ?? "ficheiro"),
    mimeType: String(r.mime_type ?? "application/octet-stream"),
    storagePath: r.storage_path ?? null,
    docType: r.document_type ?? r.classification ?? null,
    summary: r.ai_summary ?? null,
    entityLabels: [],
    score: r.doc_nif && nif && r.doc_nif === nif ? 5 : 3,
  }));
}

/** Documentos ligados a uma pessoa/imóvel pelo nome ("que documentos tenho da Sra. Ana?"). */
export async function findDocumentsForSubject(
  supabase: any,
  userId: string,
  subject: string,
  limit = 10,
): Promise<{ label: string | null; hits: DocHit[] }> {
  // Pesquisa por tokens: "moradia da Alameda da República" encontra o imóvel
  // mesmo quando o consultor não escreve o título exacto (nem os acentos).
  const GENERIC = /^(moradia|imovel|imoveis|casa|apartamento|predio|terreno|loja|cliente|senhor|senhora)$/;
  const tokens = normalize(subject)
    .split(/\s+/)
    .filter((w) => w.length >= 4 && !GENERIC.test(w))
    .sort((a, b) => b.length - a.length)
    .slice(0, 3)
    .map((w) => w.replace(/[%_]/g, ""));
  const terms = (tokens.length ? tokens : [normalize(subject).slice(0, 40)]).map((t) => `%${t}%`);
  const orFor = (cols: string[]) =>
    terms.flatMap((t) => cols.map((c) => `${c}.ilike.${t}`)).join(",");
  const [people, props] = await Promise.all([
    supabase.from("people").select("id, name").eq("user_id", userId).or(orFor(["name"])).limit(6),
    supabase
      .from("properties")
      .select("id, title, address")
      .eq("user_id", userId)
      .or(orFor(["title", "address", "city"]))
      .limit(6),
  ]);

  const targets: { type: string; id: string; label: string }[] = [
    ...(((people.data ?? []) as any[]).map((p) => ({ type: "person", id: p.id, label: p.name }))),
    ...(((props.data ?? []) as any[]).map((p) => ({
      type: "property",
      id: p.id,
      label: p.title ?? p.address ?? "Imóvel",
    }))),
  ];

  if (!targets.length) {
    const hits = await findDocuments(supabase, userId, { subject }, limit);
    return { label: null, hits };
  }

  const { data: links } = await supabase
    .from("file_links")
    .select("file_id, entity_type, entity_id")
    .eq("user_id", userId)
    .in("entity_id", targets.map((t) => t.id));
  const linkRows = (links ?? []) as any[];
  const fileIds = [...new Set(linkRows.map((l) => l.file_id))];
  if (!fileIds.length) return { label: targets[0]!.label, hits: [] };
  // A etiqueta mostrada é a do registo que tem mesmo documentos.
  const withFiles = targets.find((t) => linkRows.some((l) => l.entity_id === t.id)) ?? targets[0]!;

  const { data: files } = await supabase
    .from("uploaded_files")
    .select("id, original_file_name, internal_file_name, mime_type, storage_path, document_type, classification, ai_summary")
    .eq("user_id", userId)
    .is("deleted_at", null)
    .in("id", fileIds)
    .order("created_at", { ascending: false })
    .limit(limit);

  const hits: DocHit[] = ((files ?? []) as any[]).map((r) => ({
    id: r.id,
    fileName: String(r.original_file_name ?? r.internal_file_name ?? "ficheiro"),
    mimeType: String(r.mime_type ?? "application/octet-stream"),
    storagePath: r.storage_path ?? null,
    docType: r.document_type ?? r.classification ?? null,
    summary: r.ai_summary ?? null,
    entityLabels: [withFiles.label],
    score: 1,
  }));
  return { label: withFiles.label, hits };
}

/** Descarrega o ficheiro do storage e devolve bytes + URL assinado. */
export async function loadDocument(
  supabase: any,
  userId: string,
  fileId: string,
): Promise<
  | { ok: true; fileName: string; mimeType: string; bytes: Uint8Array; signedUrl: string | null }
  | { ok: false; error: string }
> {
  const { data: file } = await supabase
    .from("uploaded_files")
    .select("id, original_file_name, internal_file_name, mime_type, storage_path")
    .eq("id", fileId)
    .eq("user_id", userId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!file?.storage_path) return { ok: false, error: "ficheiro sem conteúdo guardado" };

  const { data: signed } = await supabase.storage
    .from("assessor-files")
    .createSignedUrl(file.storage_path, 600);
  const signedUrl = signed?.signedUrl ?? null;

  const { data: blob, error } = await supabase.storage
    .from("assessor-files")
    .download(file.storage_path);
  if (error || !blob) return { ok: false, error: error?.message ?? "download falhou" };
  const bytes = new Uint8Array(await blob.arrayBuffer());

  return {
    ok: true,
    fileName: String(file.original_file_name ?? file.internal_file_name ?? "documento"),
    mimeType: String(file.mime_type ?? "application/octet-stream"),
    bytes,
    signedUrl,
  };
}
