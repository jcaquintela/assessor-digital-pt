import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { PageTitle, SectionTitle, Empty, Badge, Source } from "@/components/admin/ui";
import { useAdminRole } from "./route";
import { runTelegramOnboardingSelfTest } from "@/lib/assessor/channel-gateway/e2e.functions";
import {
  getWhatsAppStatus,
  listWhatsAppSendLogs,
  sendWhatsAppTestMessage,
  getIntegrationsOverview,
  listFeatureFlags,
  upsertFeatureFlag,
} from "@/lib/admin.functions";

export const Route = createFileRoute("/admin/integracoes-flags")({
  head: () => ({ meta: [{ title: "Integrações & flags — Afonso admin" }] }),
  component: IntegracoesFlagsPage,
});

// Flags reais: cada chave só aparece com `readAt` se tiver ponto de leitura
// no motor. Sem ponto de leitura, ligar não altera comportamento nenhum.
const KNOWN_FLAGS: Record<string, { label: string; readAt: string | null }> = {
  "assessor.engine.v2": {
    label: "Motor conversacional v2",
    readAt: "isEngineV2Enabled → engine.server.ts",
  },
  "assessor.engine.v3": {
    label: "Reasoning Engine v3",
    readAt: "isEngineV3Enabled → engine.server.ts; proactive-tick.ts; proactivity.server.ts",
  },
  "assessor.supreme.v1": {
    label: "Assessor Supremo (prioridades + autonomia)",
    readAt: "isSupremeEnabled → priorities.functions.ts, autonomy.functions.ts",
  },
  "whatsapp.templates.approved": {
    label: "Templates WhatsApp aprovados (push fora da janela de 24h)",
    readAt:
      "templatesApproved() → proactive/push.server.ts (push da manhã + check-in da tarde); override manual: env WHATSAPP_TEMPLATES_APPROVED",
  },
};

function fmt(dt: string | null) {
  if (!dt) return "—";
  return new Intl.DateTimeFormat("pt-PT", { dateStyle: "short", timeStyle: "short" }).format(new Date(dt));
}

