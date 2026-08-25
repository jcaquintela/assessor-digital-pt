import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge, Empty, Grid, MetricCard, PageTitle, SectionTitle } from "@/components/admin/ui";
import { StackTable, Td, Tr } from "@/components/admin/stack-table";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { listWriteErrors, retryWriteError } from "@/lib/admin/write-errors.functions";
import type { WriteErrorItem } from "@/lib/admin/write-errors.server";

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
  const retryFn = useServerFn(retryWriteError);
  const qc = useQueryClient();
  const [hours, setHours] = useState<number>(24 * 7);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<WriteErrorItem | null>(null);
  const [lastRetry, setLastRetry] = useState<Record<string, string>>({});
  const [categoria, setCategoria] = useState<"escrita" | "modelo">("escrita");

  const retry = useMutation({
    mutationFn: (id: string) => retryFn({ data: { id } }),
    onSuccess: (res, id) => {
      setLastRetry((m) => ({
        ...m,
        [id]: res.ok
          ? `Repetido com sucesso em ${res.latencyMs} ms — o problema não é persistente.`
          : `Falhou de novo: ${res.error} — problema persistente.`,
      }));
      if (res.ok) toast.success("A escrita passou desta vez.");
      else toast.error(`Falhou de novo: ${res.error}`);
      qc.invalidateQueries({ queryKey: ["admin", "write-errors"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Não consegui repetir a escrita."),
  });

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["admin", "write-errors", hours],
    queryFn: () => fn({ data: { hours } }),
    refetchInterval: 60_000,
  });

  const todos: WriteErrorItem[] = data?.items ?? [];
  const items = useMemo(() => todos.filter((i) => i.kind === categoria), [todos, categoria]);
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
        sub="Falhas reais de gravação, separadas das falhas de modelo em que o caminho de recurso respondeu na mesma — para não confundires alarme com ruído."
      />

      <Grid cols={3}>
        <MetricCard
          label="Falhas de escrita (24h)"
          value={data?.last24h ?? "—"}
          tone={(data?.last24h ?? 0) > 0 ? "coral" : "default"}
          sub="tentativas reais de gravar que falharam"
          source="assessor_tool_calls · live"
        />
        <MetricCard
          label="Falhas de escrita no período"
          value={data?.writeCount ?? "—"}
          sub="máx. 200 registos"
          source="telemetria · live"
        />
        <MetricCard
          label="Ferramenta mais falhada"
          value={topTool ? topTool[0] : "—"}
          sub={topTool ? `${topTool[1]} ocorrência(s)` : "sem falhas"}
          source="agregado do período"
          stale={!topTool}
        />
      </Grid>

      <SectionTitle>Entidade não encontrada (alteração perdida)</SectionTitle>
      <p className="sub mb-3">
        O consultor pediu uma alteração e a ferramenta não encontrou a pessoa, o imóvel ou o registo — normalmente um
        id inventado pelo modelo. Nada ficou gravado, por isso é sempre perda de trabalho.
      </p>
      <Grid cols={3}>
        <MetricCard
          label="Últimas 24h"
          value={data?.notFound?.last24h ?? "—"}
          tone={(data?.notFound?.last24h ?? 0) > 0 ? "coral" : "default"}
          sub={
            data?.notFound?.lastAt ? `mais recente: ${fmt(data.notFound.lastAt)}` : "sem ocorrências"
          }
          source="assessor_tool_calls · live"
        />
        <MetricCard
          label="Últimos 7 dias"
          value={data?.notFound?.last7d ?? "—"}
          sub={
            data?.notFound
              ? `7 dias anteriores: ${data.notFound.prev7d}${
                  data.notFound.last7d > data.notFound.prev7d
                    ? " — a subir"
                    : data.notFound.last7d < data.notFound.prev7d
                      ? " — a descer"
                      : " — estável"
                }`
              : "—"
          }
          source="tendência · 14 dias"
        />
        <MetricCard
          label="Onde falha mais"
          value={data?.notFound?.byTool?.[0]?.tool ?? "—"}
          sub={
            data?.notFound?.byEntity?.length
              ? data.notFound.byEntity.map((e) => `${e.entity}: ${e.count}`).join(" · ")
              : "sem falhas"
          }
          source="agregado · 14 dias"
          stale={!data?.notFound?.byTool?.length}
        />
      </Grid>
      {!!data?.notFound?.samples?.length && (
        <div className="mb-6 mt-3 space-y-2">
          {data.notFound.samples.map((s) => (
            <div key={s.id} className="rounded-lg border p-3 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <Badge>{s.tool_name}</Badge>
                <span className="font-medium">{s.error}</span>
                <span className="sub">{fmt(s.created_at)}</span>
                {s.consultant ? <span className="sub">· {s.consultant}</span> : null}
                {s.channel ? <span className="sub">· {s.channel}</span> : null}
              </div>
              {s.input ? (
                <pre className="mt-2 overflow-x-auto rounded bg-muted p-2 text-xs">
                  {JSON.stringify(s.input, null, 2)}
                </pre>
              ) : (
                <p className="sub mt-2">Sem argumentos guardados.</p>
              )}
            </div>
          ))}
        </div>
      )}

      <SectionTitle>Falhas de modelo (com recurso)</SectionTitle>
      <p className="sub mb-3">
        A primeira chamada ao modelo falhou ou demorou demais e a resposta saiu pelo caminho de recurso. O consultor
        foi respondido e nenhum dado se perdeu — conta como saúde do motor, não como erro de escrita.
      </p>
      <Grid cols={3}>
        <MetricCard
          label="Últimas 24h"
          value={data?.modelLast24h ?? "—"}
          sub="sem perda de dados"
          source="assessor_ai_logs · live"
        />
        <MetricCard
          label="Últimos 7 dias"
          value={data?.modelTrend?.d7 ?? "—"}
          sub={
            data?.modelTrend
              ? `7 dias anteriores: ${data.modelTrend.prev7}${
                  data.modelTrend.d7 > data.modelTrend.prev7
                    ? " — a subir"
                    : data.modelTrend.d7 < data.modelTrend.prev7
                      ? " — a descer"
                      : " — estável"
                }`
              : "—"
          }
          source="tendência · 14 dias"
        />
        <MetricCard
          label="Últimos 30 dias"
          value={data?.modelTrend?.d30 ?? "—"}
          sub={
            data?.modelTrend?.avgLatencyMs
              ? `latência média ${(data.modelTrend.avgLatencyMs / 1000).toFixed(1)}s`
              : "sem ocorrências"
          }
          source="assessor_ai_logs · 30 dias"
        />
      </Grid>

      <SectionTitle>Ocorrências</SectionTitle>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="mr-2 flex gap-1 rounded-md border p-1">
          {([
            { key: "escrita", label: `Falhas de escrita (${todos.filter((i) => i.kind === "escrita").length})` },
            { key: "modelo", label: `Falhas de modelo (${todos.filter((i) => i.kind === "modelo").length})` },
          ] as const).map((c) => (
            <Button
              key={c.key}
              size="sm"
              variant={categoria === c.key ? "default" : "ghost"}
              onClick={() => setCategoria(c.key)}
            >
              {c.label}
            </Button>
          ))}
        </div>
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
        <Empty
          note={
            categoria === "escrita"
              ? "Se um consultor reportar “não consegui guardar”, aparece aqui em segundos."
              : "Quando a primeira chamada ao modelo falhar, a ocorrência fica registada aqui."
          }
        >
          {categoria === "escrita"
            ? "Sem falhas de escrita no período escolhido."
            : "Sem falhas de modelo no período escolhido."}
        </Empty>
      ) : (
        <StackTable headers={["Quando", "Origem", "Ferramenta", "Erro", "Consultor", ""]}>
          {filtered.map((i) => (
            <Tr key={i.id}>
              <Td className="mini">{fmt(i.created_at)}</Td>
              <Td>
                <Badge tone={i.kind === "escrita" ? "bad" : "warn"}>
                  {i.kind === "escrita" ? (i.source === "tool" ? "Ferramenta" : "Motor") : "Recurso"}
                </Badge>
              </Td>
              <Td>{i.tool_name ?? "—"}</Td>
              <Td className="mini">
                <span className="break-words">
                  {i.error ?? (i.kind === "modelo" ? "1.ª chamada falhou — respondeu pelo recurso" : "sem mensagem")}
                </span>
                {i.intent ? <div className="text-[11px] opacity-70">{i.intent}</div> : null}
                {open === i.id ? (
                  <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap rounded-md bg-muted p-2 text-[11px]">
{`canal: ${i.channel ?? "—"}\nlatência: ${i.latency_ms ?? "—"} ms\nuser_id: ${i.user_id ?? "—"}\n\nargumentos:\n${i.arguments ?? "—"}\n\nresultado:\n${i.result ?? "—"}`}
                  </pre>
                ) : null}
              </Td>
              <Td>{i.consultant ?? "—"}</Td>
              <Td>
                <div className="flex flex-wrap items-center gap-2">
                  <Button size="sm" variant="outline" onClick={() => setOpen(open === i.id ? null : i.id)}>
                    {open === i.id ? "Fechar" : "Detalhes"}
                  </Button>
                  {i.retryable ? (
                    <Button
                      size="sm"
                      onClick={() => setConfirm(i)}
                      disabled={retry.isPending}
                    >
                      Repetir
                    </Button>
                  ) : null}
                </div>
                {i.raw_id && lastRetry[i.raw_id] ? (
                  <div className="mini mt-1 max-w-64 whitespace-normal">{lastRetry[i.raw_id]}</div>
                ) : null}
              </Td>
            </Tr>
          ))}
        </StackTable>
      )}
      <AlertDialog open={!!confirm} onOpenChange={(o) => !o && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Repetir esta escrita?</AlertDialogTitle>
            <AlertDialogDescription>
              Vou correr outra vez <strong>{confirm?.tool_name}</strong> com os mesmos argumentos, em
              nome de {confirm?.consultant ?? "o consultor"}. Se resultar, o registo é criado a sério
              na conta dele — usa isto para confirmar se o erro é persistente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (confirm?.raw_id) retry.mutate(confirm.raw_id);
                setConfirm(null);
              }}
            >
              Repetir agora
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
