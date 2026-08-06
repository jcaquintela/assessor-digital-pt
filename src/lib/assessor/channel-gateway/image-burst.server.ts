// Coalescência de rajadas de imagens — parte com I/O.

import {
  IMAGE_BURST_POLL_MS,
  IMAGE_BURST_SETTLE_MS,
  IMAGE_BURST_MAX,
  hasNewerImage,
  selectImageBurst,
  summariseImageBurst,
  type ImageBurstRow,
} from "./image-burst";

async function recentImageTurns(
  supabase: any,
  userId: string,
  channel: string,
): Promise<ImageBurstRow[]> {
  const { data } = await supabase
    .from("assessor_messages")
    .select("id, role, created_at, message_type")
    .eq("user_id", userId)
    .eq("channel", channel)
    .order("created_at", { ascending: false })
    .limit(IMAGE_BURST_MAX * 2);
  return Array.isArray(data) ? (data as ImageBurstRow[]) : [];
}

export type ImageBurstDecision =
  | { answer: false }
  | { answer: false; silent: true }
  | { answer: true; count: number; since: string | null };

/**
 * Corre depois de a foto estar tratada (guardada, lida, ligada) e antes de
 * responder.
 *
 * - `{ answer: false }` → há foto mais recente na mesma rajada: esta cala-se
 *   e a última responde por todas.
 * - `{ answer: true, count }` → é a última da rajada. Com `count > 1` a
 *   resposta é uma só frase para o conjunto.
 */
export async function decideImageBurstReply(
  supabase: any,
  args: {
    userId: string;
    channel: string;
    currentMessageId: string | null;
    settleMs?: number;
    sleep?: (ms: number) => Promise<void>;
  },
): Promise<ImageBurstDecision> {
  const { userId, channel, currentMessageId } = args;
  if (!currentMessageId) return { answer: true, count: 1, since: null };

  const sleep = args.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const settleMs = args.settleMs ?? IMAGE_BURST_SETTLE_MS;

  let rows = await recentImageTurns(supabase, userId, channel);
  const current = rows.find((r) => r.id === currentMessageId);
  if (!current) return { answer: true, count: 1, since: null };

  // Espera pela foto seguinte. Sai mal ela apareça — só a última da rajada
  // chega ao fim da janela, por isso a fila não acumula esperas.
  const deadline = Date.now() + settleMs;
  while (Date.now() < deadline) {
    if (hasNewerImage(rows, current)) return { answer: false };
    await sleep(IMAGE_BURST_POLL_MS);
    rows = await recentImageTurns(supabase, userId, channel);
  }
  if (hasNewerImage(rows, current)) return { answer: false };

  const burst = selectImageBurst(rows, currentMessageId);
  return {
    answer: true,
    count: Math.max(1, burst.length),
    since: burst[0]?.created_at ?? null,
  };
}

/**
 * Frase única para a rajada: quantas imagens, que documentos aparentam ser e
 * a que imóvel/pessoa ficaram ligadas.
 */
export async function buildImageBurstReply(
  supabase: any,
  args: { userId: string; channel: string; count: number; since: string | null },
): Promise<string> {
  const docTypes: string[] = [];
  let linkedLabel: string | null = null;

  try {
    let q = supabase
      .from("uploaded_files")
      .select("document_type, related_resource_type, related_resource_id, created_at")
      .eq("user_id", args.userId)
      .eq("channel", args.channel)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(IMAGE_BURST_MAX);
    if (args.since) q = q.gte("created_at", args.since);
    const { data } = await q;
    const rows = Array.isArray(data) ? (data as any[]) : [];
    for (const r of rows) {
      const t = String(r.document_type ?? "").trim();
      if (t) docTypes.push(t);
    }
    const prop = rows.find((r) => r.related_resource_type === "property" && r.related_resource_id);
    if (prop) {
      const { data: p } = await supabase
        .from("properties")
        .select("title, address")
        .eq("id", prop.related_resource_id)
        .maybeSingle();
      const label = String((p as any)?.title ?? (p as any)?.address ?? "").trim();
      linkedLabel = label || null;
    }
  } catch {
    /* sem detalhe, a frase base chega */
  }

  return summariseImageBurst({ count: args.count, docTypes, linkedLabel });
}
