import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { AppShell, PageHeader } from "@/components/app-shell";
import { useStore } from "@/lib/store";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MessageSquare, Search } from "lucide-react";
import { formatData } from "@/lib/demo-data";

export const Route = createFileRoute("/_authenticated/interacoes")({
  head: () => ({
    meta: [
      { title: "Interações — Assessor do Consultor" },
      { name: "description", content: "Histórico de conversas, ligações e notas relacionadas com pessoas e oportunidades." },
      { property: "og:title", content: "Interações — Assessor do Consultor" },
      { property: "og:description", content: "Memória cronológica do consultor." },
    ],
  }),
  component: InteracoesPage,
});

function InteracoesPage() {
  const { interacoes, pessoas, oportunidades } = useStore();
  const [q, setQ] = useState("");
  const [canal, setCanal] = useState<string>("todos");

  const canais = useMemo(() => {
    const s = new Set<string>();
    interacoes.forEach((i) => s.add(i.canal));
    return Array.from(s);
  }, [interacoes]);

  const filtradas = useMemo(() => {
    const term = q.trim().toLowerCase();
    return interacoes.filter((i) => {
      if (canal !== "todos" && i.canal !== canal) return false;
      if (!term) return true;
      const pessoa = pessoas.find((p) => p.id === i.pessoaId)?.nome ?? "";
      const hay = `${i.conteudo} ${i.resumo ?? ""} ${pessoa} ${i.tipo ?? ""}`.toLowerCase();
      return hay.includes(term);
    });
  }, [interacoes, pessoas, q, canal]);

  const grupos = useMemo(() => {
    const map = new Map<string, typeof filtradas>();
    for (const i of filtradas) {
      const d = (i.data ?? "").slice(0, 10);
      const list = map.get(d) ?? [];
      list.push(i);
      map.set(d, list);
    }
    return Array.from(map.entries()).sort((a, b) => (a[0] < b[0] ? 1 : -1));
  }, [filtradas]);

  return (
    <AppShell>
      <PageHeader title="Interações" subtitle={`${interacoes.length} no total`} />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Pesquisar por pessoa, conteúdo ou tipo…" className="pl-9" />
        </div>
        <Select value={canal} onValueChange={setCanal}>
          <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos os canais</SelectItem>
            {canais.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {filtradas.length === 0 ? (
        <Card><CardContent className="p-6 text-center text-sm text-muted-foreground">
          <MessageSquare className="mx-auto mb-2 h-5 w-5" />
          Sem interações registadas.
        </CardContent></Card>
      ) : (
        <div className="space-y-5">
          {grupos.map(([data, itens]) => (
            <div key={data}>
              <div className="mb-2 text-xs uppercase tracking-wide text-muted-foreground">{formatData(data)}</div>
              <div className="space-y-2">
                {itens.map((i) => {
                  const pessoa = pessoas.find((p) => p.id === i.pessoaId);
                  const op = oportunidades.find((o) => o.id === i.oportunidadeId);
                  return (
                    <Link key={i.id} to="/interacoes/$id" params={{ id: i.id }} className="block">
                      <Card className="transition-colors hover:border-primary/40">
                        <CardContent className="p-4">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                                <Badge variant="outline">{i.canal}</Badge>
                                {i.tipo && <Badge variant="secondary">{i.tipo}</Badge>}
                                {pessoa && <span>· {pessoa.nome}</span>}
                                {op && <span>· {op.tipo}</span>}
                              </div>
                              <p className="mt-2 line-clamp-3 text-sm text-foreground/90">{i.resumo || i.conteudo}</p>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </AppShell>
  );
}