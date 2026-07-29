import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getAfonsoCosts } from "@/lib/admin/afonso.functions";
import { Empty, Grid, MetricCard, PageTitle, SectionTitle } from "@/components/admin/ui";

export const Route = createFileRoute("/admin/custos")({
  head: () => ({ meta: [{ title: "Custos — Afonso admin" }] }),
  component: CustosPage,
});

function CustosPage() {
  const fn = useServerFn(getAfonsoCosts);
  const { data, isPending } = useQuery({ queryKey: ["admin", "afonso", "costs"], queryFn: () => fn() });
  if (isPending || !data) return <p className="sub">A carregar…</p>;

  const mb = (data.storageBytes / 1024 / 1024).toFixed(1);

  return (
    <div>
      <PageTitle title="Custos" sub="O que custa operar o Afonso, hoje — sem isto não há margem real, só receita." />

      <Grid cols={3}>
        <MetricCard
          label="IA (modelo)"
          value={data.aiCost == null ? "—" : `$${data.aiCost.toFixed(2)}`}
          tone={data.aiCost == null ? "muted" : "default"}
          sub={
            data.aiCost == null
              ? "custo por 1M tokens não confirmado"
              : `${data.aiCalls24h} chamadas · ${data.aiTokens24h} tokens / 24h`
          }
          source={data.aiCost == null ? "por ligar" : "assessor_ai_logs · live"}
          stale={data.aiCost == null}
        />
        <MetricCard
          label="Supabase"
          value="Free"
          sub={`ainda dentro do plano gratuito · ${mb} MB em ficheiros`}
          source="uploaded_files · live"
        />
        <MetricCard
          label="WhatsApp (BSP)"
          value="—"
          tone="muted"
          sub={`${data.whatsappMessages24h} msgs/24h · sem contrato BSP confirmado`}
          source="por confirmar"
          stale
        />
      </Grid>

      <SectionTitle>Custo por utilizador ativo</SectionTitle>
      <Empty note="objetivo: custo total ÷ utilizadores ativos, por plano — decide se o Nível 0 grátis é sustentável">
        Não calculável até os 3 custos acima estarem ligados a dados reais.
      </Empty>
    </div>
  );
}
