import { createFileRoute } from "@tanstack/react-router";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getWhatsAppStatus } from "@/lib/admin.functions";

export const Route = createFileRoute("/admin/integracoes")({
  head: () => ({ meta: [{ title: "Integrações — Admin" }] }),
  component: IntegracoesPage,
});

const items = [
  { name: "WhatsApp", status: "Ativo (webhook)" },
  { name: "Google Calendar", status: "Planeado" },
  { name: "Microsoft Outlook", status: "Planeado" },
  { name: "Stripe", status: "Planeado" },
  { name: "OpenAI", status: "Planeado" },
];

function fmt(dt: string | null) {
  if (!dt) return "—";
  return new Intl.DateTimeFormat("pt-PT", { dateStyle: "short", timeStyle: "short" }).format(new Date(dt));
}

function WhatsAppStatusCard() {
  const fetchStatus = useServerFn(getWhatsAppStatus);
  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ["admin", "whatsapp-status"],
    queryFn: () => fetchStatus(),
    refetchInterval: 30_000,
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Estado WhatsApp</CardTitle>
      </CardHeader>
      <CardContent className="text-sm">
        {isLoading ? (
          <div className="text-muted-foreground">A carregar…</div>
        ) : error ? (
          <div className="text-destructive">Erro a carregar estado.</div>
        ) : data ? (
          <dl className="grid grid-cols-2 gap-y-2">
            <dt className="text-muted-foreground">Última recebida</dt>
            <dd>{fmt(data.lastInboundAt)}{data.lastInboundAt ? ` · ${data.lastInboundAssociated ? "associado" : "não associado"}` : ""}</dd>
            <dt className="text-muted-foreground">Última resposta</dt>
            <dd>{fmt(data.lastOutboundAt)}{data.lastOutboundStatus ? ` · ${data.lastOutboundStatus}` : ""}</dd>
            <dt className="text-muted-foreground">Mensagens 24h</dt>
            <dd>{data.messages24h}</dd>
            <dt className="text-muted-foreground">Falhas 24h</dt>
            <dd>{data.failures24h}</dd>
            <dt className="text-muted-foreground">Remetentes não associados 24h</dt>
            <dd>{data.unassociatedSenders24h}</dd>
          </dl>
        ) : null}
        <div className="mt-3 text-xs text-muted-foreground">
          Conteúdo das mensagens não é exibido. {isFetching ? "A atualizar…" : (
            <button className="underline" onClick={() => refetch()}>Atualizar</button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function IntegracoesPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Integrações</h1>
        <p className="text-sm text-muted-foreground">Estado das ligações externas ao nível da plataforma.</p>
      </div>
      <WhatsAppStatusCard />
      <div className="grid gap-3 md:grid-cols-2">
        {items.map((i) => (
          <Card key={i.name}>
            <CardHeader><CardTitle className="text-base">{i.name}</CardTitle></CardHeader>
            <CardContent className="text-sm text-muted-foreground">{i.status}</CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}