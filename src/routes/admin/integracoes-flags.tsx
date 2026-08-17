import { adminTitle } from "@/lib/brand";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
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
import {
  getBriefingTemplateSetup,
  listBriefingTestCandidates,
  saveBriefingTemplate,
  sendBriefingTemplateTest,
} from "@/lib/admin/template-binding.functions";
import {
  listProactiveTestTargets,
  listProactiveTests,
  runProactiveTemplateTest,
} from "@/lib/admin/proactive-test.functions";


export const Route = createFileRoute("/admin/integracoes-flags")({
  head: () => ({ meta: [{ title: adminTitle("Integrações & flags") }] }),
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
  return <FlagRowInner flag={flag} disabled={disabled} onSave={onSave} />;
}

function BriefingTemplateBlock({ canEdit }: { canEdit: boolean }) {
  const fetchSetup = useServerFn(getBriefingTemplateSetup);
  const fetchCandidates = useServerFn(listBriefingTestCandidates);
  const save = useServerFn(saveBriefingTemplate);
  const test = useServerFn(sendBriefingTemplateTest);
  const qc = useQueryClient();

  const { data: setup, isLoading } = useQuery({
    queryKey: ["admin", "briefing-template"],
    queryFn: () => fetchSetup(),
  });
  const { data: candidates } = useQuery({
    queryKey: ["admin", "briefing-candidates"],
    queryFn: () => fetchCandidates(),
  });

  const [name, setName] = useState<string>("");
  const [enabled, setEnabled] = useState<boolean>(false);
  const [followUpId, setFollowUpId] = useState<string>("");
  const [mode, setMode] = useState<"template" | "auto">("template");
  const [result, setResult] = useState<string | null>(null);

  const binding = setup?.binding ?? null;
  const templates = setup?.templates ?? [];
  const approved = templates.filter((t: any) => t.status === "APPROVED");
  const selectedName = name || binding?.template_name || "";
  const selected = templates.find((t: any) => t.name === selectedName) ?? null;
  const selectedEnabled = name || binding ? (name ? enabled : !!binding?.enabled) : false;

  const saveMut = useMutation({
    mutationFn: () =>
      save({
        data: {
          template_name: selectedName,
          language: selected?.language ?? "pt_PT",
          param_count: selected?.paramCount ?? 3,
          enabled: selectedEnabled,
        },
      }),
    onSuccess: () => {
      toast.success("Template guardado.");
      qc.invalidateQueries({ queryKey: ["admin", "briefing-template"] });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const testMut = useMutation({
    mutationFn: () => test({ data: { followUpId, mode } }),
    onSuccess: (r: any) => {
      setResult(
        r?.sent
          ? `Enviado (${r.via === "template" ? "template aprovado" : "texto livre, dentro das 24h"}).`
          : `Não enviado — motivo: ${r?.reason ?? "desconhecido"}.`,
      );
      if (r?.sent) toast.success("Cartela enviada.");
    },
    onError: (e) => { setResult(null); toast.error((e as Error).message); },
  });

  if (isLoading) return <Empty>A ler templates na Meta…</Empty>;

  return (
    <>
      <p className="mini mb-2" style={{ color: "var(--muted)" }}>
        Fora da janela de 24h a Meta só deixa passar templates aprovados. Escolhe aqui qual dos
        templates APPROVED da conta é usado na cartela de briefing e testa-o com um compromisso real.
        Sem template ligado, o Afonso fica em silêncio fora das 24h (nunca envia mensagem bloqueada).
      </p>

      {approved.length === 0 ? (
        <Empty>Nenhum template APPROVED na conta WhatsApp Business (ou credenciais em falta).</Empty>
      ) : (
        <div className="flex flex-wrap items-end gap-3">
          <label className="mini flex flex-col gap-1">
            Template aprovado
            <select
              className="admin-input min-h-[44px]"
              value={selectedName}
              onChange={(e) => { setName(e.target.value); setEnabled(true); }}
            >
              <option value="">— escolher —</option>
              {approved.map((t: any) => (
                <option key={`${t.name}:${t.language}`} value={t.name}>
                  {t.name} · {t.language} · {t.paramCount} variáveis
                </option>
              ))}
            </select>
          </label>
          <label className="mini flex items-center gap-2 min-h-[44px]">
            <input
              type="checkbox"
              checked={selectedEnabled}
              disabled={!canEdit}
              onChange={(e) => { setName(selectedName); setEnabled(e.target.checked); }}
            />
            Usar nos envios fora das 24h
          </label>
          <button
            type="button"
            className="admin-btn min-h-[44px]"
            disabled={!canEdit || !selectedName || saveMut.isPending}
            onClick={() => saveMut.mutate()}
          >
            {saveMut.isPending ? "A guardar…" : "Guardar escolha"}
          </button>
        </div>
      )}

      {selected ? (
        <p className="mini mt-2 break-words" style={{ color: "var(--muted)" }}>
          Corpo na Meta: “{selected.body}”
        </p>
      ) : null}
      <p className="mini mt-1" style={{ color: "var(--muted)" }}>
        Em uso agora:{" "}
        {binding?.enabled
          ? `${binding.template_name} (${binding.language})`
          : "nenhum — silêncio fora das 24h"}
      </p>

      <div className="mt-4 flex flex-wrap items-end gap-3">
        <label className="mini flex flex-col gap-1">
          Compromisso de teste (teus, com pessoa associada)
          <select
            className="admin-input min-h-[44px]"
            value={followUpId}
            onChange={(e) => { setFollowUpId(e.target.value); setResult(null); }}
          >
            <option value="">— escolher —</option>
            {(candidates ?? []).map((c: any) => (
              <option key={c.id} value={c.id}>
                {fmt(c.due_date)}{c.due_time ? ` ${c.due_time}` : ""} · {c.title} · {c.person ?? "—"}
              </option>
            ))}
          </select>
        </label>
        <label className="mini flex flex-col gap-1">
          Modo
          <select
            className="admin-input min-h-[44px]"
            value={mode}
            onChange={(e) => setMode(e.target.value as "template" | "auto")}
          >
            <option value="template">Forçar template (simula fora das 24h)</option>
            <option value="auto">Regra normal (texto se estiver dentro das 24h)</option>
          </select>
        </label>
        <button
          type="button"
          className="admin-btn min-h-[44px]"
          disabled={!followUpId || testMut.isPending}
          onClick={() => { setResult(null); testMut.mutate(); }}
        >
          {testMut.isPending ? "A enviar…" : "Enviar cartela de teste"}
        </button>
        {result ? <span className="mini" style={{ color: "var(--muted)" }}>{result}</span> : null}
      </div>
      <p className="mini mt-2" style={{ color: "var(--muted)" }}>
        O teste usa o conteúdo real da pessoa e não marca o compromisso como avisado — a cartela
        automática continua a sair na hora certa.
      </p>
      <Source>Graph API message_templates × whatsapp_template_bindings × follow_ups</Source>
    </>
  );
}

function FlagRowInner({ flag, disabled, onSave }: { flag: any; disabled: boolean; onSave: (v: any) => void }) {
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

      <SectionTitle>Cartela de briefing fora das 24h</SectionTitle>
      <BriefingTemplateBlock canEdit={isSuper} />

      <SectionTitle>Teste real de proatividade fora das 24h</SectionTitle>
      <ProactiveTestBlock canRun={isSuper} />

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

/**
 * Prova concreta de que um template chega a um consultor em silêncio há mais
 * de 24h. Mostra silêncio actual por consultor, força o envio e acompanha
 * entregue → lido → resposta, com o custo estimado do envio.
 */
function ProactiveTestBlock({ canRun }: { canRun: boolean }) {
  const qc = useQueryClient();
  const listTargets = useServerFn(listProactiveTestTargets);
  const listTests = useServerFn(listProactiveTests);
  const run = useServerFn(runProactiveTemplateTest);

  const { data: targets } = useQuery({
    queryKey: ["admin", "wa", "proactive-targets"],
    queryFn: () => listTargets(),
  });
  const { data: tests } = useQuery({
    queryKey: ["admin", "wa", "proactive-tests"],
    queryFn: () => listTests(),
    refetchInterval: 15000,
  });
  const [busy, setBusy] = useState<string | null>(null);

  const doRun = async (t: any, acknowledgeInsideWindow: boolean) => {
    setBusy(t.userId);
    try {
      const r: any = await run({
        data: { targetUserId: t.userId, followUpId: t.followUpId ?? undefined, acknowledgeInsideWindow },
      });
      toast.success(
        r.sent
          ? `Enviado por ${r.via}${r.outsideWindow ? " fora da janela" : " (dentro da janela)"}. A aguardar entrega.`
          : `Não foi enviado: ${r.reason ?? "sem motivo"}`,
      );
      qc.invalidateQueries({ queryKey: ["admin", "wa", "proactive-tests"] });
      qc.invalidateQueries({ queryKey: ["admin", "wa", "proactive-targets"] });
    } catch (e: any) {
      toast.error(e?.message ?? "Falhou.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div>
      <p className="mini mb-2" style={{ color: "var(--muted)" }}>
        Enquanto ninguém estiver 24h em silêncio, o caminho de template nunca é exercitado em
        produção. Aqui forças esse envio a um consultor real e ficas com a prova: entregue, lido,
        resposta — e o custo.
      </p>

      <div className="overflow-x-auto">
        <table>
          <thead>
            <tr>
              <th>Consultor</th>
              <th>Silêncio</th>
              <th>Compromisso</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {(targets ?? []).map((t: any) => (
              <tr key={t.userId}>
                <td>{t.name}</td>
                <td>
                  {t.hoursSinceLastInbound == null
                    ? "nunca escreveu"
                    : `${Math.round(t.hoursSinceLastInbound * 10) / 10} h`}
                  {t.outsideWindow === false ? " · dentro da janela" : " · fora da janela"}
                </td>
                <td>{t.followUpTitle ?? <span className="sub">sem compromisso com pessoa</span>}</td>
                <td style={{ textAlign: "right" }}>
                  <Button
                    size="sm"
                    disabled={!canRun || busy === t.userId || !t.followUpId}
                    onClick={() => doRun(t, t.outsideWindow === false)}
                  >
                    {busy === t.userId ? "A enviar…" : t.outsideWindow === false ? "Forçar mesmo assim" : "Enviar teste"}
                  </Button>
                </td>
              </tr>
            ))}
            {!targets?.length && (
              <tr>
                <td colSpan={4} className="sub">Nenhum consultor com WhatsApp ligado.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <p className="mini mt-3 mb-1" style={{ color: "var(--muted)" }}>Resultados</p>
      <div className="overflow-x-auto">
        <table>
          <thead>
            <tr>
              <th>Quando</th>
              <th>Template</th>
              <th>Silêncio</th>
              <th>Resultado</th>
              <th>Custo</th>
            </tr>
          </thead>
          <tbody>
            {(tests ?? []).map((t: any) => (
              <tr key={t.id}>
                <td>{fmt(t.created_at)}</td>
                <td>{t.template_name ?? "—"}{t.template_category ? ` · ${t.template_category}` : ""}</td>
                <td>
                  {t.hours_since_last_inbound == null ? "—" : `${Math.round(t.hours_since_last_inbound * 10) / 10} h`}
                  {t.outside_window ? " (fora)" : " (dentro)"}
                </td>
                <td>
                  {t.log?.replied_at
                    ? "respondeu"
                    : t.log?.read_at
                      ? "lido"
                      : t.log?.delivered_at
                        ? "entregue"
                        : t.status}
                  {t.log && t.log.ok === false ? ` · ${t.log.error_message ?? "falha"}` : ""}
                </td>
                <td>
                  {t.cost_eur == null
                    ? <span className="sub">por confirmar</span>
                    : `${Number(t.cost_eur).toFixed(4)} €`}
                </td>
              </tr>
            ))}
            {!tests?.length && (
              <tr><td colSpan={5} className="sub">Ainda não corremos nenhum teste.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
