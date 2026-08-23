// Telemetria de interface — cliques e visitas, sem PII nem conteúdo de conversa.
//
// Escreve directamente em `product_telemetry_events` com o cliente do browser
// (RLS: cada consultor só insere/lê as suas linhas). Best-effort: nunca
// interrompe a navegação nem mostra erros ao consultor.
import { supabase } from "@/integrations/supabase/client";

export const UI_EVENTS = {
  /** Abertura do painel Hoje. */
  hojeVisto: "hoje_visto",
  /** Clique em qualquer CTA "Falar com o Afonso" no painel Hoje. */
  hojeCtaAfonso: "hoje_cta_afonso",
  /** Sugestão "próxima melhor ação" (nível 2) mostrada no painel Hoje. */
  hojeNbaVisto: "hoje_nba_visto",
  /** Clique na sugestão "próxima melhor ação". */
  hojeNbaClicado: "hoje_nba_clicado",
} as const;

export type UiEvent = (typeof UI_EVENTS)[keyof typeof UI_EVENTS];

/** Onde estava o botão clicado — permite saber qual das superfícies funciona. */
export type CtaSurface = "cabecalho" | "barra" | "fab" | "menu_prioridade";

const alreadySent = new Set<string>();

/**
 * Envia um evento de interface.
 * `once` garante uma só escrita por chave enquanto a página estiver aberta
 * (evita contar a mesma visita várias vezes em re-renders).
 */
export function trackUi(
  event: UiEvent,
  properties: Record<string, unknown> = {},
  opts: { once?: string } = {},
): void {
  if (typeof window === "undefined") return;
  if (opts.once) {
    if (alreadySent.has(opts.once)) return;
    alreadySent.add(opts.once);
  }
  void (async () => {
    try {
      const { data } = await supabase.auth.getSession();
      const userId = data.session?.user?.id;
      if (!userId) return;
      await supabase.from("product_telemetry_events").insert({
        user_id: userId,
        event,
        channel: "painel",
        properties,
        occurred_at: new Date().toISOString(),
      } as never);
    } catch {
      /* telemetria é best-effort */
    }
  })();
}

/** Atalho para os CTAs de conversa do painel Hoje. */
export function trackCtaAfonso(surface: CtaSurface): void {
  trackUi(UI_EVENTS.hojeCtaAfonso, { superficie: surface });
}
