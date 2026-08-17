import { adminTitle } from "@/lib/brand";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getAfonsoBusiness } from "@/lib/admin/afonso.functions";
import { getIntegrationsOverview } from "@/lib/admin.functions";
import { getPaymentsStatus } from "@/lib/admin/payments-status.functions";
import { mrrCardText } from "@/lib/admin/payments-status";
import { useSystemHealth } from "@/components/admin/health-strip";
import { Badge, Grid, MetricCard, PageTitle, SectionTitle } from "@/components/admin/ui";
import { fmtPct } from "@/lib/admin/metrics-format";

export const Route = createFileRoute("/admin/")({
  head: () => ({ meta: [{ title: adminTitle("Visão geral") }] }),
  component: OverviewPage,
});

function OverviewPage() {
  const fn = useServerFn(getAfonsoBusiness);
  const { data, isPending } = useQuery({ queryKey: ["admin", "afonso", "business"], queryFn: () => fn() });
  const health = useSystemHealth();
  // Mesma fonte que Integrações & flags — nada de listas estáticas aqui.
  const integrationsFn = useServerFn(getIntegrationsOverview);
  const integrations = useQuery({
    queryKey: ["admin", "integrations", "overview"],
    queryFn: () => integrationsFn(),
  });
  const paymentsFn = useServerFn(getPaymentsStatus);
  const payments = useQuery({
    queryKey: ["admin", "payments", "status"],
    queryFn: () => paymentsFn(),
    refetchInterval: 60_000,
  });
  const mrr = payments.data
    ? mrrCardText(payments.data)
    : { value: "—", sub: "a ler…", stale: true };

  if (isPending || !data) return <p className="sub">A carregar…</p>;

  // Evita duplicar o que a faixa de saúde já mostra (WhatsApp, Telegram, …).
  const healthLabels = new Set(
    (health.data?.items ?? []).map((i) => i.label.toLowerCase()),
  );

  const b = data.usersBreakdown;
  const ts = data.taskSuccess;

  return (
    <div>
      <PageTitle
        title="Visão geral"
        sub="Um número por cartão, uma fonte por número. Nenhum cartão aqui é decorativo."
      />

      <SectionTitle first>Negócio</SectionTitle>
      <Grid cols={4}>
        <MetricCard
          label="MRR"
          value={mrr.value}
          tone={mrr.stale ? "muted" : "default"}
          sub={mrr.sub}
          source="pagamentos · live"
          stale={mrr.stale}
        />
        <MetricCard label="Subscritores pagos" value={data.paidSubscribers} sub="pré-lançamento" source="subscription_tier · live" />
        <MetricCard
          label="Utilizadores ativos"
          value={data.totalUsers}
          sub={`${b.real} reais · ${b.ci} CI teste · ${b.shadow} shadow`}
          source="profiles · live"
        />
        <MetricCard label="Contas Nível 0" value={data.baseAccounts} sub="Telegram, grátis" source="profiles · live" />
      </Grid>

      <SectionTitle>Produto</SectionTitle>
      <Grid cols={4}>
        <MetricCard label="Mensagens 24h" value={data.messages24h} sub="WhatsApp, webhook ativo" source="assessor_messages · live" />
        <MetricCard
          label="Tarefas executadas"
          value={fmtPct(ts)}
          tone={ts == null ? "muted" : ts >= 0.95 ? "default" : "coral"}
          sub={`meta ≥ 95% · ${data.taskSuccessSamples} turnos / 14d`}
          source="assistant_trust_scores · agregado"
          stale={ts == null}
        />
        <MetricCard label="Erros por tratar" value={data.inboxErrors} sub="miscellaneous_items · por tratar" source="miscellaneous_items · live" />
        <MetricCard label="Beta testers" value={data.betaTesters} sub="acesso total, sem pagar" source="is_beta_tester · live" />
      </Grid>

      <SectionTitle>Estado das integrações</SectionTitle>
      <table>
        <thead>
          <tr><th>Canal</th><th>Estado</th><th>Última atividade</th></tr>
        </thead>
        <tbody>
          {(health.data?.items ?? []).map((i) => (
            <tr key={i.key}>
              <td>{i.label}</td>
              <td>
                <Badge tone={i.level}>
                  {i.level === "ok" ? "Ativo" : i.level === "warn" ? "Parcial" : "Crítico"}
                </Badge>
              </td>
              <td className="mini">{i.detail || "—"}</td>
            </tr>
          ))}
          {(integrations.data ?? [])
            .filter((i) => !healthLabels.has(i.name.toLowerCase()))
            .map((i) => (
              <tr key={i.name}>
                <td>{i.name}</td>
                <td>
                  <Badge tone={i.status === "active" ? "ok" : "bad"}>
                    {i.status === "active" ? "Ativo" : "Planeado"}
                  </Badge>
                </td>
                <td className="mini">{i.detail || "—"}</td>
              </tr>
            ))}
        </tbody>
      </table>
    </div>
  );
}
