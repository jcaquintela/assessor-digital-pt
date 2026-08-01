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

const OUTCOME_LABEL: Record<string, string> = {
  sucesso: "executada com sucesso",
  falhou: "falhou — não aconteceu",
  corrigida: "corrigida pelo consultor",
  revertida: "revertida (registo apagado)",
  duplicada: "duplicado",
};

const OUTCOME_TONE: Record<string, "ok" | "warn" | "bad"> = {
  sucesso: "ok",
  falhou: "bad",
  corrigida: "warn",
  revertida: "bad",
  duplicada: "warn",
};

function fmt(dt: string) {
  return new Intl.DateTimeFormat("pt-PT", { dateStyle: "short", timeStyle: "short" }).format(new Date(dt));
}

function AutonomasPage() {
  const fn = useServerFn(listAutonomousActions);
  const { data, isLoading } = useQuery({ queryKey: ["admin", "autonomas"], queryFn: () => fn() });

  const items = data?.items ?? [];
  const c = data?.counters;

  return (
    <div>
      <PageTitle
        title="Ações autónomas"
        sub="Escritas que o Assessor fez sem pedir confirmação. Consultas não contam — e uma escrita que falhou não aconteceu."
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
          <div className="mb-3 grid grid-cols-2 gap-2 md:grid-cols-5">
            {[
              ["Executadas com sucesso", c?.sucesso ?? 0, "ok"],
              ["Falharam", c?.falhou ?? 0, "bad"],
              ["Foram corrigidas", c?.corrigida ?? 0, "warn"],
              ["Foram revertidas", c?.revertida ?? 0, "bad"],
              ["Criaram duplicados", c?.duplicada ?? 0, "warn"],
            ].map(([label, value, tone]) => (
              <div key={label as string} className="admin-card p-3">
                <div className="mini" style={{ color: "var(--muted)" }}>{label as string}</div>
                <div className="mono" style={{ fontSize: 20 }}>{String(value)}</div>
                {Number(value) > 0 && tone !== "ok" ? (
                  <Badge tone={tone as any}>a rever</Badge>
                ) : null}
              </div>
            ))}
          </div>
          <p className="mini mb-3" style={{ color: "var(--muted)" }}>
            {data?.total} escritas autónomas nos últimos 14 dias. Mais {data?.readOnlyTurns} turnos foram
            só consulta (procurar agenda, listar leads) — leitura não é ação autónoma e não entra nestes números.
          </p>
          <div className="overflow-x-auto">
            <table>
              <thead>
                <tr>
                  <th>Quando</th>
                  <th>Consultor</th>
                  <th>Autonomia</th>
                  <th>Pedido</th>
                  <th>Escrita executada</th>
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
                      {a.writeTools.join(", ") || "—"}
                      {a.readTools.length ? (
                        <div style={{ color: "var(--muted)" }}>leitura: {a.readTools.join(", ")}</div>
                      ) : null}
                      {a.error ? <div style={{ color: "var(--coral)" }}>{a.error}</div> : null}
                    </td>
                    <td>
                      <Badge tone={OUTCOME_TONE[a.outcome]}>{OUTCOME_LABEL[a.outcome]}</Badge>
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
