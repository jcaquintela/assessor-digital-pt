import { adminTitle } from "@/lib/brand";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getRotasUsage } from "@/lib/admin/rotas-usage.functions";
import { Empty, Grid, MetricCard, PageTitle, SectionTitle } from "@/components/admin/ui";
import { StackTable, Td, Tr } from "@/components/admin/stack-table";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/admin/rotas")({
  head: () => ({ meta: [{ title: adminTitle("Rotas & beta v2") }] }),
  component: RotasPage,
});

const nf = (v: number, d = 0) =>
  v.toLocaleString("pt-PT", { minimumFractionDigits: d, maximumFractionDigits: d });

function RotasPage() {
  const [days, setDays] = useState(30);
  const fn = useServerFn(getRotasUsage);
  const { data, isPending } = useQuery({
    queryKey: ["admin", "rotas-usage", days],
    queryFn: () => fn({ data: { days } }),
  });

  if (isPending || !data) return <p className="sub">A carregar…</p>;

  const { v1, v2 } = data.totals;

  return (
    <div>
      <PageTitle
        title="Rotas & beta v2"
        sub="Visitas por área e comparação de utilização entre o desenho actual (v1) e o redesenho v2."
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        {[7, 30, 90].map((d) => (
          <Button key={d} size="sm" variant={d === days ? "default" : "outline"} onClick={() => setDays(d)}>
            {d} dias
          </Button>
        ))}
        {data.globalFlag ? (
          <span className="mini" style={{ color: "var(--muted)" }}>
            flag global activa — todos contam como v2
          </span>
        ) : null}
      </div>

      <SectionTitle first>Comparação v1 vs v2</SectionTitle>
      <Grid cols={4}>
        <MetricCard
          label="Visitas · v1"
          value={nf(v1.visits)}
          sub={`${v1.users} consultores`}
          source="product_telemetry_events · nav_rota"
          tone={v1.visits === 0 ? "muted" : "default"}
        />
        <MetricCard
          label="Visitas · v2"
          value={nf(v2.visits)}
          sub={`${v2.users} consultores`}
          source="product_telemetry_events · nav_rota"
          tone={v2.visits === 0 ? "muted" : "default"}
        />
        <MetricCard
          label="Cliques/100 aberturas · v1"
          value={v1.clickRate == null ? "—" : nf(v1.clickRate, 1)}
          sub={`${nf(v1.ctaClicks)} cliques · ${nf(v1.hojeViews)} aberturas`}
          source="product_telemetry_events · live"
          stale={v1.clickRate == null}
          tone={v1.clickRate == null ? "muted" : "default"}
        />
        <MetricCard
          label="Cliques/100 aberturas · v2"
          value={v2.clickRate == null ? "—" : nf(v2.clickRate, 1)}
          sub={`${nf(v2.ctaClicks)} cliques · ${nf(v2.hojeViews)} aberturas`}
          source="product_telemetry_events · live"
          stale={v2.clickRate == null}
          tone={v2.clickRate == null ? "muted" : "default"}
        />
      </Grid>

      <SectionTitle>Visitas por rota</SectionTitle>
      {data.routes.length === 0 ? (
        <Empty note="sem visitas registadas nesta janela">
          Assim que os consultores navegarem pelas áreas do painel, aparecem aqui.
        </Empty>
      ) : (
        <StackTable
          headers={["Rota", "Visitas v1", "Consultores v1", "Visitas v2", "Consultores v2", "Total"]}
        >
          {data.routes.map((r) => (
            <Tr key={r.rota}>
              <Td><strong>{r.rota}</strong></Td>
              <Td>{nf(r.v1.visits)}</Td>
              <Td>{r.v1.users}</Td>
              <Td>{nf(r.v2.visits)}</Td>
              <Td>{r.v2.users}</Td>
              <Td>{nf(r.v1.visits + r.v2.visits)}</Td>
            </Tr>
          ))}
        </StackTable>
      )}
    </div>
  );
}
