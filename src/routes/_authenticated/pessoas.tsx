import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { AppShell, PageHeader } from "@/components/app-shell";
import { useStore } from "@/lib/store";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatData, formatEUR, type Pessoa, type Relacao } from "@/lib/demo-data";
import { Mail, Phone, Plus, Trash2 } from "lucide-react";
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
  const { pessoas, oportunidades, imoveis, seguimentos, documentos, addPessoa, deletePessoa, loading } = useStore();
  const [q, setQ] = useState("");
  const [selecionada, setSelecionada] = useState<Pessoa | null>(null);
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
          <button key={p.id} onClick={() => setSelecionada(p)} className="text-left">
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
          </button>
        ))}
      </div>

      <Sheet open={!!selecionada} onOpenChange={(o) => !o && setSelecionada(null)}>
        <SheetContent side="right" className="w-full max-w-lg overflow-y-auto sm:max-w-lg">
          {selecionada && (
            <>
              <SheetHeader>
                <SheetTitle>{selecionada.nome}</SheetTitle>
              </SheetHeader>
              <div className="mt-4 space-y-4 text-sm">
                <div className="flex flex-wrap gap-3 text-muted-foreground">
                  <span className="flex items-center gap-1"><Phone className="h-3.5 w-3.5" />{selecionada.telefone}</span>
                  <span className="flex items-center gap-1"><Mail className="h-3.5 w-3.5" />{selecionada.email}</span>
                </div>
                <Badge variant="outline">{selecionada.relacao}</Badge>
                <p>{selecionada.resumo}</p>

                <Bloco titulo="Próxima ação">
                  {selecionada.proximaAcao ? (
                    <p>{selecionada.proximaAcao} {selecionada.proximaAcaoData ? `· ${formatData(selecionada.proximaAcaoData)}` : ""}</p>
                  ) : (
                    <p className="text-muted-foreground">Sem próxima ação definida.</p>
                  )}
                </Bloco>

                <Bloco titulo="Oportunidades">
                  {oportunidades.filter((o) => o.pessoaId === selecionada.id).map((o) => (
                    <div key={o.id} className="rounded-lg border border-border p-3">
                      <div className="flex items-center justify-between"><span className="font-medium">{o.tipo}</span><span>{formatEUR(o.valor)}</span></div>
                      <div className="text-xs text-muted-foreground">{o.estado} · Probabilidade {o.probabilidade}</div>
                    </div>
                  ))}
                  {oportunidades.filter((o) => o.pessoaId === selecionada.id).length === 0 && (
                    <p className="text-muted-foreground">Sem oportunidades.</p>
                  )}
                </Bloco>

                <Bloco titulo="Imóveis">
                  {imoveis.filter((i) => i.proprietarioId === selecionada.id).map((i) => (
                    <div key={i.id} className="rounded-lg border border-border p-3">
                      <div className="font-medium">{i.titulo}</div>
                      <div className="text-xs text-muted-foreground">{i.localizacao} · {formatEUR(i.valor)}</div>
                    </div>
                  ))}
                  {imoveis.filter((i) => i.proprietarioId === selecionada.id).length === 0 && (
                    <p className="text-muted-foreground">Sem imóveis associados.</p>
                  )}
                </Bloco>

                <Bloco titulo="Seguimentos">
                  {seguimentos.filter((s) => s.pessoaId === selecionada.id).map((s) => (
                    <div key={s.id} className="rounded-lg border border-border p-3">
                      <div className="text-sm">{s.titulo}</div>
                      <div className="text-xs text-muted-foreground">{formatData(s.data)} · {s.estado}</div>
                    </div>
                  ))}
                  {seguimentos.filter((s) => s.pessoaId === selecionada.id).length === 0 && (
                    <p className="text-muted-foreground">Sem seguimentos.</p>
                  )}
                </Bloco>

                <Bloco titulo="Documentos">
                  {documentos.filter((d) => d.pessoaId === selecionada.id).map((d) => (
                    <div key={d.id} className="rounded-lg border border-border p-3 text-sm">{d.nome}</div>
                  ))}
                  {documentos.filter((d) => d.pessoaId === selecionada.id).length === 0 && (
                    <p className="text-muted-foreground">Sem documentos.</p>
                  )}
                </Bloco>
              </div>
            </>
          )}
          {selecionada && (
            <div className="mt-6 flex justify-end">
              <Button
                variant="ghost"
                className="text-destructive"
                onClick={async () => {
                  if (!confirm(`Apagar ${selecionada.nome}?`)) return;
                  try {
                    await deletePessoa(selecionada.id);
                    toast.success("Pessoa apagada.");
                    setSelecionada(null);
                  } catch (e) {
                    toast.error((e as Error).message);
                  }
                }}
              >
                <Trash2 className="mr-1 h-4 w-4" /> Apagar
              </Button>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </AppShell>
  );
}

function Bloco({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{titulo}</h3>
      <div className="space-y-2">{children}</div>
    </section>
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