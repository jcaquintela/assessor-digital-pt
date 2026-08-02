import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { isOpenFollowUpStatus } from "@/lib/assessor/outcome-status";
import { useMemo, useState } from "react";
import { AppShell, PageHeader } from "@/components/app-shell";
import { useStore } from "@/lib/store";
import { Card, CardContent } from "@/components/ui/card";
import { EntityFilesCard } from "@/components/drive/entity-files-card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { formatData } from "@/lib/demo-data";
import {
  ChevronLeft, Mail, Phone, Trash2, MessageSquare, MoreHorizontal,
  CalendarPlus, Pencil, MessageSquarePlus,
} from "lucide-react";
import { toast } from "sonner";
import { PersonExtrasCard } from "@/components/pessoas/person-extras-card";
import { PersonLinkedCard } from "@/components/pessoas/person-linked-card";
import { DealsOf } from "@/components/negocios/deals-of";
import { EditPersonDialog } from "@/components/pessoas/edit-person-dialog";
import { useAssessorName } from "@/lib/assessor/assessor-name";

export const Route = createFileRoute("/_authenticated/pessoas/$id")({
  head: () => ({
    meta: [
      { title: "Contexto da pessoa — Assessor do Consultor" },
      { name: "description", content: "Quem é, o que procura, último contacto, próximo passo e ligações." },
      { property: "og:title", content: "Contexto da pessoa — Assessor do Consultor" },
      { property: "og:description", content: "Memória organizada por pessoa." },
    ],
  }),
  component: PessoaDetail,
});

const CANAL_LABEL: Record<string, string> = {
  whatsapp: "WhatsApp",
  telegram: "Telegram",
  web: "Dashboard",
  dashboard: "Dashboard",
  email: "Email",
  telefone: "Telefone",
};

function haQuantoTempo(iso: string): string {
  const dias = Math.floor((Date.now() - new Date(iso).getTime()) / 864e5);
  if (dias <= 0) return "hoje";
  if (dias === 1) return "ontem";
  if (dias < 7) return `há ${dias} dias`;
  if (dias < 14) return "há uma semana";
  if (dias < 60) return `há ${Math.floor(dias / 7)} semanas`;
  return `há ${Math.floor(dias / 30)} meses`;
}

