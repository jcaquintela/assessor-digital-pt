import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { AppShell, PageHeader } from "@/components/app-shell";
import { useStore } from "@/lib/store";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatData, type Pessoa, type Relacao } from "@/lib/demo-data";
import { Plus } from "lucide-react";
import { toast } from "sonner";

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
  const { pessoas, addPessoa, loading } = useStore();
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
          <Dialog open={novoOpen} onOpenChange={setNovoOpen}>
            <DialogTrigger asChild>
              <Button><Plus className="mr-1.5 h-4 w-4" /> Nova pessoa</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Nova pessoa</DialogTitle></DialogHeader>
              <NovaPessoaForm
                onSave={async (p) => {
                  try {
                    await addPessoa(p);
                    toast.success("Pessoa criada.");
                    setNovoOpen(false);
                  } catch (e) {
                    toast.error((e as Error).message);
                  }
                }}
              />
            </DialogContent>
          </Dialog>
        }
      />
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

function NovaPessoaForm({ onSave }: { onSave: (p: Omit<Pessoa, "id">) => Promise<void> }) {
  const [nome, setNome] = useState("");
  const [telefone, setTelefone] = useState("");
  const [email, setEmail] = useState("");
  const [relacao, setRelacao] = useState<Relacao>("Potencial");
  const [resumo, setResumo] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nome.trim()) return;
    setBusy(true);
    await onSave({ nome: nome.trim(), telefone, email, relacao, resumo });
    setBusy(false);
  };

  return (
    <form onSubmit={submit} className="space-y-3">
      <div className="space-y-1.5"><Label>Nome</Label><Input value={nome} onChange={(e) => setNome(e.target.value)} required /></div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5"><Label>Telefone</Label><Input value={telefone} onChange={(e) => setTelefone(e.target.value)} /></div>
        <div className="space-y-1.5"><Label>Email</Label><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
      </div>
      <div className="space-y-1.5">
        <Label>Relação</Label>
        <Select value={relacao} onValueChange={(v) => setRelacao(v as Relacao)}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            {(["Cliente","Potencial","Proprietário","Referenciador","Colega"] as Relacao[]).map((r) => (
              <SelectItem key={r} value={r}>{r}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5"><Label>Resumo</Label><Textarea value={resumo} onChange={(e) => setResumo(e.target.value)} rows={3} /></div>
      <DialogFooter>
        <Button type="submit" disabled={busy}>Guardar</Button>
      </DialogFooter>
    </form>
  );
}