// Drive Inteligente: um ficheiro pode estar ligado a vários registos ao mesmo
// tempo (Pessoa, Imóvel, Negócio). Aqui juntamos, para uma ficha, todos os
// ficheiros que lhe chegam por QUALQUER caminho:
//   - ligação direta (file_links)
//   - ligação legada (uploaded_files.related_resource_* / opportunity_id)
//   - ligação através do Negócio: um documento do negócio aparece também na
//     ficha da Pessoa e do Imóvel desse negócio (e vice-versa).
import type { LinkableType } from "./link-match";

export interface RelatedFileVia {
  type: LinkableType;
  id: string;
  label: string;
}

export interface RelatedFile {
  id: string;
  name: string | null;
  mime_type: string | null;
  document_type: string | null;
  classification: string | null;
  user_description: string | null;
  created_at: string;
  /** null quando está ligado diretamente a esta ficha. */
  via: RelatedFileVia | null;
}

interface GraphNode {
  type: LinkableType;
  id: string;
  label: string;
  direct: boolean;
}

/** Registos cujos documentos também devem aparecer nesta ficha. */
export async function expandEntityGraph(
  supabase: any,
  userId: string,
  type: LinkableType,
  id: string,
): Promise<GraphNode[]> {
  const nodes: GraphNode[] = [{ type, id, label: "", direct: true }];
  const add = (n: GraphNode) => {
    if (!n.id) return;
    if (nodes.some((x) => x.type === n.type && x.id === n.id)) return;
    nodes.push(n);
  };

  const dealLabel = (o: any): string =>
    String(o?.title || [o?.deal_kind ?? o?.type, o?.stage].filter(Boolean).join(" · ") || "Negócio");

  if (type === "opportunity") {
    const [{ data: deal }, { data: props }] = await Promise.all([
      supabase.from("opportunities").select("id, person_id, property_id").eq("id", id).eq("user_id", userId).maybeSingle(),
      supabase.from("opportunity_properties").select("property_id").eq("opportunity_id", id).eq("user_id", userId),
    ]);
    const personId = (deal as any)?.person_id ?? null;
    if (personId) {
      const { data: p } = await supabase.from("people").select("name").eq("id", personId).maybeSingle();
      add({ type: "person", id: personId, label: (p as any)?.name ?? "Pessoa", direct: false });
    }
    const propIds = new Set<string>(((props ?? []) as any[]).map((r) => r.property_id));
    if ((deal as any)?.property_id) propIds.add((deal as any).property_id);
    if (propIds.size) {
      const { data: rows } = await supabase.from("properties").select("id, title").in("id", [...propIds]).eq("user_id", userId);
      for (const r of ((rows ?? []) as any[])) {
        add({ type: "property", id: r.id, label: r.title ?? "Imóvel", direct: false });
      }
    }
    return nodes;
  }

  // Pessoa / Imóvel → negócios em que participam.
  let dealRows: any[] = [];
  if (type === "person") {
    const { data } = await supabase
      .from("opportunities")
      .select("id, title, deal_kind, type, stage")
      .eq("user_id", userId)
      .eq("person_id", id)
      .limit(50);
    dealRows = (data ?? []) as any[];
  } else {
    const [{ data: viaLink }, { data: viaCol }] = await Promise.all([
      supabase.from("opportunity_properties").select("opportunity_id").eq("property_id", id).eq("user_id", userId).limit(50),
      supabase.from("opportunities").select("id, title, deal_kind, type, stage").eq("user_id", userId).eq("property_id", id).limit(50),
    ]);
    const ids = new Set<string>(((viaLink ?? []) as any[]).map((r) => r.opportunity_id));
    dealRows = ((viaCol ?? []) as any[]).slice();
    for (const d of dealRows) ids.delete(d.id);
    if (ids.size) {
      const { data: rows } = await supabase
        .from("opportunities").select("id, title, deal_kind, type, stage").in("id", [...ids]).eq("user_id", userId);
      dealRows = dealRows.concat(((rows ?? []) as any[]));
    }
  }
  for (const d of dealRows) add({ type: "opportunity", id: d.id, label: dealLabel(d), direct: false });
  return nodes;
}

export async function listRelatedFiles(
  supabase: any,
  userId: string,
  type: LinkableType,
  id: string,
): Promise<RelatedFile[]> {
  const nodes = await expandEntityGraph(supabase, userId, type, id);

  const { data: links } = await supabase
    .from("file_links")
    .select("file_id, entity_type, entity_id")
    .eq("user_id", userId)
    .in("entity_type", [...new Set(nodes.map((n) => n.type))])
    .in("entity_id", nodes.map((n) => n.id));

  const nodeOf = new Map(nodes.map((n) => [`${n.type}:${n.id}`, n]));
  const viaByFile = new Map<string, GraphNode>();
  for (const l of ((links ?? []) as any[])) {
    const n = nodeOf.get(`${l.entity_type}:${l.entity_id}`);
    if (!n) continue;
    const prev = viaByFile.get(l.file_id);
    if (!prev || (!prev.direct && n.direct)) viaByFile.set(l.file_id, n);
  }

  // Ligações legadas (antes de file_links) continuam a contar.
  const legacy = await supabase
    .from("uploaded_files")
    .select("id")
    .eq("user_id", userId)
    .eq("related_resource_type", type)
    .eq("related_resource_id", id)
    .is("deleted_at", null);
  for (const f of ((legacy.data ?? []) as any[])) {
    if (!viaByFile.has(f.id)) viaByFile.set(f.id, nodes[0]);
  }
  if (type === "opportunity") {
    const { data: byCol } = await supabase
      .from("uploaded_files").select("id").eq("user_id", userId).eq("opportunity_id", id).is("deleted_at", null);
    for (const f of ((byCol ?? []) as any[])) if (!viaByFile.has(f.id)) viaByFile.set(f.id, nodes[0]);
  }

  const ids = [...viaByFile.keys()];
  if (!ids.length) return [];

  const { data: files } = await supabase
    .from("uploaded_files")
    .select("id, original_file_name, mime_type, document_type, classification, user_description, created_at")
    .eq("user_id", userId)
    .in("id", ids)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  return ((files ?? []) as any[]).map((f) => {
    const n = viaByFile.get(f.id)!;
    return {
      id: f.id,
      name: f.original_file_name ?? null,
      mime_type: f.mime_type ?? null,
      document_type: f.document_type ?? null,
      classification: f.classification ?? null,
      user_description: f.user_description ?? null,
      created_at: f.created_at,
      via: n.direct ? null : { type: n.type, id: n.id, label: n.label },
    } satisfies RelatedFile;
  });
}