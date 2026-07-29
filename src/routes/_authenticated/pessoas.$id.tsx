import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { AppShell, PageHeader } from "@/components/app-shell";
import { useStore } from "@/lib/store";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatData, formatEUR, type Relacao } from "@/lib/demo-data";
import { ChevronLeft, Mail, Phone, Trash2, Save, MessageSquarePlus } from "lucide-react";
import { toast } from "sonner";
import { PersonExtrasCard } from "@/components/pessoas/person-extras-card";
import { PersonLinkedCard } from "@/components/pessoas/person-linked-card";

const RELACOES: Relacao[] = ["Cliente", "Potencial", "Proprietário", "Referenciador", "Colega"];

export const Route = createFileRoute("/_authenticated/pessoas/$id")({
  head: () => ({
    meta: [
      { title: "Ficha da pessoa — Assessor do Consultor" },
      { name: "description", content: "Contactos, oportunidades, imóveis, seguimentos e interações." },
      { property: "og:title", content: "Ficha da pessoa — Assessor do Consultor" },
      { property: "og:description", content: "Memória organizada por pessoa." },
    ],
  }),
  component: PessoaDetail,
});

function PessoaDetail() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const {
    pessoas, oportunidades, imoveis, seguimentos, documentos,
    updatePessoa, deletePessoa, addInteracao, loading,
  } = useStore();

  const pessoa = useMemo(() => pessoas.find((p) => p.id === id), [pessoas, id]);

  const [nome, setNome] = useState(pessoa?.nome ?? "");
  const [telefone, setTelefone] = useState(pessoa?.telefone ?? "");
  const [email, setEmail] = useState(pessoa?.email ?? "");
  const [relacao, setRelacao] = useState<Relacao>((pessoa?.relacao as Relacao) ?? "Potencial");
  const [resumo, setResumo] = useState(pessoa?.resumo ?? "");
  const [proximaAcao, setProximaAcao] = useState(pessoa?.proximaAcao ?? "");
  const [proximaAcaoData, setProximaAcaoData] = useState(pessoa?.proximaAcaoData ?? "");
  const [interacao, setInteracao] = useState("");
  const [busy, setBusy] = useState(false);

  if (loading && !pessoa) {
    return <AppShell><PageHeader title="A carregar…" /></AppShell>;
  }

  if (!pessoa) {
    return (
      <AppShell>
        <PageHeader title="Pessoa não encontrada" subtitle="O contacto pode ter sido apagado." />
        <Button variant="ghost" onClick={() => navigate({ to: "/pessoas" })}>
          <ChevronLeft className="mr-1 h-4 w-4" /> Voltar
        </Button>
      </AppShell>
    );
  }

  const dirty =
    nome !== pessoa.nome ||
    telefone !== pessoa.telefone ||
    email !== pessoa.email ||
    relacao !== pessoa.relacao ||
    resumo !== pessoa.resumo ||
    (proximaAcao ?? "") !== (pessoa.proximaAcao ?? "") ||
    (proximaAcaoData ?? "") !== (pessoa.proximaAcaoData ?? "");

  const guardar = async () => {
    if (!nome.trim()) { toast.error("O nome é obrigatório."); return; }
    setBusy(true);
    try {
      await updatePessoa(pessoa.id, {
        nome: nome.trim(),
        telefone: telefone.trim(),
        email: email.trim(),
        relacao,
        resumo: resumo.trim(),
        proximaAcao: proximaAcao.trim() || undefined,
        proximaAcaoData: proximaAcaoData || undefined,
      });
      toast.success("Alterações guardadas.");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const registarInteracao = async () => {
    const texto = interacao.trim();
    if (!texto) return;
    setBusy(true);
    try {
      await addInteracao({ pessoaId: pessoa.id, conteudoOriginal: texto });
      setInteracao("");
      toast.success("Interação registada.");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const apagar = async () => {
    if (!confirm(`Apagar ${pessoa.nome}?`)) return;
    try {
      await deletePessoa(pessoa.id);
      toast.success("Pessoa apagada.");
      navigate({ to: "/pessoas" });
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const opsPessoa = oportunidades.filter((o) => o.pessoaId === pessoa.id);
  const imoveisPessoa = imoveis.filter((i) => i.proprietarioId === pessoa.id);
  const segsPessoa = seguimentos.filter((s) => s.pessoaId === pessoa.id);
  const docsPessoa = documentos.filter((d) => d.pessoaId === pessoa.id);

  return (
    <AppShell>
      <div className="mb-2">
        <Button variant="ghost" size="sm" onClick={() => navigate({ to: "/pessoas" })}>
          <ChevronLeft className="mr-1 h-4 w-4" /> Pessoas
        </Button>
      </div>
      <PageHeader
        title={pessoa.nome}
        subtitle={pessoa.relacao}
        action={
          <div className="flex gap-2">
            <Button variant="ghost" className="text-destructive" onClick={apagar}>
              <Trash2 className="mr-1 h-4 w-4" /> Apagar
            </Button>
            <Button onClick={guardar} disabled={!dirty || busy}>
              <Save className="mr-1 h-4 w-4" /> Guardar
            </Button>
          </div>
        }
      />
      <div className="mb-4 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
        <Badge variant="secondary">{pessoa.relacao}</Badge>
        {pessoa.telefone && <span className="flex items-center gap-1"><Phone className="h-3 w-3" />{pessoa.telefone}</span>}
        {pessoa.email && <span className="flex items-center gap-1"><Mail className="h-3 w-3" />{pessoa.email}</span>}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardContent className="space-y-3 p-4">
            <h3 className="text-sm font-semibold">Contacto</h3>
            <div className="grid gap-2">
              <Label htmlFor="nome">Nome</Label>
              <Input id="nome" value={nome} onChange={(e) => setNome(e.target.value)} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="tel">Telefone</Label>
              <Input id="tel" value={telefone} onChange={(e) => setTelefone(e.target.value)} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div className="grid gap-2">
              <Label>Relação</Label>
              <Select value={relacao} onValueChange={(v) => setRelacao(v as Relacao)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {RELACOES.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="space-y-3 p-4">
            <h3 className="text-sm font-semibold">Notas & próxima ação</h3>
            <div className="grid gap-2">
              <Label htmlFor="resumo">Resumo</Label>
              <Textarea id="resumo" rows={3} value={resumo} onChange={(e) => setResumo(e.target.value)} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="pa">Próxima ação</Label>
              <Input id="pa" value={proximaAcao} onChange={(e) => setProximaAcao(e.target.value)} placeholder="Ex: Enviar CPCV" />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="pad">Data</Label>
              <Input id="pad" type="date" value={(proximaAcaoData ?? "").slice(0, 10)} onChange={(e) => setProximaAcaoData(e.target.value)} />
            </div>
          </CardContent>
        </Card>

        <PersonExtrasCard personId={pessoa.id} />
      </div>

      <PersonLinkedCard personId={pessoa.id} />

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <Card>
          <CardContent className="p-4">
            <h3 className="mb-3 text-sm font-semibold">Oportunidades ({opsPessoa.length})</h3>
            {opsPessoa.length === 0 ? (
              <p className="text-sm text-muted-foreground">Sem oportunidades.</p>
            ) : (
              <div className="space-y-2">
                {opsPessoa.map((o) => (
                  <div key={o.id} className="rounded-lg border border-border p-3 text-sm">
                    <div className="flex items-center justify-between">
                      <span className="font-medium">{o.tipo}</span>
                      <span>{formatEUR(o.valor)}</span>
                    </div>
                    <div className="text-xs text-muted-foreground">{o.estado} · Prob. {o.probabilidade}</div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <h3 className="mb-3 text-sm font-semibold">Seguimentos ({segsPessoa.length})</h3>
            {segsPessoa.length === 0 ? (
              <p className="text-sm text-muted-foreground">Sem seguimentos.</p>
            ) : (
              <div className="space-y-2">
                {segsPessoa.map((s) => (
                  <div key={s.id} className="rounded-lg border border-border p-3 text-sm">
                    <div>{s.titulo}</div>
                    <div className="text-xs text-muted-foreground">{formatData(s.data)} · {s.estado}</div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <h3 className="mb-3 text-sm font-semibold">Documentos ({docsPessoa.length})</h3>
            {docsPessoa.length === 0 ? (
              <p className="text-sm text-muted-foreground">Sem documentos.</p>
            ) : (
              <div className="space-y-2">
                {docsPessoa.map((d) => (
                  <div key={d.id} className="rounded-lg border border-border p-3 text-sm">{d.nome}</div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="mt-4">
        <CardContent className="space-y-3 p-4">
          <h3 className="text-sm font-semibold">Registar interação</h3>
          <Textarea
            rows={3}
            value={interacao}
            onChange={(e) => setInteracao(e.target.value)}
            placeholder="Ex: Ligou a pedir a atualização da avaliação bancária."
          />
          <div className="flex justify-end">
            <Button onClick={registarInteracao} disabled={!interacao.trim() || busy}>
              <MessageSquarePlus className="mr-1 h-4 w-4" /> Registar
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            As interações são guardadas no histórico da pessoa. Na próxima entrega o módulo Interações torna-as pesquisáveis.
          </p>
        </CardContent>
      </Card>
    </AppShell>
  );
}
