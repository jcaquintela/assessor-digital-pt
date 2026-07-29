import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getAfonsoAcquisition } from "@/lib/admin/afonso.functions";
import { Grid, MetricCard, PageTitle } from "@/components/admin/ui";

export const Route = createFileRoute("/admin/aquisicao")({
  head: () => ({ meta: [{ title: "Aquisição — Afonso admin" }] }),
  component: AquisicaoPage,
});

function AquisicaoPage() {
  const fn = useServerFn(getAfonsoAcquisition);
  const { data, isPending } = useQuery({ queryKey: ["admin", "afonso", "acquisition"], queryFn: () => fn() });
  if (isPending || !data) return <p className="sub">A carregar…</p>;

  return (
    <div>
      <PageTitle title="Aquisição" sub="Do primeiro clique na landing page até ao primeiro pagamento." />
      <Grid cols={4}>
        <MetricCard label="Visitas à landing" value="—" tone="muted" sub="analytics não ligado" source="por ligar" stale />
        <MetricCard label="Início Telegram" value={data.telegramStarts} sub="contas Nível 0 criadas" source="channel_links · live" />
        <MetricCard label="Pediu upgrade" value={data.upgradeRequests} sub="tentativas de WhatsApp sem convite" source="LIGAR- rejeitados · live" />
        <MetricCard label="Converteu" value={data.converted} sub="base → pago" source="subscription_tier · live" />
      </Grid>
    </div>
  );
}
