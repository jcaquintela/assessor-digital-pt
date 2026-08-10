import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getAfonsoBusiness } from "@/lib/admin/afonso.functions";
import { getPaymentsStatus } from "@/lib/admin/payments-status.functions";
import { mrrCardText, paymentsStatusLabel } from "@/lib/admin/payments-status";
import { Badge, Empty, Grid, MetricCard, PageTitle, SectionTitle } from "@/components/admin/ui";
import { tierLabel } from "@/lib/subscription/tiers";

export const Route = createFileRoute("/admin/negocio")({
  head: () => ({ meta: [{ title: "Negócio — Afonso admin" }] }),
  component: NegocioPage,
});

const ORIGIN: Record<string, string> = {
  base: "Telegram, auto-registo",
  consultor: "convite direto",
  pro: "convite direto",
  hub: "beta, super_admin",
};

function NegocioPage() {
  const fn = useServerFn(getAfonsoBusiness);
  const { data, isPending } = useQuery({ queryKey: ["admin", "afonso", "business"], queryFn: () => fn() });
  const paymentsFn = useServerFn(getPaymentsStatus);
  const payments = useQuery({
    queryKey: ["admin", "payments", "status"],
    queryFn: () => paymentsFn(),
    refetchInterval: 60_000,
  });
  if (isPending || !data) return <p className="sub">A carregar…</p>;

  const tiers = Object.entries(data.byTier).sort((a, b) => b[1] - a[1]);
  const mrr = payments.data ? mrrCardText(payments.data) : { value: "—", sub: "a ler…", stale: true };

  return (
    <div>
      <PageTitle
        title="Negócio"
        sub={`O Afonso como produto — não os negócios dos consultores que o usam.${
          payments.data ? ` ${paymentsStatusLabel(payments.data)}.` : ""
        }`}
      />

      <Grid cols={4}>
        <MetricCard
          label="MRR"
          value={mrr.value}
          tone={mrr.stale ? "muted" : "default"}
          sub={mrr.sub}
          source="pagamentos · live"
          stale={mrr.stale}
        />
        <MetricCard
          label="Subscritores pagos"
          value={data.paidSubscribers}
          sub={`${payments.data?.activeCount ?? 0} com pagamento ativo`}
          source="subscription_tier · live"
        />
        <MetricCard label="Contas Nível 0" value={data.baseAccounts} sub="Telegram, grátis" source="profiles · live" />
        <MetricCard label="Beta testers" value={data.betaTesters} sub="acesso total, sem pagar" source="is_beta_tester · live" />
      </Grid>

      <SectionTitle>Distribuição por plano</SectionTitle>
      <table>
        <thead><tr><th>Plano</th><th>Contas</th><th>Origem</th></tr></thead>
        <tbody>
          {tiers.map(([tier, count]) => (
            <tr key={tier}>
              <td><Badge tone={tier === "base" ? "warn" : "ok"}>{tierLabel(tier)}</Badge></td>
              <td className="mini">{count}</td>
              <td className="mini">{ORIGIN[tier] ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <SectionTitle>Funil base → pago</SectionTitle>
      <Empty note="quando o Telegram estiver em produção, mostra: contas Nível 0 → % que pede upgrade → % que converte">
        Sem dados suficientes ainda — precisa de tráfego real no Nível 0 para ter sentido.
      </Empty>
    </div>
  );
}
