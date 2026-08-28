// Reparação das séries recorrentes órfãs do Outlook (ver orphan-series.ts).
//
// Passos: (1) encontrar compromissos importados, abertos e com data no passado;
// (2) perguntar ao Graph se o id é um `seriesMaster`; (3) arquivar essas linhas
// (não apagamos nada no calendário do consultor); (4) reimportar a janela por
// `calendarView`, que devolve as ocorrências já expandidas — ao contrário do
// delta, não depende de a série ter mudado.
//
// Duplicados: a reimportação passa pelo mesmo `applyExternalEvents` do sync
// normal, que já reaproveita o compromisso existente (por referência externa ou
// por título+hora ao minuto). Séries corretamente importadas ficam intactas.

import { applyExternalEvents, callProvider, outlookEventsFromDelta } from "./sync.server";
import { orphanMasterCandidates, backfillWindow, type ImportedEventRow } from "./orphan-series";

const PROVIDER = "microsoft_outlook" as const;
const PAGE_LIMIT = 10;

export interface BackfillResult {
  candidates: number;
  masters: number;
  repaired: number;
  imported: number;
}

/** Reparação idempotente: sem masters órfãos não faz uma única chamada extra. */
export async function backfillOrphanSeries(
  supabaseAdmin: any,
  userId: string,
  now: Date = new Date(),
): Promise<BackfillResult> {
  const { data } = await supabaseAdmin
    .from("follow_ups")
    .select("id, title, due_date, status, archived_at, external_reference")
    .eq("user_id", userId)
    .eq("source_channel", PROVIDER)
    .is("archived_at", null)
    .lt("due_date", now.toISOString())
    .order("due_date", { ascending: false })
    .limit(100);

  const candidates = orphanMasterCandidates((data ?? []) as ImportedEventRow[], now);
  const result: BackfillResult = { candidates: candidates.length, masters: 0, repaired: 0, imported: 0 };
  if (!candidates.length) return result;

  const masters: ImportedEventRow[] = [];
  for (const row of candidates) {
    const id = String(row.external_reference);
    const r = await callProvider(
      supabaseAdmin, userId, PROVIDER,
      `/me/events/${encodeURIComponent(id)}?$select=id,type,subject`,
    );
    // 404: o evento já não existe lá fora — a verificação normal trata disso.
    if (!r.ok) continue;
    if (String(r.body?.type ?? "") === "seriesMaster") masters.push(row);
  }
  result.masters = masters.length;
  if (!masters.length) return result;

  for (const m of masters) {
    await supabaseAdmin.from("follow_ups")
      .update({ archived_at: new Date().toISOString(), status: "arquivado" })
      .eq("id", m.id).eq("user_id", userId);
    await supabaseAdmin.from("calendar_event_links")
      .update({ deleted: true })
      .eq("user_id", userId).eq("provider", PROVIDER).eq("follow_up_id", m.id);
    result.repaired++;
  }

  // Reimportar a janela pelas ocorrências reais.
  const { start, end } = backfillWindow(now);
  let path =
    `/me/calendarView?startDateTime=${encodeURIComponent(start)}&endDateTime=${encodeURIComponent(end)}`
    + `&$select=id,subject,bodyPreview,start,end,type,seriesMasterId,lastModifiedDateTime,isCancelled&$top=100`;
  const events = [];
  for (let page = 0; page < PAGE_LIMIT; page++) {
    const r = await callProvider(supabaseAdmin, userId, PROVIDER, path, {
      headers: { Prefer: 'outlook.timezone="UTC"' },
    });
    if (!r.ok) break;
    events.push(...outlookEventsFromDelta(r.body?.value ?? []));
    const next = r.body?.["@odata.nextLink"] ? String(r.body["@odata.nextLink"]) : null;
    if (!next) break;
    path = next.replace(/^https:\/\/graph\.microsoft\.com\/v1\.0/, "");
  }
  if (events.length) {
    const applied = await applyExternalEvents(supabaseAdmin, userId, PROVIDER, events);
    result.imported = applied.applied;
    result.repaired += applied.applied;
  }
  return result;
}
