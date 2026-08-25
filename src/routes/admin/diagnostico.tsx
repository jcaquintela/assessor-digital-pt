import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Badge, Empty, Grid, MetricCard, PageTitle, SectionTitle } from "@/components/admin/ui";
import { StackTable, Td, Tr } from "@/components/admin/stack-table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getEngineDiagnostics, listDiagConsultants } from "@/lib/admin/diagnostico.functions";

export const Route = createFileRoute("/admin/diagnostico")({
  component: DiagnosticoPage,
  head: () => ({
    meta: [
      { title: "Diagnóstico do motor · Admin" },
      {
        name: "description",
        content:
          "Memória de conversa, chamadas de ferramentas e falhas de validação do Afonso, por consultor e por dia.",
      },
    ],
  }),
});

function today() {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
}

function hora(d: string) {
  return new Date(d).toLocaleTimeString("pt-PT", { hour: "2-digit", minute: "2-digit" });
}

function quando(d: string | null) {
  return d ? new Date(d).toLocaleString("pt-PT", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "—";
}

function DiagnosticoPage() {
  const consultantsFn = useServerFn(listDiagConsultants);
  const diagFn = useServerFn(getEngineDiagnostics);
  const [userId, setUserId] = useState<string>("");
  const [day, setDay] = useState<string>(today());
  const [filtro, setFiltro] = useState<"todas" | "falhas" | "validacao">("todas");

  const consultants = useQuery({
    queryKey: ["admin", "diag", "consultants"],
    queryFn: () => consultantsFn(),
    staleTime: 300_000,
  });

  const diag = useQuery({
    queryKey: ["admin", "diag", userId, day],
    queryFn: () => diagFn({ data: { userId, day } }),
    enabled: !!userId,
  });

  const calls = useMemo(() => {
    const all = diag.data?.toolCalls ?? [];
    if (filtro === "falhas") return all.filter((c) => !c.success);
    if (filtro === "validacao") return all.filter((c) => c.validation);
    return all;
  }, [diag.data, filtro]);

  return (
    <div>
      <PageTitle
        title="Diagnóstico do motor"
        sub="O que o Afonso tinha em memória, o que tentou gravar e o que a validação recusou — por consultor e por dia."
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <select
          className="h-9 rounded-md border bg-background px-2 text-sm"
          value={userId}
          onChange={(e) => setUserId(e.target.value)}
        >
          <option value="">Escolhe um consultor…</option>
          {(consultants.data ?? []).map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
        </select>
        <Input
          type="date"
          className="h-9 w-auto"
          value={day}
          onChange={(e) => setDay(e.target.value)}
        />
        <Button size="sm" variant="outline" onClick={() => diag.refetch()} disabled={!userId || diag.isFetching}>
          {diag.isFetching ? "A atualizar…" : "Atualizar"}
        </Button>
      </div>

      {!userId ? (
        <Empty>Escolhe um consultor para veres o dia dele.</Empty>
      ) : diag.isLoading ? (
        <Empty>A carregar…</Empty>
      ) : (
        <>
          <Grid cols={4}>
            <MetricCard
              label="Chamadas no dia"
              value={diag.data?.totals.calls ?? 0}
              sub={`${diag.data?.totals.ok ?? 0} com sucesso`}
              source="assessor_tool_calls · live"
            />
            <MetricCard
              label="Falhas"
              value={diag.data?.totals.failed ?? 0}
              tone={(diag.data?.totals.failed ?? 0) > 0 ? "coral" : "default"}
              sub="tentativas que não gravaram"
              source="assessor_tool_calls · live"
            />
            <MetricCard
              label="Recusadas na validação"
              value={diag.data?.totals.validationFailed ?? 0}
              sub="argumentos fora do formato"
              source="invalid_args · live"
            />
            <MetricCard
              label="Entidade não encontrada"
              value={diag.data?.totals.notFound ?? 0}
              tone={(diag.data?.totals.notFound ?? 0) > 0 ? "coral" : "default"}
              sub="alterações perdidas"
              source="assessor_tool_calls · live"
            />
          </Grid>

          <SectionTitle>Memória de conversa</SectionTitle>
          <p className="sub mb-3">
            Estado atual por canal. É daqui que o motor tira a entidade referida em seguimentos como “muda o telefone
            dela”.
          </p>
          {diag.data?.states?.length ? (
            <StackTable headers={["Canal", "Atualizado", "Última criação", "Entidade ativa", "Imóvel", "Intenção"]}>
              {diag.data.states.map((s, i) => (
                <Tr key={`${s.channel}-${i}`}>
                  <Td>{s.channel ?? "—"}</Td>
                  <Td>{quando(s.updated_at)}</Td>
                  <Td>
                    {s.last_created_resource_type
                      ? `${s.last_created_resource_type} · ${String(s.last_created_resource_id ?? "").slice(0, 8)}`
                      : "—"}
                  </Td>
                  <Td>
                    {s.last_entity_type
                      ? `${s.last_entity_type} · ${String(s.last_entity_id ?? "").slice(0, 8)}`
                      : s.active_person_id
                        ? `pessoa · ${s.active_person_id.slice(0, 8)}`
                        : "—"}
                  </Td>
                  <Td>{s.last_property_id ? s.last_property_id.slice(0, 8) : "—"}</Td>
                  <Td>{s.last_intent ?? "—"}</Td>
                </Tr>
              ))}
            </StackTable>
          ) : (
            <Empty>Sem memória de conversa para este consultor.</Empty>
          )}

          <SectionTitle>Chamadas de ferramentas e validação</SectionTitle>
          <div className="mb-3 flex gap-1 rounded-md border p-1">
            {([
              { key: "todas", label: `Todas (${diag.data?.totals.calls ?? 0})` },
              { key: "falhas", label: `Falhas (${diag.data?.totals.failed ?? 0})` },
              { key: "validacao", label: `Validação (${diag.data?.totals.validationFailed ?? 0})` },
            ] as const).map((f) => (
              <Button
                key={f.key}
                size="sm"
                variant={filtro === f.key ? "default" : "ghost"}
                onClick={() => setFiltro(f.key)}
              >
                {f.label}
              </Button>
            ))}
          </div>
          {calls.length ? (
            <div className="space-y-2">
              {calls.map((c) => (
                <div key={c.id} className="rounded-lg border p-3 text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="sub">{hora(c.created_at)}</span>
                    <Badge tone={c.success ? "ok" : c.validation ? "warn" : "bad"}>
                      {c.tool_name ?? "sem ferramenta"}
                    </Badge>
                    {c.channel ? <span className="sub">{c.channel}</span> : null}
                    {c.latency_ms ? <span className="sub">{c.latency_ms} ms</span> : null}
                    {c.error ? <span className="font-medium">{c.error}</span> : null}
                  </div>
                  {c.arguments ? (
                    <pre className="mt-2 overflow-x-auto rounded bg-muted p-2 text-xs">
                      {JSON.stringify(c.arguments, null, 2)}
                    </pre>
                  ) : null}
                  {c.result ? <p className="sub mt-1 break-all">{c.result}</p> : null}
                </div>
              ))}
            </div>
          ) : (
            <Empty>Sem chamadas neste dia com este filtro.</Empty>
          )}
        </>
      )}
    </div>
  );
}
