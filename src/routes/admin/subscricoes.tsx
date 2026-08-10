import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getAdminSubscriptions } from "@/lib/admin/subscriptions-list.functions";
import {
  BILLING_SOURCE_LABEL,
  BILLING_STATUS_LABEL,
} from "@/lib/subscription/billing-plans";
import { tierLabel } from "@/lib/subscription/tiers";
import { Badge, Empty, Grid, MetricCard, PageTitle, SectionTitle } from "@/components/admin/ui";
import { StackTable, Td, Tr } from "@/components/admin/stack-table";

export const Route = createFileRoute("/admin/subscricoes")({
  head: () => ({ meta: [{ title: "Subscrições — Afonso admin" }] }),
  component: SubscricoesPage,
});

function statusTone(status: string): "ok" | "warn" | "bad" {
  if (status === "active" || status === "trialing") return "ok";
  if (status === "past_due") return "bad";
  return "warn";
}

const dt = (v: string | null) =>
  v ? new Date(v).toLocaleString("pt-PT", { dateStyle: "short", timeStyle: "short" }) : "—";

function SubscricoesPage() {
  const fn = useServerFn(getAdminSubscriptions);
  const { data, isPending } = useQuery({
    queryKey: ["admin", "subscriptions"],
    queryFn: () => fn({ data: {} }),
    refetchInterval: 60_000,
  });

  if (isPending || !data) return <p className="sub">A carregar…</p>;

  const envText =
    data.environment === "live"
      ? "Pagamentos ligados (produção)"
      : data.environment === "sandbox"
        ? "Pagamentos ligados (modo de teste)"
        : "Pagamentos por ligar";

  return (
    <div className="space-y-5">
      <PageTitle title="Subscrições" sub={`Planos e faturação dos consultores. ${envText}.`} />

      {!data.connected ? (
        <Empty note="Sem ligação aos pagamentos não é possível sincronizar planos automaticamente.">
          A integração de pagamentos não está ligada neste projeto.
        </Empty>
      ) : null}

      <Grid cols={4}>
        <MetricCard label="Subscrições" value={String(data.counts.total)} source="profiles" />
        <MetricCard label="Ativas" value={String(data.counts.active)} source="profiles" />
        <MetricCard label="Sincronizadas" value={String(data.counts.stripe)} source="profiles" />
        <MetricCard label="Geridas à mão" value={String(data.counts.manual)} source="profiles" />
      </Grid>

      <SectionTitle>Lista</SectionTitle>
      {data.rows.length === 0 ? (
        <Empty note="Assim que um consultor concluir um pagamento, a subscrição aparece aqui automaticamente.">
          Ainda não há subscrições registadas.
        </Empty>
      ) : (
        <StackTable headers={["Consultor", "Plano", "Estado", "Origem", "Ambiente", "Atualizado", ""]}>
          {data.rows.map((r) => (
            <Tr key={r.userId}>
              <Td>
                <div className="font-medium">{r.name ?? "Sem nome"}</div>
                <div className="text-xs text-muted-foreground">{r.email ?? "—"}</div>
              </Td>
              <Td>
                {tierLabel(r.tier)}
                {r.priceId ? (
                  <div className="text-xs text-muted-foreground">{r.priceId}</div>
                ) : null}
              </Td>
              <Td>
                <Badge tone={statusTone(r.status)}>
                  {BILLING_STATUS_LABEL[r.status] ?? r.status}
                </Badge>
              </Td>
              <Td>{BILLING_SOURCE_LABEL[r.source] ?? r.source}</Td>
              <Td>{r.environment === "live" ? "Produção" : "Teste"}</Td>
              <Td>{dt(r.updatedAt)}</Td>
              <Td>
                <Link to="/admin/consultor/$id" params={{ id: r.userId }} className="underline">
                  Abrir ficha
                </Link>
              </Td>
            </Tr>
          ))}
        </StackTable>
      )}
    </div>
  );
}
