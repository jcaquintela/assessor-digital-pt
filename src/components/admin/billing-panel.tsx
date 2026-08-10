import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Badge, Empty, SectionTitle, Source } from "@/components/admin/ui";
import { getConsultantBilling, setBillingSource } from "@/lib/admin/billing.functions";
import { BILLING_SOURCE_LABEL, BILLING_STATUS_LABEL, tierForPrice } from "@/lib/subscription/billing-plans";
import { tierLabel } from "@/lib/subscription/tiers";

function fmt(v: string | null) {
  return v ? new Date(v).toLocaleString("pt-PT") : "—";
}

export function BillingPanel({ consultorId, isSuper }: { consultorId: string; isSuper: boolean }) {
  const qc = useQueryClient();
  const fetchBilling = useServerFn(getConsultantBilling);
  const setSource = useServerFn(setBillingSource);

  const { data, isPending } = useQuery({
    queryKey: ["admin", "billing", consultorId],
    queryFn: () => fetchBilling({ data: { userId: consultorId } }),
  });

  const change = (source: "manual" | "stripe") =>
    setSource({ data: { userId: consultorId, source } })
      .then(() => {
        toast.success(source === "manual" ? "Conta em gestão manual." : "Sincronização reativada.");
        qc.invalidateQueries({ queryKey: ["admin", "billing", consultorId] });
        qc.invalidateQueries({ queryKey: ["admin", "consultor", consultorId] });
      })
      .catch((e: Error) => toast.error(e.message || "Não foi possível concluir."));

  return (
    <>
      <SectionTitle>Cobrança da subscrição</SectionTitle>
      {isPending || !data ? (
        <p className="sub">A carregar…</p>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 md:grid-cols-4">
            <div className="admin-card p-3">
              <div className="mini" style={{ color: "var(--muted)" }}>Origem</div>
              <div className="mt-1 text-sm">
                <Badge tone={data.billingSource === "stripe" ? "ok" : "warn"}>
                  {BILLING_SOURCE_LABEL[data.billingSource]}
                </Badge>
              </div>
            </div>
            <div className="admin-card p-3">
              <div className="mini" style={{ color: "var(--muted)" }}>Estado</div>
              <div className="mt-1 text-sm">
                {BILLING_STATUS_LABEL[data.billingStatus] ?? data.billingStatus}
              </div>
            </div>
            <div className="admin-card p-3">
              <div className="mini" style={{ color: "var(--muted)" }}>Plano subscrito</div>
              <div className="mt-1 text-sm">
                {data.priceId ? `${tierLabel(tierForPrice(data.priceId))} (${data.priceId})` : "—"}
              </div>
            </div>
            <div className="admin-card p-3">
              <div className="mini" style={{ color: "var(--muted)" }}>Cliente</div>
              <div className="mono mini mt-1 break-all">{data.customerId ?? "—"}</div>
            </div>
          </div>

          <div className="admin-card mt-3 flex flex-wrap items-center gap-3 p-4">
            <button
              type="button"
              className="admin-btn tap-44"
              disabled={!isSuper || data.billingSource === "manual"}
              onClick={() => change("manual")}
            >
              Passar para gestão manual
            </button>
            <button
              type="button"
              className="admin-btn tap-44"
              disabled={!isSuper || data.billingSource === "stripe"}
              onClick={() => change("stripe")}
            >
              Reativar sincronização
            </button>
            <span className="mini" style={{ color: "var(--muted)" }}>
              Em gestão manual, os eventos de pagamento desta conta são registados mas nunca alteram o plano.
            </span>
          </div>

          <SectionTitle>Eventos de pagamento desta conta</SectionTitle>
          {data.events.length === 0 ? (
            <Empty>Ainda não chegou nenhum evento de pagamento para esta conta.</Empty>
          ) : (
            <div className="overflow-x-auto">
              <table>
                <thead>
                  <tr><th>Data</th><th>Evento</th><th>Resultado</th><th>Detalhe</th></tr>
                </thead>
                <tbody>
                  {data.events.map((e) => (
                    <tr key={e.id}>
                      <td className="mini whitespace-nowrap">{fmt(e.at)}</td>
                      <td className="mono mini">{e.type}</td>
                      <td className="mini">{e.outcome}</td>
                      <td className="mini" style={{ color: "var(--muted)" }}>{e.detail ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <Source>profiles × stripe_webhook_events</Source>
        </>
      )}
    </>
  );
}