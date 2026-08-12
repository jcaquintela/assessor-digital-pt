import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge, Empty, Grid, MetricCard, PageTitle, SectionTitle } from "@/components/admin/ui";
import { StackTable, Td, Tr } from "@/components/admin/stack-table";
import { listWriteErrors } from "@/lib/admin/write-errors.functions";

export const Route = createFileRoute("/admin/erros-escrita")({
  component: ErrosEscritaPage,
  head: () => ({
    meta: [
      { title: "Erros de escrita · Admin" },
      {
        name: "description",
        content: "Falhas reais de gravação do Afonso: ferramenta, mensagem de erro e argumentos.",
      },
    ],
  }),
});

const RANGES = [
  { label: "24 horas", hours: 24 },
  { label: "7 dias", hours: 24 * 7 },
  { label: "30 dias", hours: 24 * 30 },
] as const;

function fmt(d: string) {
  return new Date(d).toLocaleString("pt-PT", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function ErrosEscritaPage() {
  const fn = useServerFn(listWriteErrors);
  const [hours, setHours] = useState<number>(24 * 7);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<string | null>(null);

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["admin", "write-errors", hours],
    queryFn: () => fn({ data: { hours } }),
    refetchInterval: 60_000,
  });

  const items = data?.items ?? [];
  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return items;
    return items.filter((i) =>
      [i.tool_name, i.error, i.intent, i.consultant, i.channel]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(t)),
    );
  }, [items, q]);

  const topTool = useMemo(() => {
    const counts = new Map<string, number>();
    for (const i of items) counts.set(i.tool_name ?? "sem ferramenta", (counts.get(i.tool_name ?? "sem ferramenta") ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1])[0] ?? null;
  }, [items]);

  return (
    <div>
      <PageTitle
        title="Erros de escrita"
        sub="Tudo o que o Afonso tentou gravar e falhou — com ferramenta, erro e argumentos, para investigares sem abrir a base de dados."
      />

      <Grid cols={3}>
        <MetricCard
          label="Falhas nas últimas 24h"
          value={data?.last24h ?? "—"}
          tone={(data?.last24h ?? 0) > 0 ? "coral" : "default"}
          sub="ferramentas + motor"
          source="assessor_tool_calls · live"
        />
        <MetricCard label="Falhas no período" value={items.length} sub="máx. 200 registos" source="telemetria · live" />
        <MetricCard
          label="Ferramenta mais falhada"
          value={topTool ? topTool[0] : "—"}
          sub={topTool ? `${topTool[1]} ocorrência(s)` : "sem falhas"}
          source="agregado do período"
          stale={!topTool}
        />
      </Grid>

      <SectionTitle>Ocorrências</SectionTitle>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        {RANGES.map((r) => (
          <Button
            key={r.hours}
            size="sm"
            variant={hours === r.hours ? "default" : "outline"}
            onClick={() => setHours(r.hours)}
          >
            {r.label}
          </Button>
        ))}
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Filtrar por ferramenta, erro, consultor…"
          className="h-9 w-full sm:w-72"
        />
        <Button size="sm" variant="outline" onClick={() => refetch()} disabled={isFetching}>
          {isFetching ? "A atualizar…" : "Atualizar"}
        </Button>
      </div>

      {isLoading ? (
        <p className="sub">A carregar…</p>
      ) : filtered.length === 0 ? (
        <Empty note="Se um consultor reportar “não consegui guardar”, aparece aqui em segundos.">
          Sem erros de escrita no período escolhido.
        </Empty>
      ) : (
        <StackTable headers={["Quando", "Origem", "Ferramenta", "Erro", "Consultor", ""]}>
          {filtered.map((i) => (
            <Tr key={i.id}>
              <Td className="mini">{fmt(i.created_at)}</Td>
              <Td>
                <Badge tone={i.source === "tool" ? "bad" : "warn"}>
                  {i.source === "tool" ? "Ferramenta" : "Motor"}
                </Badge>
              </Td>
              <Td>{i.tool_name ?? "—"}</Td>
              <Td className="mini">
                <span className="break-words">{i.error ?? "sem mensagem"}</span>
                {i.intent ? <div className="text-[11px] opacity-70">{i.intent}</div> : null}
                {open === i.id ? (
                  <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap rounded-md bg-muted p-2 text-[11px]">
{JSON.stringify(
  {
    canal: i.channel,
    latencia_ms: i.latency_ms,
    user_id: i.user_id,
    argumentos: i.arguments,
    resultado: i.result,
  },
  null,
  2,
)}
                  </pre>
                ) : null}
              </Td>
              <Td>{i.consultant ?? "—"}</Td>
              <Td>
                <Button size="sm" variant="outline" onClick={() => setOpen(open === i.id ? null : i.id)}>
                  {open === i.id ? "Fechar" : "Detalhes"}
                </Button>
              </Td>
            </Tr>
          ))}
        </StackTable>
      )}
    </div>
  );
}
