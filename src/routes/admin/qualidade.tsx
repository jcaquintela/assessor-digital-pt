import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Fragment, useState } from "react";
import { PageTitle, SectionTitle, Empty, Badge, Source } from "@/components/admin/ui";
import { requestContentAccess } from "@/lib/admin/consent.functions";
import {
  getQualityOverview,
  getTrustOverview,
  getTurnTranscript,
} from "@/lib/assessor/v3/quality.functions";

export const Route = createFileRoute("/admin/qualidade")({
  head: () => ({ meta: [{ title: "Qualidade — Afonso admin" }] }),
  component: QualidadePage,
});

function Bar({ value, max, label }: { value: number; max: number; label: string }) {
  const pct = max ? Math.round((value / max) * 100) : 0;
  return (
    <div>
      <div className="mini mb-1 flex justify-between" style={{ color: "var(--muted)" }}>
        <span>{label}</span><span>{value}/{max} · {pct}%</span>
      </div>
      <div style={{ height: 8, borderRadius: 6, background: "var(--line)" }}>
        <div style={{ height: 8, borderRadius: 6, background: "var(--ink)", width: `${pct}%` }} />
      </div>
    </div>
  );
}

function fmt(dt: string) {
  return new Date(dt).toLocaleString("pt-PT");
}

// A conversa real por trás do número. Sem isto, um AQS baixo não é acionável.
function Transcript({ traceId }: { traceId: string }) {
  const fn = useServerFn(getTurnTranscript);
  const askFn = useServerFn(requestContentAccess);
  const qc = useQueryClient();
  const [reason, setReason] = useState("");
  const { data, isLoading } = useQuery({
    queryKey: ["admin", "turn-transcript", traceId],
    queryFn: () => fn({ data: { traceId } }),
    staleTime: 60_000,
  });
  const ask = useMutation({
    mutationFn: () =>
      askFn({ data: { targetUserId: (data as any).targetUserId, resourceId: traceId, reason } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "turn-transcript", traceId] }),
  });

  if (isLoading) return <div className="mini">A carregar conversa…</div>;
  if (!data?.found) return <div className="mini">Sem trace guardado para este turno.</div>;

  // Sem consentimento vivo, a análise continua toda visível — só as palavras
  // do consultor e dos clientes dele é que ficam fechadas.
  if (!data.contentVisible) {
    return (
      <>
        <div className="qa-meta">
          <span>decisão: <strong>{data.action ?? "—"}</strong></span>
          <span>confiança: {data.confidence ?? "—"}</span>
          <span>latência: {data.latencyMs ? `${data.latencyMs} ms` : "—"}</span>
          <span>mensagens no turno: {data.messageCount}</span>
          <span>
            ferramentas:{" "}
            {data.tools.length
              ? data.tools.map((t: { name: string; ok: boolean }) => `${t.name}${t.ok ? "" : " ✗"}`).join(", ")
              : "nenhuma"}
          </span>
          {data.error ? <span style={{ color: "var(--coral)" }}>erro: {data.error}</span> : null}
          {data.corrections.length ? (
            <span style={{ color: "var(--coral)" }}>
              correções: {data.corrections.map((c) => c.category).join(", ")}
            </span>
          ) : null}
        </div>
        <div className="admin-card mt-2 p-3">
          <div className="mini mb-2">
            Conteúdo fechado. Para ler as mensagens é preciso autorização do consultor, válida 2 horas e registada.
          </div>
          <textarea
            className="admin-input w-full"
            rows={2}
            placeholder="Porque precisas de ver esta conversa? (fica no registo)"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
          <button
            className="admin-btn mt-2 tap-44"
            disabled={reason.trim().length < 10 || ask.isPending}
            onClick={() => ask.mutate()}
          >
            {ask.isPending ? "A pedir…" : "Pedir acesso ao conteúdo"}
          </button>
          {ask.isSuccess ? (
            <div className="mini mt-2">Pedido enviado. Fica pendente até o consultor autorizar.</div>
          ) : null}
          {ask.isError ? (
            <div className="mini mt-2" style={{ color: "var(--coral)" }}>{(ask.error as Error).message}</div>
          ) : null}
        </div>
      </>
    );
  }

  const msgs = data.messages.length
    ? data.messages
    : [
        { id: "in", role: "user", content: data.userMessage, createdAt: data.createdAt },
        ...(data.reply ? [{ id: "out", role: "assessor", content: data.reply, createdAt: data.createdAt }] : []),
      ];

  return (
    <>
      <div className="qa-bubbles">
        {msgs.map((m) => (
          <div key={m.id} className={`qa-bubble ${m.role === "user" ? "user" : "assessor"}`}>
            {m.content}
            <span className="qa-when">{fmt(m.createdAt)}</span>
          </div>
        ))}
      </div>
      <div className="qa-meta">
        <span>decisão: <strong>{data.action ?? "—"}</strong></span>
        <span>confiança: {data.confidence ?? "—"}</span>
        <span>latência: {data.latencyMs ? `${data.latencyMs} ms` : "—"}</span>
        <span>
          ferramentas:{" "}
          {data.tools.length
            ? data.tools.map((t: { name: string; ok: boolean }) => `${t.name}${t.ok ? "" : " ✗"}`).join(", ")
            : "nenhuma"}
        </span>
        {data.error ? <span style={{ color: "var(--coral)" }}>erro: {data.error}</span> : null}
      </div>
      {data.corrections.length > 0 ? (
        <div className="qa-meta" style={{ color: "var(--coral)" }}>
          {data.corrections.map((c) => (
            <span key={c.id}>correção ({c.category}): {c.message}</span>
          ))}
        </div>
      ) : null}
      <div className="mini mt-1" style={{ color: "var(--muted)" }}>
        Conteúdo aberto ao abrigo de:{" "}
        {data.contentBasis === "synthetic"
          ? "conta de teste"
          : data.contentBasis === "evaluation_program"
            ? "programa de avaliação (consentimento permanente)"
            : `autorização do consultor${data.contentExpiresAt ? ` até ${fmt(data.contentExpiresAt)}` : ""}`}
        . Esta abertura ficou registada.
      </div>
    </>
  );
}

