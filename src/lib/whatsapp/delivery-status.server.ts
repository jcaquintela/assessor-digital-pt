// Estados de entrega da Meta (sent → delivered → read) e resposta do consultor.
//
// Sem isto, um envio proativo fora da janela de 24h só se sabe "aceite pela
// Meta" — que não é o mesmo que ter chegado. Aqui fechamos a prova.

const ORDER: Record<string, number> = { sent: 1, delivered: 2, read: 3, failed: 4 };

export interface MetaStatus {
  id: string;
  status: string;
  timestamp?: string | number | null;
}

function tsToIso(ts: string | number | null | undefined): string {
  const n = Number(ts);
  return Number.isFinite(n) && n > 0 ? new Date(n * 1000).toISOString() : new Date().toISOString();
}

/** Aplica os `statuses` de um webhook da Meta aos logs de envio. */
export async function applyDeliveryStatuses(
  supabaseAdmin: any,
  statuses: MetaStatus[],
): Promise<number> {
  let applied = 0;
  for (const s of statuses) {
    const messageId = String(s?.id ?? "");
    const status = String(s?.status ?? "").toLowerCase();
    if (!messageId || !ORDER[status]) continue;

    const { data: log } = await supabaseAdmin
      .from("whatsapp_send_logs")
      .select("id, delivery_status, test_id")
      .eq("message_id", messageId)
      .maybeSingle();
    if (!log) continue;

    const current = ORDER[String((log as any).delivery_status ?? "sent")] ?? 1;
    if ((ORDER[status] ?? 0) < current) continue; // nunca recua

    const at = tsToIso(s.timestamp);
    const patch: Record<string, unknown> = { delivery_status: status };
    if (status === "delivered") patch['delivered_at'] = at;
    if (status === "read") patch['read_at'] = at;
    await supabaseAdmin.from("whatsapp_send_logs").update(patch as never).eq("id", (log as any).id);

    if ((log as any).test_id) {
      await supabaseAdmin
        .from("whatsapp_proactive_tests")
        .update({ status } as never)
        .eq("id", (log as any).test_id);
    }
    applied++;
  }
  return applied;
}

/**
 * O consultor respondeu: marca o último envio proativo a esse número (últimas
 * 24h) como respondido. É o sinal mais forte de que a mensagem chegou mesmo.
 */
export async function markInboundReply(
  supabaseAdmin: any,
  phone: string,
  atIso?: string,
): Promise<void> {
  try {
    const since = new Date(Date.now() - 24 * 3600_000).toISOString();
    const { data } = await supabaseAdmin
      .from("whatsapp_send_logs")
      .select("id, test_id")
      .eq("to_phone", phone)
      .is("replied_at", null)
      .not("template_name", "is", null)
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(1);
    const row = (data as any[])?.[0];
    if (!row) return;
    await supabaseAdmin
      .from("whatsapp_send_logs")
      .update({ replied_at: atIso ?? new Date().toISOString() } as never)
      .eq("id", row.id);
    if (row.test_id) {
      await supabaseAdmin
        .from("whatsapp_proactive_tests")
        .update({ status: "replied" } as never)
        .eq("id", row.test_id);
    }
  } catch { /* best-effort */ }
}
