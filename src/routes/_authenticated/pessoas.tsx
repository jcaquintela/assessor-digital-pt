import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { AppShell, PageHeader } from "@/components/app-shell";
import { useStore } from "@/lib/store";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { formatData } from "@/lib/demo-data";
import { Plus } from "lucide-react";
import { NewPersonDialog } from "@/components/pessoas/new-person-dialog";

export const Route = createFileRoute("/_authenticated/pessoas")({
  head: () => ({
    meta: [
      { title: "Pessoas — Assessor do Consultor" },
      { name: "description", content: "Clientes, potenciais, proprietários e referenciadores." },
      { property: "og:title", content: "Pessoas — Assessor do Consultor" },
      { property: "og:description", content: "Clientes, potenciais, proprietários e referenciadores." },
    ],
  }),
  component: PessoasPage,
});

function PessoasPage() {
  const { pessoas, loading } = useStore();
  const [q, setQ] = useState("");
  const [novoOpen, setNovoOpen] = useState(false);

  const filtradas = pessoas.filter((p) =>
    (p.nome + p.email + p.telefone + p.resumo).toLowerCase().includes(q.toLowerCase()),
  );

  return (
    <AppShell>
      <PageHeader
        title="Pessoas"
        subtitle={`${pessoas.length} contactos`}
        action={
          <Button onClick={() => setNovoOpen(true)}><Plus className="mr-1.5 h-4 w-4" /> Nova pessoa</Button>
        }
      />
      <NewPersonDialog open={novoOpen} onOpenChange={setNovoOpen} />
      <Input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Procurar por nome, email ou tópico…"
        className="mb-4"
      />
      {loading && pessoas.length === 0 && (
        <p className="text-sm text-muted-foreground">A carregar…</p>
      )}
      {!loading && pessoas.length === 0 && (
        <div className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          Ainda não tem contactos. Crie o primeiro com <strong>Nova pessoa</strong>, ou carregue dados de demonstração em Definições.
        </div>
      )}

      <div className="grid gap-3 md:grid-cols-2">
        {filtradas.map((p) => (
          <Link key={p.id} to="/pessoas/$id" params={{ id: p.id }} className="text-left">
            <Card className="transition hover:border-primary/40">
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold">{p.nome}</div>
                    <div className="mt-0.5 text-xs text-muted-foreground">{p.email}</div>
                  </div>
                  <Badge variant="secondary" className="shrink-0">{p.relacao}</Badge>
                </div>
                <p className="mt-2 line-clamp-2 text-sm text-foreground/80">{p.resumo}</p>
                {p.proximaAcao && (
                  <div className="mt-3 text-xs text-primary">
                    Próx.: {p.proximaAcao} {p.proximaAcaoData ? `· ${formatData(p.proximaAcaoData)}` : ""}
                  </div>
                )}
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </AppShell>
  );
}