function QualidadePage() {
  const fetchFn = useServerFn(getQualityOverview);
  const fetchTrust = useServerFn(getTrustOverview);
  const { data, isLoading, error } = useQuery({ queryKey: ["admin", "qualidade"], queryFn: () => fetchFn() });
  const trustQ = useQuery({ queryKey: ["admin", "trust"], queryFn: () => fetchTrust() });
  const [openTrace, setOpenTrace] = useState<string | null>(null);

  if (isLoading) return <Empty>A carregar…</Empty>;
  if (error || !data) return <Empty>Erro a carregar AQS.</Empty>;

  const maxAvg = Math.max(...data.daily.map((d) => d.avg ?? 0), 0.01);
  const trust = trustQ.data;
  const maxAts = trust ? Math.max(...trust.daily.map((d: any) => d.ats ?? 0), 1) : 1;

  return (
    <div>
      <PageTitle
        title="Qualidade"
        sub="Trust Mode v1 — ATS, AQS, correções e falhas dos últimos 14 dias. Cada turno fraco abre a conversa real."
      />

      {trust ? (
        <>
          <SectionTitle first>Definição de Pronto</SectionTitle>
          <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
            {[
              ["ATS ≥ 90", trust.readiness.ats_ok, trust.pillars.ats ?? "—"],
              ["AQS ≥ 0,90", trust.readiness.aqs_ok, trust.pillars.aqs ?? "—"],
              ["Tarefas ≥ 95%", trust.readiness.task_success_ok, trust.pillars.task_success ?? "—"],
              ["Correções < 3%", trust.readiness.corrections_ok, trust.pillars.corrections_rate ?? "—"],
              ["Contexto > 98%", trust.readiness.context_ok, trust.pillars.context_preservation ?? "—"],
            ].map(([label, ok, val]) => (
              <div key={label as string} className="admin-card p-3">
                <div className="mini" style={{ color: "var(--muted)" }}>{label as string}</div>
                <div className="mono">{String(val)}</div>
                <Badge tone={ok ? "ok" : "warn"}>{ok ? "cumpre" : "por cumprir"}</Badge>
              </div>
            ))}
          </div>
          <Source>assistant_trust_scores × assessor_quality_scores</Source>
        </>
      ) : null}

      {trust && trust.daily.length > 0 ? (
        <>
          <SectionTitle>ATS diário</SectionTitle>
          <div className="admin-card flex h-40 items-end gap-1 p-3">
            {trust.daily.map((d: any) => (
              <div key={d.day} className="flex flex-1 flex-col items-center gap-1">
                <div
                  style={{ width: "100%", background: "var(--sage)", borderRadius: "4px 4px 0 0", height: `${((d.ats ?? 0) / maxAts) * 100}%` }}
                  title={`${d.day} — ATS ${d.ats ?? "—"} (${d.n} turnos)`}
                />
                <span className="mini" style={{ color: "var(--muted)" }}>{d.day.slice(5)}</span>
              </div>
            ))}
          </div>
        </>
      ) : null}

      {trust && trust.topFailures.length > 0 ? (
        <>
          <SectionTitle>Top 10 motivos de falha</SectionTitle>
          <div className="overflow-x-auto">
            <table>
              <thead><tr><th>#</th><th>Motivo</th><th>Ocorrências</th></tr></thead>
              <tbody>
                {trust.topFailures.map((f: any, i: number) => (
                  <tr key={f.label}>
                    <td className="mini">{i + 1}</td>
                    <td>{f.label}</td>
                    <td className="mono mini">{f.count} · {f.pct}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : null}

      <SectionTitle>AQS diário</SectionTitle>
      {data.daily.length === 0 ? (
        <Empty>Ainda sem turnos registados.</Empty>
      ) : (
        <div className="admin-card flex h-40 items-end gap-1 p-3">
          {data.daily.map((d) => (
            <div key={d.day} className="flex flex-1 flex-col items-center gap-1">
              <div
                style={{ width: "100%", background: "var(--ink)", borderRadius: "4px 4px 0 0", height: `${((d.avg ?? 0) / maxAvg) * 100}%` }}
                title={`${d.day} — ${d.avg ?? "—"} (${d.n} turnos)`}
              />
              <span className="mini" style={{ color: "var(--muted)" }}>{d.day.slice(5)}</span>
            </div>
          ))}
        </div>
      )}

      <SectionTitle>Sinais · últimos 14 dias ({data.total} turnos)</SectionTitle>
      <div className="admin-card grid gap-3 p-4">
        <Bar label="Compreendeu à primeira" value={data.dist.understood_first_try} max={data.total} />
        <Bar label="Foi reformulado" value={data.dist.reformulated} max={data.total} />
        <Bar label="Executou com sucesso" value={data.dist.executed_successfully} max={data.total} />
        <Bar label="Tom humano" value={data.dist.human_tone} max={data.total} />
      </div>
      <Source>assessor_quality_scores</Source>

      <SectionTitle>Últimos 20 turnos com AQS &lt; 0,75</SectionTitle>
      {data.low.length === 0 ? (
        <Empty>Nenhum turno abaixo do limiar.</Empty>
      ) : (
        <div className="overflow-x-auto">
          <table>
            <thead>
              <tr>
                <th>Quando</th><th>Canal</th><th>Score</th>
                <th>1ª</th><th>Ref</th><th>Exec</th><th>Tom</th><th>Trace</th>
              </tr>
            </thead>
            <tbody>
              {data.low.map((r: any) => {
                const open = openTrace === r.trace_id;
                return (
                  <Fragment key={r.id}>
                    <tr
                      className={`qa-row ${open ? "open" : ""}`}
                      onClick={() => r.trace_id && setOpenTrace(open ? null : r.trace_id)}
                    >
                      <td className="mini whitespace-nowrap">
                        <span className="qa-summary">
                          <span className="qa-caret">{r.trace_id ? (open ? "▼" : "▶") : ""}</span>
                          {fmt(r.created_at)}
                        </span>
                      </td>
                      <td className="mini">{r.channel}</td>
                      <td className="mono">{r.score ?? "—"}</td>
                      <td>{r.understood_first_try ? "✓" : "—"}</td>
                      <td>{r.reformulated ? "✓" : "—"}</td>
                      <td>{r.executed_successfully ? "✓" : "—"}</td>
                      <td>{r.human_tone ? "✓" : "—"}</td>
                      <td className="mono mini">{r.trace_id ? r.trace_id.slice(0, 8) : "—"}</td>
                    </tr>
                    {open && r.trace_id ? (
                      <tr className="qa-transcript">
                        <td colSpan={8}><Transcript traceId={r.trace_id} /></td>
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
        Clica numa linha para ver a conversa real desse turno.
      </p>
    </div>
  );
}
