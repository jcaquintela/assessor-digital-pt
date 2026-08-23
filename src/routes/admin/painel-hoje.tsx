import { adminTitle } from "@/lib/brand";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getHojeUsage } from "@/lib/admin/hoje-usage.functions";
import { surfaceLabel } from "@/lib/admin/hoje-usage-labels";
import { Empty, Grid, MetricCard, PageTitle, SectionTitle } from "@/components/admin/ui";
import { StackTable, Td, Tr } from "@/components/admin/stack-table";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/admin/painel-hoje")({
  head: () => ({ meta: [{ title: adminTitle("Painel Hoje") }] }),
  component: PainelHojePage,
});

const nf = (v: number, d = 0) =>
  v.toLocaleString("pt-PT", { minimumFractionDigits: d, maximumFractionDigits: d });

function PainelHojePage() {
  const [days, setDays] = useState(30);
  const fn = useServerFn(getHojeUsage);
  const { data, isPending } = useQuery({
    queryKey: ["admin", "hoje-usage", days],
    queryFn: () => fn({ data: { days } }),
  });

  if (isPending || !data) return <p className="sub">A carregar…</p>;

  return (
    <div>
      <PageTitle
        title="Painel Hoje"
        sub="Quantas vezes o painel é aberto e onde os consultores clicam para falar com o Afonso."
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        {[7, 30, 90].map((d) => (
          <Button key={d} size="sm" variant={d === days ? "default" : "outline"} onClick={() => setDays(d)}>
            {d} dias
          </Button>
        ))}
      </div>

      <Grid cols={4}>
        <MetricCard label="Aberturas do painel" value={nf(data.views)} sub={`${data.viewers} consultores`} source="product_telemetry_events · live" />
        <MetricCard label="Cliques em falar com o Afonso" value={nf(data.clicks)} sub={`${data.clickers} consultores`} source="product_telemetry_events · live" />
        <MetricCard
          label="Cliques por 100 aberturas"
          value={data.clickRate == null ? "—" : nf(data.clickRate, 1)}
          tone={data.clickRate == null ? "muted" : "default"}
          sub="procura real de conversa a partir do painel"
          source="product_telemetry_events · live"
          stale={data.clickRate == null}
        />
        <MetricCard
          label="Consultores que clicaram"
          value={data.viewers === 0 ? "—" : `${data.clickers} / ${data.viewers}`}
          sub="de quem abriu o painel"
          source="product_telemetry_events · live"
          tone={data.viewers === 0 ? "muted" : "default"}
        />
      </Grid>

      <SectionTitle>Por superfície do botão</SectionTitle>
      {data.bySurface.length === 0 ? (
        <Empty note="sem cliques registados nesta janela">
          Assim que os consultores usarem os botões de conversa no painel Hoje, aparecem aqui.
        </Empty>
      ) : (
        <StackTable headers={["Superfície", "Cliques", "Consultores", "% dos cliques"]}>
          {data.bySurface.map((s) => (
            <Tr key={s.surface}>
              <Td><strong>{surfaceLabel(s.surface)}</strong></Td>
              <Td>{nf(s.clicks)}</Td>
              <Td>{s.users}</Td>
              <Td>{data.clicks > 0 ? `${nf((s.clicks / data.clicks) * 100, 0)}%` : "—"}</Td>
            </Tr>
          ))}
        </StackTable>
      )}

      <SectionTitle>Dia a dia</SectionTitle>
      {data.daily.length === 0 ? (
        <Empty note="sem dados nesta janela">Ainda não há aberturas registadas.</Empty>
      ) : (
        <StackTable headers={["Dia", "Aberturas", "Cliques"]}>
          {data.daily.slice(-30).reverse().map((d) => (
            <Tr key={d.day}>
              <Td>{new Intl.DateTimeFormat("pt-PT", { day: "2-digit", month: "short" }).format(new Date(`${d.day}T12:00:00Z`))}</Td>
              <Td>{nf(d.views)}</Td>
              <Td>{nf(d.clicks)}</Td>
            </Tr>
          ))}
        </StackTable>
      )}
    </div>
  );
}
