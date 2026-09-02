import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { classifyMissingRecord, type MissingRecordKind } from "@/lib/records/missing-record";

const TABLES = {
  follow_up: { table: "follow_ups", archived: true },
  person: { table: "people", archived: true },
  property: { table: "properties", archived: true },
  opportunity: { table: "opportunities", archived: true },
  prospecting_lead: { table: "prospecting_leads", archived: false },
  file: { table: "uploaded_files", archived: true },
} as const;

type Kind = keyof typeof TABLES;

/**
 * Quando um registo não aparece, dizer porquê: sessão errada, arquivado ou
 * inexistente. Só devolve o dono em forma de "é de outra conta" — nunca o
 * email nem o conteúdo do registo de outrem.
 */
export const explainMissingRecord = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        kind: z.enum(Object.keys(TABLES) as [Kind, ...Kind[]]),
        id: z.string().uuid(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }): Promise<{ kind: MissingRecordKind; sessionEmail: string | null }> => {
    const cfg = TABLES[data.kind as Kind];
    const sessionEmail = ((context.claims as any)?.email as string | undefined) ?? null;

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const cols = cfg.archived ? "user_id, archived_at" : "user_id";
    const { data: row } = await supabaseAdmin.from(cfg.table).select(cols).eq("id", data.id).maybeSingle();

    if (!row) return { kind: "absent", sessionEmail };
    const r = row as any;
    const mine = r.user_id === context.userId;
    return {
      kind: classifyMissingRecord({
        existsForOtherUser: !mine,
        archivedForMe: mine && Boolean(r.archived_at),
      }),
      sessionEmail,
    };
  });
