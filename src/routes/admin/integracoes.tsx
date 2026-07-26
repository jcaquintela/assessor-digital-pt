import { createFileRoute } from "@tanstack/react-router";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import {
  getWhatsAppStatus,
  listWhatsAppSendLogs,
  sendWhatsAppTestMessage,
} from "@/lib/admin.functions";

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

function Badge({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs ${ok ? "border-green-500/40 text-green-700 dark:text-green-400" : "border-destructive/40 text-destructive"}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${ok ? "bg-green-500" : "bg-destructive"}`} />
      {label}
    </span>
  );
}

function WhatsAppStatusCard() {
  const fetchStatus = useServerFn(getWhatsAppStatus);
  const fetchLogs = useServerFn(listWhatsAppSendLogs);
  const runTest = useServerFn(sendWhatsAppTestMessage);
  const qc = useQueryClient();
  const [testMsg, setTestMsg] = useState<string | null>(null);
  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ["admin", "whatsapp-status"],
    queryFn: () => fetchStatus(),
    refetchInterval: 30_000,
  });
  const { data: logs } = useQuery({
    queryKey: ["admin", "whatsapp-send-logs"],
    queryFn: () => fetchLogs(),
    refetchInterval: 30_000,
  });
  const testMut = useMutation({
    mutationFn: () => runTest(),
    onSuccess: (res: any) => {
      if (res?.ok) {
        setTestMsg(`Enviado. message_id=${res.telemetry?.messageId ?? "—"}`);
      } else {
        const t = res?.telemetry ?? {};
        setTestMsg(
          `Falha. HTTP ${t.httpStatus ?? "—"} · code ${t.errorCode ?? "—"}` +
          (t.errorSubcode ? ` / subcode ${t.errorSubcode}` : "") +
          ` · ${res?.error ?? t.errorMessage ?? "erro"}` +
          (t.fbtraceId ? ` · fbtrace_id ${t.fbtraceId}` : ""),
        );
      }
      qc.invalidateQueries({ queryKey: ["admin", "whatsapp-status"] });
      qc.invalidateQueries({ queryKey: ["admin", "whatsapp-send-logs"] });
    },
    onError: (err: any) => setTestMsg(`Erro: ${err?.message ?? "desconhecido"}`),
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
          <>
          <div className="mb-3 flex flex-wrap gap-2">
            <Badge ok={!!data.config?.hasAccessToken} label="ACCESS_TOKEN" />
            <Badge ok={!!data.config?.hasPhoneNumberId} label="PHONE_NUMBER_ID" />
            <Badge ok={!!data.config?.hasAppSecret} label="APP_SECRET" />
            <Badge ok={!!data.config?.hasVerifyToken} label="VERIFY_TOKEN" />
            {data.config?.phoneNumberIdMasked ? (
              <span className="text-xs text-muted-foreground">
                Phone ID: {data.config.phoneNumberIdMasked} · Endpoint: {data.config.endpointBase}/{"{phone_id}"}/messages
              </span>
            ) : null}
          </div>
          <dl className="grid grid-cols-2 gap-y-2">
            <dt className="text-muted-foreground">Contas ligadas</dt>
            <dd>{data.linkedAccounts ?? 0}</dd>
            <dt className="text-muted-foreground">Contas pendentes</dt>
            <dd>{data.pendingAccounts ?? 0}</dd>
            <dt className="text-muted-foreground">Falhas de associação</dt>
            <dd>{data.linkFailures ?? 0}</dd>
            <dt className="text-muted-foreground">Últimas associações</dt>
            <dd>{(data.recentLinkedAt ?? []).length ? (data.recentLinkedAt as string[]).map(fmt).join(" · ") : "—"}</dd>
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
          {data.lastSend ? (
            <div className="mt-4 rounded-md border p-3">
              <div className="mb-1 text-xs font-medium text-muted-foreground">Última tentativa de envio</div>
              <dl className="grid grid-cols-2 gap-y-1 text-xs">
                <dt className="text-muted-foreground">Data/hora</dt>
                <dd>{fmt(data.lastSend.created_at)}</dd>
                <dt className="text-muted-foreground">Resultado</dt>
                <dd>{data.lastSend.ok ? "OK" : "Falha"}</dd>
                <dt className="text-muted-foreground">HTTP</dt>
                <dd>{data.lastSend.http_status ?? "—"}</dd>
                <dt className="text-muted-foreground">Meta code</dt>
                <dd>{data.lastSend.error_code ?? "—"}{data.lastSend.error_subcode ? ` / ${data.lastSend.error_subcode}` : ""}</dd>
                <dt className="text-muted-foreground">Tipo</dt>
                <dd>{data.lastSend.error_type ?? "—"}</dd>
                <dt className="text-muted-foreground">Mensagem</dt>
                <dd className="break-words">{data.lastSend.error_message ?? "—"}</dd>
                <dt className="text-muted-foreground">fbtrace_id</dt>
                <dd className="font-mono text-[11px]">{data.lastSend.fbtrace_id ?? "—"}</dd>
                <dt className="text-muted-foreground">Phone ID</dt>
                <dd className="font-mono text-[11px]">{data.lastSend.phone_number_id ? `${String(data.lastSend.phone_number_id).slice(0,3)}••••${String(data.lastSend.phone_number_id).slice(-4)}` : "—"}</dd>
              </dl>
            </div>
          ) : null}
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <Button
              size="sm"
              onClick={() => { setTestMsg(null); testMut.mutate(); }}
              disabled={testMut.isPending}
            >
              {testMut.isPending ? "A enviar…" : "Enviar mensagem de teste"}
            </Button>
            {testMsg ? <span className="text-xs text-muted-foreground break-all">{testMsg}</span> : null}
          </div>
          {logs && logs.length > 0 ? (
            <details className="mt-4">
              <summary className="cursor-pointer text-xs text-muted-foreground">Últimos {logs.length} envios</summary>
              <ul className="mt-2 space-y-1 text-xs">
                {logs.map((l: any) => (
                  <li key={l.id} className="rounded border px-2 py-1">
                    <span className="text-muted-foreground">{fmt(l.created_at)}</span>{" · "}
                    {l.ok ? "OK" : `HTTP ${l.http_status ?? "—"} code ${l.error_code ?? "—"}${l.error_subcode ? "/" + l.error_subcode : ""}`}
                    {l.error_message ? ` · ${l.error_message}` : ""}
                    {l.fbtrace_id ? ` · ${l.fbtrace_id}` : ""}
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
          </>
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