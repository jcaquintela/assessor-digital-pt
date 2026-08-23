// Cartão de nível 2 no painel Hoje: aparece só quando não há nada urgente.
// Sem cor de alerta, sem contagem regressiva — é um convite, não uma dívida.
import { Link } from "@tanstack/react-router";
import { useEffect } from "react";
import { ArrowRight, Lightbulb } from "lucide-react";
import { UI_EVENTS, trackUi } from "@/lib/telemetry/ui-events";
import type { NbaSuggestion } from "@/lib/assessor/supreme/next-best-action";

export function NextBestActionCard({
  suggestion,
  assessorName,
}: {
  suggestion: NbaSuggestion;
  assessorName: string;
}) {
  useEffect(() => {
    trackUi(
      UI_EVENTS.hojeNbaVisto,
      { chave: suggestion.key, tipo: suggestion.kind, variante: suggestion.variant },
      { once: `nba-visto-${suggestion.key}` },
    );
  }, [suggestion.key, suggestion.kind, suggestion.variant]);

  return (
    <article className="c-empty compacta text-left">
      <p className="flex items-start gap-2 text-[13.5px] leading-relaxed">
        <Lightbulb className="mt-0.5 h-4 w-4 shrink-0" style={{ color: "var(--gold, #b8892b)" }} />
        <span>{suggestion.text}</span>
      </p>
      <p className="c-muted mt-1.5 pl-6 text-[12.5px]">{suggestion.action}</p>
      <div className="mt-2 pl-6">
        <Link
          to={suggestion.to}
          className="c-act-quiet"
          onClick={() =>
            trackUi(UI_EVENTS.hojeNbaClicado, { chave: suggestion.key, tipo: suggestion.kind })
          }
        >
          Tratar disto <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>
      <p className="c-muted mt-2 pl-6 text-[11.5px]">
        Não é urgente — o {assessorName} avisa-te se passar a ser.
      </p>
    </article>
  );
}