function WhatsAppBlock() {
  const fetchStatus = useServerFn(getWhatsAppStatus);
  const fetchLogs = useServerFn(listWhatsAppSendLogs);
  const runTest = useServerFn(sendWhatsAppTestMessage);
  const qc = useQueryClient();
  const [testMsg, setTestMsg] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
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
      const t = res?.telemetry ?? {};
      setTestMsg(
        res?.ok
          ? `Enviado. message_id=${t.messageId ?? "—"}`
          : `Falha. HTTP ${t.httpStatus ?? "—"} · code ${t.errorCode ?? "—"} · ${res?.error ?? t.errorMessage ?? "erro"}`,
      );
      qc.invalidateQueries({ queryKey: ["admin", "whatsapp-status"] });
      qc.invalidateQueries({ queryKey: ["admin", "whatsapp-send-logs"] });
    },
    onError: (err: any) => setTestMsg(`Erro: ${err?.message ?? "desconhecido"}`),
  });

  if (isLoading) return <Empty>A carregar estado do WhatsApp…</Empty>;
  if (!data) return <Empty>Sem estado disponível.</Empty>;

  const cfg = data.config ?? ({} as any);
  const creds: [string, boolean][] = [
    ["ACCESS_TOKEN", !!cfg.hasAccessToken],
    ["PHONE_NUMBER_ID", !!cfg.hasPhoneNumberId],
    ["APP_SECRET", !!cfg.hasAppSecret],
    ["VERIFY_TOKEN", !!cfg.hasVerifyToken],
  ];

  return (
    <>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        {creds.map(([label, ok]) => (
          <Badge key={label} tone={ok ? "ok" : "bad"}>{label}</Badge>
        ))}
        {cfg.phoneNumberIdMasked ? (
          <span className="mini" style={{ color: "var(--muted)" }}>Phone ID: {cfg.phoneNumberIdMasked}</span>
        ) : null}
      </div>
      <div className="overflow-x-auto">
        <table>
          <thead>
            <tr><th>Ligadas</th><th>Pendentes</th><th>Falhas assoc.</th><th>Última recebida</th><th>Última resposta</th><th>24h</th></tr>
          </thead>
          <tbody>
            <tr>
              <td>{data.linkedAccounts ?? 0}</td>
              <td>{data.pendingAccounts ?? 0}</td>
              <td>{data.linkFailures ?? 0}</td>
              <td className="mini">{fmt(data.lastInboundAt)}</td>
              <td className="mini">{fmt(data.lastOutboundAt)}{data.lastOutboundStatus ? ` · ${data.lastOutboundStatus}` : ""}</td>
              <td className="mini">{data.messages24h} msg · {data.failures24h} falhas</td>
            </tr>
          </tbody>
        </table>
      </div>
      <Source>whatsapp_send_logs × assessor_messages × profiles</Source>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button
          type="button"
          className="admin-btn"
          onClick={() => { setTestMsg(null); testMut.mutate(); }}
          disabled={testMut.isPending}
        >
          {testMut.isPending ? "A enviar…" : "Enviar mensagem de teste"}
        </button>
        {testMsg ? <span className="mini break-all" style={{ color: "var(--muted)" }}>{testMsg}</span> : null}
      </div>
      {logs && logs.length > 0 ? (
        <details className="mt-3">
          <summary className="mini cursor-pointer" style={{ color: "var(--muted)" }}>Últimos {logs.length} envios</summary>
          <ul className="mini mt-2 space-y-1">
            {logs.map((l: any) => (
              <li key={l.id}>
                {fmt(l.created_at)} ·{" "}
                {l.ok ? "OK" : `HTTP ${l.http_status ?? "—"} code ${l.error_code ?? "—"}`}
                {l.error_message ? ` · ${l.error_message}` : ""}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
      <p className="mini mt-2" style={{ color: "var(--muted)" }}>Conteúdo das mensagens nunca é exibido.</p>
    </>
  );
}

function TelegramSelfTestBlock() {
  const run = useServerFn(runTelegramOnboardingSelfTest);
  const [report, setReport] = useState<any>(null);
  const mut = useMutation({
    mutationFn: () => run(),
    onSuccess: (res: any) => {
      setReport(res);
      if (res?.ok) toast.success("Onboarding automático validado.");
      else toast.error("Self-test falhou — vê os detalhes.");
    },
    onError: (e) => toast.error((e as Error).message),
  });

  return (
    <>
      <p className="mini mb-2" style={{ color: "var(--muted)" }}>
        Envia um update sintético de um chat_id novo, sem código, pela mesma pipeline do webhook e
        contra a base de dados real. Valida criação de conta base + saudação única, e apaga a conta no fim.
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          className="admin-btn"
          onClick={() => { setReport(null); mut.mutate(); }}
          disabled={mut.isPending}
        >
          {mut.isPending ? "A correr…" : "Correr self-test de onboarding"}
        </button>
        {report ? (
          <Badge tone={report.ok ? "ok" : "bad"}>{report.ok ? "tudo OK" : "falhou"}</Badge>
        ) : null}
        {report && !report.cleanedUp ? <Badge tone="warn">limpeza incompleta</Badge> : null}
      </div>
      {report ? (
        <>
          <div className="mt-3 overflow-x-auto">
            <table>
              <thead><tr><th>Verificação</th><th>Estado</th><th>Detalhe</th></tr></thead>
              <tbody>
                {report.checks.map((c: any) => (
                  <tr key={c.name}>
                    <td>{c.name}</td>
                    <td><Badge tone={c.ok ? "ok" : "bad"}>{c.ok ? "ok" : "falha"}</Badge></td>
                    <td className="mini break-all">{c.detail}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mini mt-2" style={{ color: "var(--muted)" }}>
            chat_id {report.chatId} · {report.repliesSent.length} resposta(s) · {fmt(report.ranAt)}
          </p>
        </>
      ) : null}
      <Source>channel_links × profiles × assessor_messages (conta sintética, apagada no fim)</Source>
    </>
  );
}

function FlagRow({ flag, disabled, onSave }: { flag: any; disabled: boolean; onSave: (v: any) => void }) {
  const [enabled, setEnabled] = useState<boolean>(!!flag.enabled_globally);
  const inert = !flag.readAt;
  return (
    <tr>
      <td>
        <div className="flex flex-wrap items-center gap-2">
          <strong>{flag.label}</strong>
          {inert ? <Badge tone="warn">sem efeito</Badge> : null}
        </div>
        <div className="mono mini" style={{ color: "var(--muted)" }}>{flag.key}</div>
        <div className="mini" style={{ color: "var(--muted)" }}>
          {inert ? "Sem ponto de leitura no motor." : `Lida em: ${flag.readAt}`}
        </div>
      </td>
      <td>
        <label className="mini flex items-center gap-2">
          <input
            type="checkbox"
            checked={enabled}
            disabled={disabled || inert}
            onChange={(e) => setEnabled(e.target.checked)}
          />
          Ativa globalmente
        </label>
      </td>
      <td>
        <button
          type="button"
          className="admin-btn"
          disabled={disabled || inert}
          onClick={() =>
            onSave({
              key: flag.key,
              description: flag.description,
              enabled_globally: enabled,
              enabled_plans: flag.enabled_plans ?? [],
              rollout_percentage: flag.rollout_percentage ?? 0,
            })
          }
        >
          Guardar
        </button>
      </td>
    </tr>
  );
}

function IntegracoesFlagsPage() {
  const { data: me } = useAdminRole();
  const isSuper = me?.role === "super_admin";
  const qc = useQueryClient();

  const fetchIntegrations = useServerFn(getIntegrationsOverview);
  const list = useServerFn(listFeatureFlags);
  const upsert = useServerFn(upsertFeatureFlag);

  const { data: items } = useQuery({ queryKey: ["admin", "integrations"], queryFn: () => fetchIntegrations() });
  const { data: flags, isLoading } = useQuery({ queryKey: ["admin", "flags"], queryFn: () => list() });
  const mut = useMutation({
    mutationFn: (input: any) => upsert({ data: input }),
    onSuccess: () => { toast.success("Guardado."); qc.invalidateQueries({ queryKey: ["admin", "flags"] }); },
    onError: (e) => toast.error((e as Error).message),
  });

  const rows = (flags ?? []).map((f: any) => ({
    ...f,
    label: KNOWN_FLAGS[f.key]?.label ?? f.key,
    readAt: KNOWN_FLAGS[f.key]?.readAt ?? null,
  }));

  return (
    <div>
      <PageTitle
        title="Integrações & flags"
        sub="Ligações externas e interruptores do motor na mesma página — o que está ligado lá fora e o que está ligado cá dentro."
      />

      <SectionTitle first>WhatsApp</SectionTitle>
      <WhatsAppBlock />

      <SectionTitle>Telegram — onboarding automático</SectionTitle>
      <TelegramSelfTestBlock />

      <SectionTitle>Outras integrações</SectionTitle>
      <p className="mini mb-2" style={{ color: "var(--muted)" }}>
        Esta tabela responde a “a integração está montada e com credenciais no servidor?”, não a
        “quantos consultores a usam”. Nas integrações que cada consultor liga à sua conta
        (calendários), a coluna Detalhe mostra as contas realmente ligadas.
      </p>
      <div className="overflow-x-auto">
        <table>
          <thead><tr><th>Integração</th><th>Âmbito</th><th>Disponível</th><th>Detalhe</th></tr></thead>
          <tbody>
            {(items ?? []).map((i) => (
              <tr key={i.name}>
                <td>{i.name}</td>
                <td className="mini">{(i as any).scope ?? "plataforma"}</td>
                <td>
                  <Badge tone={i.status === "active" ? "ok" : "warn"}>
                    {i.status === "active" ? "disponível" : "não disponível"}
                  </Badge>
                </td>
                <td className="mini">{i.detail}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Source>variáveis de ambiente do servidor × app_user_connections (admin-integrations.server.ts)</Source>

      <SectionTitle>Flags do motor</SectionTitle>
      {!isSuper ? <p className="mini mb-2" style={{ color: "var(--coral)" }}>Só super_admin pode alterar.</p> : null}
      {isLoading ? (
        <Empty>A carregar…</Empty>
      ) : rows.length === 0 ? (
        <Empty>Não existem flags registadas.</Empty>
      ) : (
        <div className="overflow-x-auto">
          <table>
            <thead><tr><th>Flag</th><th>Estado</th><th /></tr></thead>
            <tbody>
              {rows.map((f) => (
                <FlagRow key={f.key} flag={f} disabled={!isSuper} onSave={(v) => mut.mutate(v)} />
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Source>feature_flags</Source>
    </div>
  );
}
