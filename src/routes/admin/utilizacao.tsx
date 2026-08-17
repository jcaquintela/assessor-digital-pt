import { adminTitle } from "@/lib/brand";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getUsageReport } from "@/lib/admin/usage-report.functions";
import { tierLabel } from "@/lib/subscription/tiers";
import { Badge, Empty, Grid, MetricCard, PageTitle, SectionTitle } from "@/components/admin/ui";
import { StackTable, Td, Tr } from "@/components/admin/stack-table";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/admin/utilizacao")({
  head: () => ({ meta: [{ title: adminTitle("Utilização") }] }),
  component: UtilizacaoPage,
});

const nf = (v: number, d = 0) =>
  v.toLocaleString("pt-PT", { minimumFractionDigits: d, maximumFractionDigits: d });
const eur = (v: number | null | undefined) => (v == null ? "—" : `${nf(v, 2)} €`);

/** Variação face à janela anterior, em texto curto e honesto. */
function delta(cur: number, prev: number): { text: string; tone: "ok" | "bad" | "warn" } {
  if (prev === 0 && cur === 0) return { text: "sem alteração", tone: "warn" };
  if (prev === 0) return { text: "novo neste período", tone: "warn" };
  const pct = ((cur - prev) / prev) * 100;
  const sign = pct > 0 ? "+" : "";
  return {
    text: `${sign}${nf(pct, 0)}% vs. período anterior`,
    tone: Math.abs(pct) < 5 ? "warn" : pct > 0 ? "bad" : "ok",
  };
}

function UtilizacaoPage() {
  const [days, setDays] = useState(30);
  const fn = useServerFn(getUsageReport);
  const { data, isPending } = useQuery({
    queryKey: ["admin", "usage-report", days],
    queryFn: () => fn({ data: { days } }),
  });

  if (isPending || !data) return <p className="sub">A carregar…</p>;

  const cur = data.current;
  const prev = data.previous;
  const dCredits = delta(cur.totals.credits, prev.totals.credits);
  const dCalls = delta(cur.totals.calls, prev.totals.calls);
  const dActive = delta(cur.totals.activeUsers, prev.totals.activeUsers);
  const dWa = delta(cur.whatsapp.messages, prev.whatsapp.messages);

  return (
    <div>
      <PageTitle
        title="Utilização"
        sub="Consumo por plano: quem gasta o quê e se o plano ainda paga o que custa."
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        {[7, 30, 90].map((d) => (
          <Button key={d} size="sm" variant={d === days ? "default" : "outline"} onClick={() => setDays(d)}>
            {d} dias
          </Button>
        ))}
        <span className="sub">comparado com os {days} dias anteriores</span>
      </div>

      <Grid cols={4}>
        <MetricCard
          label="Créditos de IA"
          value={nf(cur.totals.credits, 2)}
          sub={dCredits.text}
          source="assessor_ai_logs · live"
        />
        <MetricCard
          label="Custo de IA"
          value={eur(cur.totals.aiCostEur)}
          tone={cur.totals.aiCostEur == null ? "muted" : "default"}
          sub={
            data.creditPriceEur == null
              ? "define o preço do crédito em Custos"
              : `${nf(cur.totals.calls)} chamadas · ${dCalls.text}`
          }
          source={data.creditPriceEur == null ? "por ligar" : "ai_model_rates · live"}
          stale={cur.totals.aiCostEur == null}
        />
        <MetricCard
          label="Consultores ativos"
          value={`${cur.totals.activeUsers} / ${cur.totals.users}`}
          sub={dActive.text}
          source="profiles · live"
        />
        <MetricCard
          label="WhatsApp"
          value={cur.whatsapp.costEur > 0 ? eur(cur.whatsapp.costEur) : `${cur.whatsapp.messages} msgs`}
          tone={cur.whatsapp.costEur > 0 ? "default" : "muted"}
          sub={`${cur.whatsapp.billable} cobráveis · ${dWa.text}`}
          source="whatsapp_send_logs · live"
          stale={cur.whatsapp.billable > 0 && cur.whatsapp.costEur === 0}
        />
      </Grid>

      <SectionTitle>Consumo por plano</SectionTitle>
      <p className="sub mb-3">
        Plano efetivo (beta ativo conta como Team). Receita = preço do plano × consultores nesse
        plano. Margem exclui WhatsApp, que os registos de envio não conseguem atribuir a um
        consultor.
      </p>
      <StackTable
        headers={[
          "Plano",
          "Consultores",
          "Ativos",
          "Chamadas",
          "Créditos",
          "Créditos / ativo",
          "Custo IA",
          "Receita",
          "Margem",
        ]}
      >
        {cur.plans.map((p) => {
          const before = prev.plans.find((x) => x.tier === p.tier);
          const d = delta(p.credits, before?.credits ?? 0);
          return (
            <Tr key={p.tier}>
              <Td>
                <strong>{tierLabel(p.tier)}</strong>
                <div className="sub">{d.text}</div>
              </Td>
              <Td>{p.users}</Td>
              <Td>{p.activeUsers}</Td>
              <Td>{nf(p.calls)}</Td>
              <Td>{nf(p.credits, 2)}</Td>
              <Td>{nf(p.creditsPerActiveUser, 2)}</Td>
              <Td>{eur(p.costEur)}</Td>
              <Td>{eur(p.revenueEur)}</Td>
              <Td>
                {p.marginEur == null ? (
                  "—"
                ) : (
                  <Badge tone={p.marginEur < 0 ? "bad" : "ok"}>{eur(p.marginEur)}</Badge>
                )}
              </Td>
            </Tr>
          );
        })}
      </StackTable>

      <SectionTitle>Resumo comparativo</SectionTitle>
      <StackTable headers={["Indicador", `Últimos ${days} dias`, `${days} dias anteriores`, "Variação"]}>
        {[
          { k: "Chamadas ao motor", c: cur.totals.calls, p: prev.totals.calls, dec: 0 },
          { k: "Créditos de IA", c: cur.totals.credits, p: prev.totals.credits, dec: 2 },
          { k: "Consultores ativos", c: cur.totals.activeUsers, p: prev.totals.activeUsers, dec: 0 },
          { k: "Mensagens WhatsApp", c: cur.whatsapp.messages, p: prev.whatsapp.messages, dec: 0 },
          { k: "WhatsApp cobráveis", c: cur.whatsapp.billable, p: prev.whatsapp.billable, dec: 0 },
        ].map((r) => {
          const d = delta(r.c, r.p);
          return (
            <Tr key={r.k}>
              <Td>{r.k}</Td>
              <Td>{nf(r.c, r.dec)}</Td>
              <Td>{nf(r.p, r.dec)}</Td>
              <Td>
                <Badge tone={d.tone}>{d.text}</Badge>
              </Td>
            </Tr>
          );
        })}
      </StackTable>

      {data.creditPriceEur == null && (
        <div className="mt-4">
          <Empty note="sem preço do crédito, o consumo fica só em créditos">
            Define o preço de 1 crédito em <Link to="/admin/custos">Custos</Link> para ver euros e
            margem por plano.
          </Empty>
        </div>
      )}

      {cur.whatsapp.unpriced > 0 && (
        <p className="sub mt-3">
          {cur.whatsapp.unpriced} mensagens cobráveis sem tarifa registada — o custo real de WhatsApp
          está subestimado. Preenche as tarifas em <Link to="/admin/custos">Custos</Link>.
        </p>
      )}
    </div>
  );
}
