import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Fragment, useState } from "react";
import { toast } from "sonner";
import { PageTitle, SectionTitle, Empty, Badge, Source } from "@/components/admin/ui";
import { getMyAdminRole } from "@/lib/admin.functions";
import {
  getEmailProviderStatus,
  listBroadcastRecipients,
  listBroadcasts,
  previewBroadcast,
  retryFailedRecipients,
  sendBroadcast,
  SEGMENTS,
  type Segment,
} from "@/lib/admin/comunicacao.functions";
import { TIER_DISPLAY_NAME } from "@/lib/subscription/tiers";

export const Route = createFileRoute("/admin/comunicacao")({
  head: () => ({ meta: [{ title: "Comunicação — Afonso admin" }] }),
  component: ComunicacaoPage,
});

const CHANNELS = [
  { key: "email", label: "Email" },
  { key: "dashboard", label: "Dashboard" },
  { key: "whatsapp", label: "WhatsApp / Telegram" },
] as const;

function segmentLabel(s: Segment) {
  if (s === "all") return "Todos os consultores";
  if (s === "beta") return "Beta testers";
  if (s === "channel:whatsapp") return "Ligados por WhatsApp";
  if (s === "channel:telegram") return "Ligados por Telegram";
  return `Plano ${TIER_DISPLAY_NAME[s.split(":")[1] as keyof typeof TIER_DISPLAY_NAME]}`;
}

function when(dt: string) {
  return new Date(dt).toLocaleString("pt-PT");
}

