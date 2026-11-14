import { adminTitle } from "@/lib/brand";
import { createFileRoute } from "@tanstack/react-router";
import { PageTitle, SectionTitle, Badge, Source } from "@/components/admin/ui";
import { AFONSO_V2_DECISIONS, type DecisionStatus } from "@/lib/v2/decisions";
import { AFONSO_V2_GATES, GATE_AUTHORIZATIONS, evaluateAllGates, type CriterionStatus } from "@/lib/v2/gates";

export const Route = createFileRoute("/admin/v2")({
  head: () => ({ meta: [{ title: adminTitle("AFONSO 2.0 — decisões e gates") }] }),
  component: V2Page,
});

const CRIT: Record<CriterionStatus, { tone: "ok" | "warn" | "bad"; label: string }> = {
  met: { tone: "ok", label: "cumprido" },
  unverified: { tone: "warn", label: "não verificado" },
  not_met: { tone: "bad", label: "em falta" },
};

const DEC: Record<DecisionStatus, { tone: "ok" | "warn" | "bad"; label: string }> = {
  existe: { tone: "ok", label: "existe" },
  dev: { tone: "ok", label: "dev (desligado)" },
  parcial: { tone: "warn", label: "parcial" },
  plano: { tone: "warn", label: "plano" },
  conflito_v1: { tone: "warn", label: "conflito V1" },
  bloqueado: { tone: "bad", label: "bloqueado" },
};

function V2Page() {
  const decisions = evaluateAllGates(AFONSO_V2_GATES, GATE_AUTHORIZATIONS);
  return (
    <div>
      <PageTitle
        title="AFONSO 2.0 — decisões e gates"
        sub="Só leitura. Nenhum gate avança sozinho: GO exige todos os critérios, o gate anterior em GO e autorização expressa."
      />
      <SectionTitle first>Gates</SectionTitle>
      <div className="grid gap-3">
        {AFONSO_V2_GATES.map((g, i) => (
          <div key={g.id} className="rounded-xl border p-4" style={{ borderColor: "var(--line)", background: "var(--card)" }}>
            <div className="flex items-center justify-between gap-3">
              <div className="font-medium">{g.title}</div>
              <Badge tone={decisions[i].decision === "GO" ? "ok" : "bad"}>{decisions[i].decision}</Badge>
            </div>
            <ul className="mt-3 grid gap-1.5 text-sm">
              {g.criteria.map((c) => (
                <li key={c.id} className="flex flex-wrap items-baseline gap-2">
                  <Badge tone={CRIT[c.status].tone}>{CRIT[c.status].label}</Badge>
                  <span>{c.label}</span>
                  <span className="text-xs" style={{ color: "var(--ink-soft)" }}>— {c.evidence}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <Source>src/lib/v2/gates.ts · autorizações registadas: {GATE_AUTHORIZATIONS.length}</Source>

      <SectionTitle>As 50 decisões</SectionTitle>
      <div className="overflow-x-auto rounded-xl border" style={{ borderColor: "var(--line)" }}>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left" style={{ color: "var(--ink-soft)" }}>
              <th className="p-2">#</th><th className="p-2">Decisão</th><th className="p-2">Estado</th><th className="p-2">Nota</th>
            </tr>
          </thead>
          <tbody>
            {AFONSO_V2_DECISIONS.map((d) => (
              <tr key={d.id} className="border-t" style={{ borderColor: "var(--line)" }}>
                <td className="p-2 align-top">{d.id}</td>
                <td className="p-2 align-top">{d.title}</td>
                <td className="p-2 align-top"><Badge tone={DEC[d.status].tone}>{DEC[d.status].label}</Badge></td>
                <td className="p-2 align-top" style={{ color: "var(--ink-soft)" }}>{d.note}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Source>src/lib/v2/decisions.ts</Source>
    </div>
  );
}
