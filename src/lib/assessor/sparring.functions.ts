// Entrada e saída explícitas do modo treino, a partir da app.
//
// O estado do treino nasce do clique do consultor em "Treino de objeções" —
// não da interpretação do texto enviado. Foi assim que um roleplay correu com
// o pipeline de escrita armado: a frase sugerida pelo menu não era reconhecida.

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const SPARRING_START_TEXT =
  "Treino de objeções: simulamos uma chamada a frio para ganhares ritmo e testares abordagens.";

export const setSparringMode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { active: boolean; channel?: string }) => ({
    active: Boolean(input?.active),
    channel: String(input?.channel ?? "dashboard"),
  }))
  .handler(async ({ data, context }): Promise<{ ok: true; active: boolean }> => {
    const { supabase, userId } = context;
    const { startSparring, stopSparring } = await import("./v3/sparring-state.server");
    if (data.active) await startSparring(supabase as never, userId, data.channel);
    else await stopSparring(supabase as never, userId, data.channel);
    return { ok: true, active: data.active };
  });
