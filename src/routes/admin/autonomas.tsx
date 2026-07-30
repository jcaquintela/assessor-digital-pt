import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { PageTitle, SectionTitle, Empty, Badge, Source } from "@/components/admin/ui";
import { listAutonomousActions } from "@/lib/admin/autonomas.functions";

export const Route = createFileRoute("/admin/autonomas")({
  head: () => ({ meta: [{ title: "Ações autónomas — Afonso admin" }] }),
  component: AutonomasPage,
});

const AUTONOMY_LABEL: Record<string, string> = {
  conservador: "Conservador",
  equilibrado: "Equilibrado",
  proativo: "Proativo",
  balanced: "Equilibrado",
};

function fmt(dt: string) {
  return new Intl.DateTimeFormat("pt-PT", { dateStyle: "short", timeStyle: "short" }).format(new Date(dt));
}

function AutonomasPage() {
  const fn = useServerFn(listAutonomousActions);
  const { data, isLoading } = useQuery({ queryKey: ["admin", "autonomas"], queryFn: () => fn() });

  const items = data?.items ?? [];
  const correctedPct = data?.total ? Math.round((data.corrected / data.total) * 100) : 0;

  return (
    <div>
      <PageTitle
        title="Ações autónomas"
        sub="O que o Assessor executou sem pedir confirmação, por consultor. Contrapeso à autonomia: nada corre sozinho sem ficar visível aqui."
      />

      <SectionTitle first>Últimos 14 dias</SectionTitle>
      {isLoading ? (
        <Empty>A carregar…</Empty>
      ) : items.length === 0 ? (
        <Empty note="Só aparecem turnos em que o motor executou ferramentas na mesma mensagem, sem passo de confirmação.">
          Nenhuma ação autónoma registada.
        </Empty>
      ) : (
        <>
          <div className="mb-3 flex flex-wrap items-center gap-4 text-[12.5px]">
            <span><strong>{data?.total}</strong> ações autónomas</span>
            <span><strong>{data?.corrected}</strong> corrigidas a seguir ({correctedPct}%)</span>
            <Badge tone={correctedPct < 10 ? "ok" : correctedPct < 25 ? "warn" : "bad"}>
              {correctedPct < 10 ? "autonomia saudável" : correctedPct < 25 ? "a vigiar" : "demasiadas correções"}
            </Badge>
          </div>
          <div className="overflow-x-auto">
            <table>
              <thead>
                <tr>
                  <th>Quando</th>
                  <th>Consultor</th>
                  <th>Autonomia</th>
                  <th>Pedido</th>
                  <th>Ação executada</th>
                  <th>Resultado</th>
                </tr>
              </thead>
              <tbody>
                {items.map((a) => (
                  <tr key={a.traceId}>
                    <td className="mini whitespace-nowrap">{fmt(a.createdAt)}</td>
                    <td>
                      {a.consultant}
                      <div className="mini" style={{ color: "var(--muted)" }}>{a.channel}</div>
                    </td>
                    <td className="mini">{AUTONOMY_LABEL[a.autonomyLevel] ?? a.autonomyLevel}</td>
                    <td className="mini" style={{ maxWidth: 260 }}>{a.request}</td>
                    <td className="mono mini">
                      {a.tools.join(", ") || "—"}
                      {a.error ? <div style={{ color: "var(--coral)" }}>{a.error}</div> : null}
                    </td>
                    <td>
                      <Badge tone={a.outcome === "mantida" ? (a.ok ? "ok" : "warn") : "bad"}>
                        {a.outcome === "mantida" ? (a.ok ? "mantida" : "mantida (com erro)") : "corrigida"}
                      </Badge>
                      {a.correctionMessage ? (
                        <div className="mini" style={{ color: "var(--muted)" }}>
                          {a.correctionCategory}: {a.correctionMessage}
                        </div>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Source>assessor_reasoning_traces × assistant_user_corrections × consultant_preferences</Source>
        </>
      )}
      <p className="mini mt-3" style={{ color: "var(--muted)" }}>
        O nível de autonomia mostrado é o que o consultor tem <em>hoje</em> — o histórico por turno ainda não é gravado.
      </p>
    </div>
  );
}