// Estado real por destinatário de um envio já feito.
function Recipients({ broadcastId, canRetry }: { broadcastId: string; canRetry: boolean }) {
  const qc = useQueryClient();
  const listFn = useServerFn(listBroadcastRecipients);
  const retryFn = useServerFn(retryFailedRecipients);
  const [retrying, setRetrying] = useState(false);
  const { data, isLoading } = useQuery({
    queryKey: ["admin", "broadcast-recipients", broadcastId],
    queryFn: () => listFn({ data: { broadcastId } }),
  });

  if (isLoading) return <div className="mini">A carregar destinatários…</div>;
  const rows = data ?? [];
  if (!rows.length) {
    return <div className="mini">Sem registo por destinatário (envio anterior a esta funcionalidade).</div>;
  }

  const failed = rows.filter((r) => r.status === "falhou");

  const retry = async () => {
    setRetrying(true);
    try {
      const res = await retryFn({ data: { broadcastId } });
      toast.success(
        `Repetido a ${res.retried} destinatário(s) que tinham falhado. ${res.sent} entregue(s), ${res.stillFailed} ainda por entregar. Quem já tinha recebido não foi contactado outra vez.`,
      );
      qc.invalidateQueries({ queryKey: ["admin", "broadcast-recipients", broadcastId] });
      qc.invalidateQueries({ queryKey: ["admin", "broadcasts"] });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setRetrying(false);
    }
  };

  return (
    <div>
      <div className="mini mb-2">
        {rows.filter((r) => r.status === "entregue").length} entregue(s) · {failed.length} falhou/falharam
      </div>
      <div className="max-h-64 overflow-auto">
        <table>
          <thead><tr><th>Destinatário</th><th>Estado</th><th>Motivo</th><th>Tentativa</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="mini">{r.email ?? r.user_id ?? "—"}</td>
                <td>
                  <Badge tone={r.status === "entregue" ? "ok" : "bad"}>
                    {r.status === "entregue" ? "Entregue" : "Falhou"}
                  </Badge>
                </td>
                <td className="mini">{r.error ?? "—"}</td>
                <td className="mini">{when(r.attempted_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {failed.length > 0 && canRetry ? (
        <button type="button" className="admin-btn tap-44 mt-3" disabled={retrying} onClick={retry}>
          {retrying ? "A repetir…" : `Repetir só os ${failed.length} que falharam`}
        </button>
      ) : null}
    </div>
  );
}

function ComunicacaoPage() {
  const qc = useQueryClient();
  const roleFn = useServerFn(getMyAdminRole);
  const previewFn = useServerFn(previewBroadcast);
  const listFn = useServerFn(listBroadcasts);
  const sendFn = useServerFn(sendBroadcast);
  const statusFn = useServerFn(getEmailProviderStatus);

  const { data: me } = useQuery({ queryKey: ["admin", "my-role"], queryFn: () => roleFn() });
  const isSuper = me?.role === "super_admin";

  const [channel, setChannel] = useState<"email" | "dashboard" | "whatsapp">("dashboard");
  const [segment, setSegment] = useState<Segment>("all");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [includeTest, setIncludeTest] = useState(false);
  const [sending, setSending] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [openBroadcast, setOpenBroadcast] = useState<string | null>(null);

  const { data: preview } = useQuery({
    queryKey: ["admin", "broadcast-preview", segment, channel, includeTest],
    queryFn: () => previewFn({ data: { segment, channel, includeTestAccounts: includeTest } }),
  });
  const { data: history } = useQuery({ queryKey: ["admin", "broadcasts"], queryFn: () => listFn() });
  const { data: emailStatus } = useQuery({
    queryKey: ["admin", "email-provider"],
    queryFn: () => statusFn(),
  });

  const blocked =
    channel === "email"
      ? emailStatus && !emailStatus.configured
        ? "Provider de email não ligado. A mensagem é composta e fica registada no histórico como bloqueada, mas não sai."
        : null
      : channel === "whatsapp"
        ? "Sem templates de envio em massa aprovados. Fora da janela de 24h o envio em massa está bloqueado."
        : null;

  const finalCount = preview?.finalCount ?? 0;
  const canSend = !!isSuper && !sending && body.trim().length >= 3 && channel !== "whatsapp" && finalCount > 0;

  const send = async () => {
    setSending(true);
    setConfirming(false);
    try {
      const res = await sendFn({
        data: {
          channel,
          segment,
          subject: subject.trim() || undefined,
          body: body.trim(),
          includeTestAccounts: includeTest,
        },
      });
      if (res.blocked) {
        toast.warning(`Provider de email não ligado — nada saiu. Registado para ${res.recipients} destinatários.`);
      } else if ((res.failed ?? 0) > 0 && (res.sent ?? 0) > 0) {
        toast.warning(
          `Entregue a ${res.sent} de ${res.recipients}. ${res.failed} falharam — abre o envio no histórico para repetir só esses.`,
        );
      } else if ((res.sent ?? 0) === 0) {
        toast.error(`Nada foi entregue. ${res.error ?? "erro desconhecido"}`);
      } else {
        toast.success(
          channel === "email"
            ? `Email entregue a ${res.sent} de ${res.recipients} consultores.`
            : `Aviso publicado para ${res.recipients} consultores.`,
        );
      }
      if (res.broadcastId) setOpenBroadcast(res.broadcastId);
      setSubject("");
      setBody("");
      qc.invalidateQueries({ queryKey: ["admin", "broadcasts"] });
    } catch (e) {
      toast.error((e as Error).message || "Não foi possível enviar.");
    } finally {
      setSending(false);
    }
  };

  const previewTitle = subject.trim() || body.trim().split("\n")[0].slice(0, 120);

  return (
    <div>
      <PageTitle
        title="Comunicação"
        sub="Falar com os consultores em massa. Nada sai sem pré-visualização, número final de destinatários e confirmação."
      />

      <SectionTitle first>Nova mensagem</SectionTitle>
      <div className="rounded-xl border p-4" style={{ borderColor: "var(--line)", background: "var(--card)" }}>
        <div className="mb-3 flex flex-wrap gap-2">
          {CHANNELS.map((c) => (
            <button
              key={c.key}
              type="button"
              className={`admin-pill ${channel === c.key ? "active" : ""}`}
              onClick={() => setChannel(c.key)}
            >
              {c.label}
            </button>
          ))}
        </div>

        <label className="mini mb-3 block" style={{ color: "var(--muted)" }}>
          Segmento
          <select
            className="admin-input mt-1 block w-full max-w-sm"
            value={segment}
            onChange={(e) => setSegment(e.target.value as Segment)}
          >
            {SEGMENTS.map((s) => (
              <option key={s} value={s}>{segmentLabel(s)}</option>
            ))}
          </select>
        </label>

        {channel === "email" ? (
          <label className="mini mb-3 block" style={{ color: "var(--muted)" }}>
            Assunto
            <input className="admin-input mt-1 block w-full" value={subject} onChange={(e) => setSubject(e.target.value)} />
          </label>
        ) : null}

        <label className="mini block" style={{ color: "var(--muted)" }}>
          Mensagem
          <textarea
            className="admin-input mt-1 block h-36 w-full"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Escreve como falarias com um consultor: direto, sem jargão."
          />
        </label>

        <SectionTitle>Pré-visualização (como o destinatário vê)</SectionTitle>
        <div className="admin-card p-4">
          {body.trim().length === 0 ? (
            <div className="mini" style={{ color: "var(--muted)" }}>Escreve a mensagem para veres a pré-visualização.</div>
          ) : (
            <div>
              <div className="mini" style={{ color: "var(--muted)" }}>
                {channel === "email"
                  ? "De: Afonso <ola@meuafonso.com>"
                  : "Aviso no topo do dashboard do consultor"}
              </div>
              <div className="mt-1"><strong>{previewTitle}</strong></div>
              <div className="mt-2 whitespace-pre-wrap">{body}</div>
            </div>
          )}
        </div>

        <SectionTitle>Quem recebe</SectionTitle>
        <div className="admin-card p-4">
          <div style={{ fontSize: 20 }}><strong>{finalCount}</strong> destinatário(s) finais</div>
          <div className="mini mt-1" style={{ color: "var(--muted)" }}>
            {preview?.activeCount ?? 0} ativos (com atividade nos últimos {preview?.activeWindowDays ?? 30} dias) ·{" "}
            {preview?.inactiveCount ?? 0} inativos
          </div>
          <div className="mini mt-1" style={{ color: "var(--muted)" }}>
            O segmento tem {preview?.segmentTotal ?? 0} contas · {preview?.excludedTest ?? 0} de teste/CI/shadow excluídas
            {channel === "email" && (preview?.excludedNoEmail ?? 0) > 0 ? ` · ${preview?.excludedNoEmail} sem email` : ""}
          </div>
          <label className="mini mt-3 flex items-center gap-2">
            <input type="checkbox" checked={includeTest} onChange={(e) => setIncludeTest(e.target.checked)} />
            Incluir contas de teste / CI / shadow (por defeito ficam de fora)
          </label>

          {(preview?.recipients ?? []).length > 0 ? (
            <div className="mt-3 max-h-56 overflow-auto">
              <table>
                <thead><tr><th>Nome</th><th>Contacto</th><th>Tipo</th><th>Estado</th></tr></thead>
                <tbody>
                  {(preview?.recipients ?? []).map((r) => (
                    <tr key={r.userId}>
                      <td className="mini">{r.name ?? "—"}</td>
                      <td className="mini">{r.email ?? "—"}</td>
                      <td className="mini">
                        {r.kind === "real" ? "Real" : r.kind === "teste" ? "Teste/CI" : r.kind === "shadow" ? "Shadow" : "Demo"}
                      </td>
                      <td><Badge tone={r.active ? "ok" : "warn"}>{r.active ? "Ativo" : "Inativo"}</Badge></td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {preview?.truncated ? <div className="mini mt-1">Lista truncada nos primeiros 200.</div> : null}
            </div>
          ) : (
            <div className="mini mt-3" style={{ color: "var(--coral)" }}>
              Nenhum destinatário final — o botão de enviar fica desligado.
            </div>
          )}
        </div>

        {blocked ? (
          <p className="mini mt-3 rounded-lg px-3 py-2" style={{ background: "var(--amber-bg)", color: "var(--amber)" }}>
            {blocked}
          </p>
        ) : null}

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button type="button" className="admin-btn-primary tap-44" disabled={!canSend} onClick={() => setConfirming(true)}>
            {sending ? "A enviar…" : "Enviar"}
          </button>
          {!isSuper ? <span className="mini" style={{ color: "var(--muted)" }}>Só super admin pode enviar.</span> : null}
        </div>

        {confirming ? (
          <div className="admin-card mt-3 p-4" style={{ borderColor: "var(--coral)" }}>
            <div>
              Vais enviar por <strong>{channel === "email" ? "email" : "dashboard"}</strong> a{" "}
              <strong>{finalCount}</strong> destinatário(s) do segmento <strong>{segmentLabel(segment)}</strong>
              {includeTest ? ", incluindo contas de teste" : ", com contas de teste excluídas"}.
            </div>
            <div className="mini mt-1" style={{ color: "var(--muted)" }}>
              {preview?.activeCount ?? 0} ativos · {preview?.inactiveCount ?? 0} inativos. Isto não pode ser desfeito.
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <button type="button" className="admin-btn-primary tap-44" disabled={sending} onClick={send}>
                {sending ? "A enviar…" : `Confirmo, enviar a ${finalCount}`}
              </button>
              <button type="button" className="admin-btn tap-44" onClick={() => setConfirming(false)}>
                Cancelar
              </button>
            </div>
          </div>
        ) : null}

        <Source>admin_broadcasts + admin_broadcast_recipients + dashboard_announcements</Source>
      </div>

      <SectionTitle>Histórico</SectionTitle>
      {(history ?? []).length === 0 ? (
        <Empty note="cada envio fica registado com canal, segmento e estado por destinatário">
          Ainda não enviaste nenhuma mensagem em massa.
        </Empty>
      ) : (
        <div className="overflow-x-auto">
          <table>
            <thead>
              <tr><th>Quando</th><th>Canal</th><th>Segmento</th><th>Destinatários</th><th>Mensagem</th><th>Estado</th></tr>
            </thead>
            <tbody>
              {(history ?? []).map((b) => {
                const open = openBroadcast === b.id;
                return (
                  <Fragment key={b.id}>
                    <tr className={`qa-row ${open ? "open" : ""}`} onClick={() => setOpenBroadcast(open ? null : b.id)}>
                      <td className="mini whitespace-nowrap">{open ? "▼ " : "▶ "}{when(b.created_at)}</td>
                      <td className="mini">
                        {b.channel === "dashboard" ? "Dashboard" : b.channel === "email" ? "Email" : "WhatsApp"}
                      </td>
                      <td className="mini">{segmentLabel(b.segment as Segment)}</td>
                      <td className="mini">{b.recipients_count}</td>
                      <td className="mini">{(b.subject ? `${b.subject} — ` : "") + b.body.slice(0, 80)}</td>
                      <td>
                        <Badge tone={b.status === "sent" ? "ok" : b.status === "falhou" ? "bad" : "warn"}>
                          {b.status === "sent"
                            ? "Entregue a todos"
                            : b.status === "enviado_parcial"
                              ? "Entregue em parte"
                              : b.status === "falhou"
                                ? "Falhou"
                                : b.status === "sem_destinatarios"
                                  ? "Sem destinatários"
                                  : b.status === "bloqueado_sem_provider"
                                    ? "Bloqueado (sem provider)"
                                    : b.status}
                        </Badge>
                      </td>
                    </tr>
                    {open ? (
                      <tr className="qa-transcript">
                        <td colSpan={6}>
                          <Recipients broadcastId={b.id} canRetry={!!isSuper && b.channel === "email"} />
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <p className="mini mt-2" style={{ color: "var(--muted)" }}>
        Clica num envio para ver o estado real de cada destinatário e repetir só os que falharam.
      </p>
    </div>
  );
}