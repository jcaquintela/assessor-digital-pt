import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { Sparkles } from "lucide-react";
import type { FactualInsight } from "@/lib/insights/factual";

/**
 * Análise proativa (plano Pro). Só factos verificáveis, com "de onde vem isto"
 * sempre à mão — mesma regra do Mentor: se não houver caso real, não aparece.
 */
export function ProInsightCard({ insight }: { insight: FactualInsight | null }) {
  const [porque, setPorque] = useState(false);
  if (!insight) return null;
  return (
    <section className="c-card mb-4 p-3.5">
      <div className="c-spot-tag mb-2 flex items-center gap-1.5">
        <Sparkles className="h-4 w-4" /> Análise do teu assessor
      </div>
      <p className="text-[13.5px] leading-relaxed" style={{ color: "var(--ink)" }}>{insight.text}</p>
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <Link to={insight.to} className="text-[13px] font-semibold" style={{ color: "var(--ink-soft)" }}>
          {insight.linkLabel}
        </Link>
        <button
          type="button"
          className="tap-44 text-[12px] font-semibold"
          style={{ color: "var(--muted)" }}
          onClick={() => setPorque((v) => !v)}
        >
          De onde vem isto?
        </button>
      </div>
      {porque ? (
        <p className="mt-2 text-xs" style={{ color: "var(--muted)" }}>{insight.reason}</p>
      ) : null}
    </section>
  );
}