function PessoaDetail() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const {
    pessoas, seguimentos, interacoes,
    deletePessoa, addInteracao, addSeguimento, loading,
  } = useStore();
  const { name: assessorName } = useAssessorName();

  const pessoa = useMemo(() => pessoas.find((p) => p.id === id), [pessoas, id]);

  const [editar, setEditar] = useState(false);
  const [interacao, setInteracao] = useState("");
  const [busy, setBusy] = useState(false);
  const [novoSeg, setNovoSeg] = useState(false);
  const [segTitulo, setSegTitulo] = useState("");
  const [segData, setSegData] = useState(new Date().toISOString().slice(0, 10));

  const segsPessoa = useMemo(
    () => seguimentos.filter((s) => s.pessoaId === id),
    [seguimentos, id],
  );
  const interPessoa = useMemo(
    () => interacoes
      .filter((i) => i.pessoaId === id)
      .sort((a, b) => new Date(b.data).getTime() - new Date(a.data).getTime()),
    [interacoes, id],
  );

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

  const ultimo = interPessoa[0] ?? null;
  const proximoSeg = segsPessoa
    .filter((s) => isOpenFollowUpStatus(s.estado))
    .sort((a, b) => new Date(a.data).getTime() - new Date(b.data).getTime())[0] ?? null;

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

  const criarSeguimento = async () => {
    if (!segTitulo.trim()) { toast.error("Dá um título ao seguimento."); return; }
    setBusy(true);
    try {
      await addSeguimento({
        tipo: "Tarefa",
        titulo: segTitulo.trim(),
        data: new Date(`${segData}T09:00:00`).toISOString(),
        pessoaId: pessoa.id,
        estado: "Pendente",
        prioridade: "Média",
      });
      toast.success("Seguimento criado.");
      setNovoSeg(false);
      setSegTitulo("");
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
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" aria-label="Mais ações">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-64">
              <DropdownMenuItem asChild>
                <Link to="/assessor">
                  <MessageSquare className="mr-2 h-3.5 w-3.5" />
                  Falar com {assessorName === "Assessor" ? "o Assessor" : assessorName} sobre esta pessoa
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => setNovoSeg(true)}>
                <CalendarPlus className="mr-2 h-3.5 w-3.5" /> Adicionar seguimento
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => setEditar(true)}>
                <Pencil className="mr-2 h-3.5 w-3.5" /> Editar dados
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem className="text-destructive" onSelect={() => void apagar()}>
                <Trash2 className="mr-2 h-3.5 w-3.5" /> Eliminar
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        }
      />

      {/* Identidade e contacto, em leitura */}
      <div className="c-muted mb-4 flex flex-wrap items-center gap-3 text-xs">
        <Badge variant="secondary">{pessoa.relacao}</Badge>
        {pessoa.telefone && <span className="c-mono flex items-center gap-1"><Phone className="h-3 w-3" />{pessoa.telefone}</span>}
        {pessoa.email && <span className="flex items-center gap-1"><Mail className="h-3 w-3" />{pessoa.email}</span>}
        {pessoa.canal && <span className="c-badge">criada via {CANAL_LABEL[pessoa.canal] ?? pessoa.canal}</span>}
      </div>

      {/* Bloco de contexto: quem é, o que procura, último contacto, próximo passo */}
      <Card>
        <CardContent className="grid gap-4 p-4 md:grid-cols-2">
          <div>
            <div className="c-muted text-xs">Quem é</div>
            <div className="text-sm">{pessoa.relacao}</div>
          </div>
          <div>
            <div className="c-muted text-xs">O que procura ou está a vender</div>
            <div className="whitespace-pre-wrap text-sm">
              {pessoa.resumo?.trim() ? pessoa.resumo : <span className="text-muted-foreground">Ainda não sabemos. Conta ao {assessorName} e ele guarda aqui.</span>}
            </div>
          </div>
          <div>
            <div className="c-muted text-xs">Último contacto</div>
            <div className="text-sm">
              {ultimo
                ? `${CANAL_LABEL[ultimo.canal] ?? ultimo.canal} · ${haQuantoTempo(ultimo.data)}`
                : <span className="text-muted-foreground">Sem contactos registados.</span>}
            </div>
          </div>
          <div>
            <div className="c-muted text-xs">Próximo passo</div>
            <div className="text-sm">
              {pessoa.proximaAcao
                ? `${pessoa.proximaAcao}${pessoa.proximaAcaoData ? ` · ${formatData(pessoa.proximaAcaoData)}` : ""}`
                : proximoSeg
                  ? `${proximoSeg.titulo} · ${formatData(proximoSeg.data)}`
                  : <span className="text-muted-foreground">Nada agendado.</span>}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Relacionado com: negócios, imóveis e movimentos */}
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <DealsOf personId={pessoa.id} />
        <PersonExtrasCard personId={pessoa.id} />
      </div>

      <PersonLinkedCard personId={pessoa.id} />

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <Card>
          <CardContent className="p-4">
            <h3 className="mb-3 text-sm font-semibold">Notas recentes ({interPessoa.length})</h3>
            {interPessoa.length === 0 ? (
              <p className="text-sm text-muted-foreground">Sem notas registadas.</p>
            ) : (
              <div className="space-y-2">
                {interPessoa.slice(0, 5).map((i) => (
                  <div key={i.id} className="rounded-lg border border-border p-3 text-sm">
                    <div className="whitespace-pre-wrap">{i.resumo || i.conteudo}</div>
                    <div className="text-xs text-muted-foreground">
                      {formatData(i.data)} · {CANAL_LABEL[i.canal] ?? i.canal}
                    </div>
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
                  <Link
                    key={s.id}
                    to="/seguimentos/$id"
                    params={{ id: s.id }}
                    className="block rounded-lg border border-border p-3 text-sm hover:border-primary/40"
                  >
                    <div>{s.titulo}</div>
                    <div className="text-xs text-muted-foreground">{formatData(s.data)} · {s.estado}</div>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <EntityFilesCard entityType="person" entityId={pessoa.id} />
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
        </CardContent>
      </Card>

      <EditPersonDialog pessoa={pessoa} open={editar} onOpenChange={setEditar} />

      <Dialog open={novoSeg} onOpenChange={setNovoSeg}>
        <DialogContent>
          <DialogHeader><DialogTitle>Adicionar seguimento</DialogTitle></DialogHeader>
          <div className="grid gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="seg-t">O que fazer</Label>
              <Input id="seg-t" value={segTitulo} onChange={(e) => setSegTitulo(e.target.value)} placeholder="Ex: Ligar a confirmar a visita" />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="seg-d">Quando</Label>
              <Input id="seg-d" type="date" value={segData} onChange={(e) => setSegData(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setNovoSeg(false)}>Cancelar</Button>
            <Button onClick={criarSeguimento} disabled={busy}>Criar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
