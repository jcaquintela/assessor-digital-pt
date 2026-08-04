import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Fragment, useState } from "react";
import { PageTitle, SectionTitle, Empty, Badge, Source } from "@/components/admin/ui";
import { requestContentAccess } from "@/lib/admin/consent.functions";
import { fmtPct, fmtScore100, fmtShare } from "@/lib/admin/metrics-format";
import { dateStamp, downloadText, toCsv } from "@/lib/export/download";
import {
  getQualityOverview,
  getReformulationTrend,
  getTrustOverview,
  getTurnTranscript,
} from "@/lib/assessor/v3/quality.functions";

export const Route = createFileRoute("/admin/qualidade")({
  head: () => ({ meta: [{ title: "Qualidade — Afonso admin" }] }),
  component: QualidadePage,
});

// `hint` existe para o número nunca ficar ambíguo: diz-se sempre se subir é
// bom ou mau, e o que a percentagem conta exactamente.
function Bar({
  value,
  max,
  label,
  hint,
  worseWhenHigher,
}: {
  value: number;
  max: number;
  label: string;
  hint: string;
  worseWhenHigher?: boolean;
}) {
  const pct = max ? (value / max) * 100 : 0;
  return (
    <div>
      <div className="mini mb-1 flex justify-between gap-3" style={{ color: "var(--muted)" }}>
        <span>{label}</span>
        <span className="whitespace-nowrap">{fmtShare(value, max)} · {value} de {max} turnos</span>
      </div>
      <div style={{ height: 8, borderRadius: 6, background: "var(--line)" }}>
        <div
          style={{
            height: 8,
            borderRadius: 6,
            background: worseWhenHigher ? "var(--coral)" : "var(--ink)",
            width: `${pct}%`,
          }}
        />
      </div>
      <div className="mini mt-1" style={{ color: "var(--muted)" }}>{hint}</div>
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
  const fetchTrend = useServerFn(getReformulationTrend);
  const { data, isLoading, error } = useQuery({ queryKey: ["admin", "qualidade"], queryFn: () => fetchFn() });
  const trustQ = useQuery({ queryKey: ["admin", "trust"], queryFn: () => fetchTrust() });
  const trendQ = useQuery({ queryKey: ["admin", "reformulacao-trend"], queryFn: () => fetchTrend() });
  const [openTrace, setOpenTrace] = useState<string | null>(null);

  if (isLoading) return <Empty>A carregar…</Empty>;
  if (error || !data) return <Empty>Erro a carregar AQS.</Empty>;

  const maxAvg = Math.max(...data.daily.map((d) => d.avg ?? 0), 0.01);
  const trust = trustQ.data;
  const maxAts = trust ? Math.max(...trust.daily.map((d: any) => d.ats ?? 0), 1) : 1;
  const trend = trendQ.data;

  return (
    <div>
      <PageTitle
        title="Qualidade"
        sub="Trust Mode v1 — ATS, AQS, correções e falhas dos últimos 14 dias. A análise de cada turno fraco está sempre visível; o conteúdo das mensagens está fechado até o consultor autorizar."
      />

      {trust ? (
        <>
          <SectionTitle first>Definição de Pronto</SectionTitle>
          <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
            {(
              [
                ["ATS", "meta ≥ 90/100", trust.readiness.ats_ok, fmtScore100(trust.pillars.ats)],
                ["AQS", "meta ≥ 90%", trust.readiness.aqs_ok, fmtPct(trust.pillars.aqs)],
                ["Tarefas executadas", "meta ≥ 95%", trust.readiness.task_success_ok, fmtPct(trust.pillars.task_success)],
                ["Correções", "meta < 3%", trust.readiness.corrections_ok, fmtPct(trust.pillars.corrections_rate)],
                ["Contexto preservado", "meta > 98%", trust.readiness.context_ok, fmtPct(trust.pillars.context_preservation)],
              ] as [string, string, boolean, string][]
            ).map(([label, goal, ok, val]) => (
              <div key={label} className="admin-card p-3">
                <div className="mini" style={{ color: "var(--muted)" }}>{label}</div>
                <div className="mono">{val}</div>
                <div className="mini" style={{ color: "var(--muted)" }}>{goal}</div>
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
                  title={`${d.day} — ATS ${fmtScore100(d.ats)} (${d.n} turnos)`}
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
                title={`${d.day} — AQS ${fmtPct(d.avg)} (${d.n} turnos)`}
              />
              <span className="mini" style={{ color: "var(--muted)" }}>{d.day.slice(5)}</span>
            </div>
          ))}
        </div>
      )}

      <SectionTitle>Sinais · últimos 14 dias ({data.total} turnos)</SectionTitle>
      <div className="admin-card grid gap-3 p-4">
        <Bar
          label="Compreendeu à primeira"
          value={data.dist.understood_first_try}
          max={data.total}
          hint="Percentagem de turnos em que o Assessor agiu sem ter de fazer pergunta de esclarecimento. Quanto maior, melhor."
        />
        <Bar
          label="Precisou de reformulação"
          value={data.dist.reformulated}
          max={data.total}
          worseWhenHigher
          hint="Percentagem de turnos em que o consultor teve mesmo de repetir ou corrigir o MESMO pedido: repetição quase idêntica (até 10 min) ou, sem pergunta prévia do Assessor, uma nova mensagem sobre o mesmo assunto ou com correção explícita ('afinal', 'não era') em menos de 60 s. Responder a uma pergunta do Assessor ou mudar de assunto NÃO conta. Quanto maior, PIOR — é o sinal negativo, não o positivo."
        />
        <Bar
          label="Executou com sucesso"
          value={data.dist.executed_successfully}
          max={data.total}
          hint="Percentagem de turnos em que todas as ações pedidas correram bem. Quanto maior, melhor."
        />
        <Bar
          label="Tom humano"
          value={data.dist.human_tone}
          max={data.total}
          hint="Percentagem de respostas em PT-PT natural, sem jargão técnico. Quanto maior, melhor."
        />
      </div>
      <Source>assessor_quality_scores</Source>

      <SectionTitle>Reformulação · antes vs depois da correção</SectionTitle>
      {!trend || trend.total === 0 ? (
        <Empty>Ainda sem turnos nos últimos 14 dias.</Empty>
      ) : (
        <>
          <div className="mb-2">
            <button
              className="admin-btn tap-44"
              onClick={() =>
                downloadText(
                  `reformulacao-14-dias-${dateStamp()}.csv`,
                  "text/csv",
                  toCsv(
                    ["Dia", "Turnos", "Critério antigo", "Taxa antiga", "Critério atual", "Taxa atual"],
                    [
                      ...trend.daily.map((d: any) => [
                        d.day,
                        d.n,
                        d.legacy,
                        d.n ? (d.legacy / d.n).toFixed(4).replace(".", ",") : "",
                        d.current,
                        d.n ? (d.current / d.n).toFixed(4).replace(".", ",") : "",
                      ]),
                      [
                        "Total",
                        trend.total,
                        trend.legacyTotal,
                        trend.legacyRate != null ? trend.legacyRate.toFixed(4).replace(".", ",") : "",
                        trend.currentTotal,
                        trend.currentRate != null ? trend.currentRate.toFixed(4).replace(".", ",") : "",
                      ],
                    ],
                  ),
                )
              }
            >
              Exportar CSV (14 dias)
            </button>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div className="admin-card p-3">
              <div className="mini" style={{ color: "var(--muted)" }}>Critério antigo (só &lt; 60 s)</div>
              <div className="mono">{fmtPct(trend.legacyRate)}</div>
              <div className="mini" style={{ color: "var(--muted)" }}>{trend.legacyTotal} de {trend.total} turnos</div>
            </div>
            <div className="admin-card p-3">
              <div className="mini" style={{ color: "var(--muted)" }}>Critério atual</div>
              <div className="mono">{fmtPct(trend.currentRate)}</div>
              <div className="mini" style={{ color: "var(--muted)" }}>{trend.currentTotal} de {trend.total} turnos</div>
            </div>
            <div className="admin-card p-3">
              <div className="mini" style={{ color: "var(--muted)" }}>Diferença</div>
              <div className="mono">
                {trend.legacyRate != null && trend.currentRate != null
                  ? `−${fmtPct(trend.legacyRate - trend.currentRate)}`
                  : "—"}
              </div>
              <div className="mini" style={{ color: "var(--muted)" }}>falsos positivos removidos</div>
            </div>
          </div>
          <div className="admin-card mt-2 flex h-40 items-end gap-2 p-3">
            {trend.daily.map((d: any) => {
              const legacyPct = d.n ? (d.legacy / d.n) * 100 : 0;
              const currentPct = d.n ? (d.current / d.n) * 100 : 0;
              return (
                <div key={d.day} className="flex flex-1 flex-col items-center gap-1">
                  <div className="flex h-full w-full items-end justify-center gap-[2px]">
                    <div
                      style={{ width: "45%", background: "var(--coral)", opacity: 0.45, borderRadius: "4px 4px 0 0", height: `${legacyPct}%` }}
                      title={`${d.day} — critério antigo ${fmtShare(d.legacy, d.n)} (${d.legacy} de ${d.n})`}
                    />
                    <div
                      style={{ width: "45%", background: "var(--ink)", borderRadius: "4px 4px 0 0", height: `${currentPct}%` }}
                      title={`${d.day} — critério atual ${fmtShare(d.current, d.n)} (${d.current} de ${d.n})`}
                    />
                  </div>
                  <span className="mini" style={{ color: "var(--muted)" }}>{d.day.slice(5)}</span>
                </div>
              );
            })}
          </div>
          <p className="mini mt-1" style={{ color: "var(--muted)" }}>
            Barra clara = como o número seria com o critério antigo (qualquer mensagem a menos de 60 s da anterior).
            Barra escura = critério atual (repetição quase idêntica até 10 min, ou mesmo assunto/correção explícita em
            menos de 60 s sem pergunta prévia do Afonso). Mesmos turnos, mesma janela de 14 dias — serve para validar
            que o impacto se mantém dia após dia.
          </p>
        </>
      )}
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
                      <td className="mono">{r.score == null ? "—" : fmtPct(r.score)}</td>
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
        Clica numa linha para abrir a análise desse turno. As mensagens aparecem tapadas até haver autorização do
        consultor (válida 2 horas e registada na auditoria).
      </p>
    </div>
  );
}
