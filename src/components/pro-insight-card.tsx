import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { Sparkles } from "lucide-react";
import type { FactualInsight } from "@/lib/insights/factual";

const dataCurta = (iso?: string | null) => {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? null
    : d.toLocaleDateString("pt-PT", { day: "2-digit", month: "short", year: "numeric" });
};
const dataHora = (iso?: string | null) => {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? null
    : d.toLocaleString("pt-PT", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
};

/**
 * Análise proativa (plano Pro). Só factos verificáveis, com "de onde vem isto"
 * sempre à mão — mesma regra do Mentor: se não houver caso real, não aparece.
 */
export function ProInsightCard({
  insight,
  emptyHint,
}: {
  insight: FactualInsight | null;
  /** Texto a mostrar quando (sendo Pro) ainda não há dados suficientes para analisar. */
  emptyHint?: string;
}) {
  const [porque, setPorque] = useState(false);
  if (!insight) {
    if (!emptyHint) return null;
    return (
      <section className="c-card mb-4 p-3.5">
        <div className="c-spot-tag mb-2 flex items-center gap-1.5">
          <Sparkles className="h-4 w-4" /> Análise do teu assessor
        </div>
        <p className="text-[13px] leading-relaxed" style={{ color: "var(--muted)" }}>{emptyHint}</p>
      </section>
    );
  }
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
          {porque ? "Esconder as contas" : "Ver as contas"}
        </button>
      </div>
      {porque ? (
        <div className="mt-2 rounded-lg border border-dashed p-3 text-xs" style={{ borderColor: "var(--line)", color: "var(--muted)" }}>
          <p className="mb-2">{insight.reason}</p>
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
            <dt>Registos considerados</dt>
            <dd className="font-semibold" style={{ color: "var(--ink-soft)" }}>{insight.facts.total}</dd>
            <dt>Limiar usado</dt>
            <dd className="font-semibold" style={{ color: "var(--ink-soft)" }}>
              sem movimento há {insight.facts.minDias} dias ou mais
            </dd>
            <dt>Acima do limiar</dt>
            <dd className="font-semibold" style={{ color: "var(--ink-soft)" }}>{insight.facts.parados}</dd>
            <dt>Mais parado</dt>
            <dd className="font-semibold" style={{ color: "var(--ink-soft)" }}>{insight.facts.dias} dias</dd>
          </dl>
          {insight.facts.top.length > 0 ? (
            <>
              <p className="mt-3 mb-1 font-semibold" style={{ color: "var(--ink-soft)" }}>
                Exactamente o que foi usado
              </p>
              <ul className="space-y-1">
                {insight.facts.top.map((i) => (
                  <li key={i.id} className="flex flex-wrap items-baseline justify-between gap-x-2">
                    <span className="truncate" style={{ color: "var(--ink-soft)" }}>{i.label}</span>
                    <span>
                      {i.days} dias
                      {dataCurta(i.since) ? ` · último movimento em ${dataCurta(i.since)}` : ""}
                    </span>
                  </li>
                ))}
              </ul>
              {insight.facts.parados > insight.facts.top.length ? (
                <p className="mt-1">
                  e mais {insight.facts.parados - insight.facts.top.length} no mesmo caso.
                </p>
              ) : null}
            </>
          ) : null}
          {dataHora(insight.facts.apuradoEm) ? (
            <p className="mt-3">Contas feitas em {dataHora(insight.facts.apuradoEm)}.</p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}