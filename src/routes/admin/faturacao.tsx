import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  getAdminBilling,
  refundInvoice,
  resendInvoice,
  retryInvoicePayment,
} from "@/lib/admin/payments-status.functions";
import { eur, paymentsStatusLabel } from "@/lib/admin/payments-status";
import { Badge, Empty, Grid, MetricCard, PageTitle, SectionTitle } from "@/components/admin/ui";
import { StackTable, Td, Tr } from "@/components/admin/stack-table";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/admin/faturacao")({
  head: () => ({ meta: [{ title: "Faturação — Afonso admin" }] }),
  component: FaturacaoPage,
});

const dt = (v: string | null) =>
  v ? new Date(v).toLocaleString("pt-PT", { dateStyle: "short", timeStyle: "short" }) : "—";

function FaturacaoPage() {
  const qc = useQueryClient();
  const fn = useServerFn(getAdminBilling);
  const refund = useServerFn(refundInvoice);
  const resend = useServerFn(resendInvoice);
  const retry = useServerFn(retryInvoicePayment);

  const { data, isPending } = useQuery({
    queryKey: ["admin", "billing", "invoices"],
    queryFn: () => fn(),
    refetchInterval: 60_000,
  });

  if (isPending || !data) return <p className="sub">A carregar…</p>;

  const s = data.status;
  const after = (r: { ok: boolean; message: string }) => {
    if (r.ok) toast.success("Feito.");
    else toast.error(r.message);
    qc.invalidateQueries({ queryKey: ["admin", "billing"] });
    qc.invalidateQueries({ queryKey: ["admin", "payments", "status"] });
  };

  return (
    <div className="space-y-5">
      <PageTitle title="Faturação" sub={paymentsStatusLabel(s)} />

      {!s.connected ? (
        <Empty note="Sem ligação aos pagamentos não há faturas para gerir.">
          {s.error
            ? `Pagamentos não ligados — ${s.error}`
            : "Pagamentos não ligados neste projeto."}
        </Empty>
      ) : (
        <>
          <Grid cols={4}>
            <MetricCard
              label="Faturas"
              value={String(data.invoices.length)}
              sub="últimas 50"
              source="pagamentos · live"
            />
            <MetricCard
              label="Pagas"
              value={String(data.invoices.filter((i) => i.status === "paid").length)}
              sub="cobrança concluída"
              source="pagamentos · live"
            />
            <MetricCard
              label="Por pagar"
              value={String(data.invoices.filter((i) => i.status === "open").length)}
              sub="em aberto ou falhadas"
              source="pagamentos · live"
            />
            <MetricCard
              label="Subscrições"
              value={String(s.subscriptionsCount)}
              sub={`${s.activeCount} ativa(s)`}
              source="profiles · live"
            />
          </Grid>

          {data.error ? (
            <Empty note="Tenta novamente daqui a pouco.">
              Não consegui ler as faturas — {data.error}
            </Empty>
          ) : null}

          <SectionTitle>Faturas</SectionTitle>
          {data.invoices.length === 0 ? (
            <Empty note="Assim que alguém concluir um pagamento, a fatura aparece aqui.">
              Ainda não há faturas — nenhuma subscrição concluída.
            </Empty>
          ) : (
            <StackTable headers={["Fatura", "Conta", "Estado", "Valor", "Data", "Ações"]}>
              {data.invoices.map((i) => (
                <Tr key={i.id}>
                  <Td>
                    {i.hostedUrl ? (
                      <a href={i.hostedUrl} target="_blank" rel="noreferrer" className="underline">
                        {i.number ?? i.id}
                      </a>
                    ) : (
                      (i.number ?? i.id)
                    )}
                  </Td>
                  <Td>
                    <div>{i.customerEmail ?? "—"}</div>
                    <div className="text-xs text-muted-foreground">{i.customerId ?? ""}</div>
                  </Td>
                  <Td>
                    <Badge tone={i.status === "paid" ? "ok" : i.status === "open" ? "warn" : "bad"}>
                      {i.status ?? "—"}
                    </Badge>
                  </Td>
                  <Td>{eur(i.amount)}</Td>
                  <Td>{dt(i.created)}</Td>
                  <Td>
                    <div className="flex flex-wrap gap-2">
                      {i.paymentIntentId ? (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={async () => {
                            if (!confirm("Reembolsar esta fatura por inteiro?")) return;
                            after(await refund({ data: { paymentIntentId: i.paymentIntentId! } }));
                          }}
                        >
                          Reembolsar
                        </Button>
                      ) : null}
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={async () => after(await resend({ data: { invoiceId: i.id } }))}
                      >
                        Reenviar
                      </Button>
                      {i.status === "open" ? (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={async () => after(await retry({ data: { invoiceId: i.id } }))}
                        >
                          Tentar cobrar
                        </Button>
                      ) : null}
                    </div>
                  </Td>
                </Tr>
              ))}
            </StackTable>
          )}
        </>
      )}
    </div>
  );
}
