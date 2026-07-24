import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppShell, PageHeader } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useStore } from "@/lib/store";
import { formatEUR } from "@/lib/demo-data";
import { toast } from "sonner";
import {
  CalendarPlus, ClipboardList, Coins, MessageSquarePlus, Mic, Receipt, Search, Send, Sparkles, Trash2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { parse, type Extraidos, type Intencao } from "@/lib/assessor/parser";
import { clearMessages, loadMessages, saveMessage, updateMessageStatus, type MensagemDb } from "@/lib/assessor/messages";
import { useIsMobile } from "@/hooks/use-mobile";

export const Route = createFileRoute("/_authenticated/assessor")({
  head: () => ({
    meta: [
      { title: "Assessor — chat com o seu assistente" },
      { name: "description", content: "Registe conversas, seguimentos, despesas e comissões falando com o seu assessor." },
      { property: "og:title", content: "Assessor — chat" },
      { property: "og:description", content: "Registe conversas, seguimentos, despesas e comissões." },
    ],
  }),
  component: AssessorPage,
});

type CartaoTipo = "conversa" | "seguimento" | "despesa" | "comissao" | "briefing" | "procura";
type EstadoCartao = "draft" | "confirmed" | "cancelled";

interface Cartao {
  tipo: CartaoTipo;
  dados: Record<string, unknown>;
  entidadeId?: string;
}

interface Msg {
  id: string;
  role: "user" | "assessor";
  content: string;
  cartao?: Cartao;
  status?: EstadoCartao;
  ts: string;
}

const ACOES: { tipo: CartaoTipo; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { tipo: "conversa", label: "Registar conversa", icon: MessageSquarePlus },
  { tipo: "seguimento", label: "Criar seguimento", icon: CalendarPlus },
  { tipo: "despesa", label: "Registar despesa", icon: Receipt },
  { tipo: "comissao", label: "Registar comissão", icon: Coins },
  { tipo: "briefing", label: "O que tenho hoje?", icon: ClipboardList },
  { tipo: "procura", label: "Procurar informação", icon: Search },
];

function toMsg(m: MensagemDb): Msg {
  const payload = (m.structured_payload ?? null) as Record<string, unknown> | null;
  return {
    id: m.id,
    role: m.role,
    content: m.content,
    cartao: m.message_type && payload
      ? { tipo: m.message_type as CartaoTipo, dados: payload, entidadeId: (payload.__entidadeId as string) || undefined }
      : undefined,
    status: (m.status as EstadoCartao | null) ?? undefined,
    ts: m.created_at,
  };
}

function AssessorPage() {
  const isMobile = useIsMobile();
  const store = useStore();
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [texto, setTexto] = useState("");
  const [carregando, setCarregando] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadMessages().then((rows) => {
      setMsgs(rows.map(toMsg));
      setCarregando(false);
    }).catch((e) => { toast.error((e as Error).message); setCarregando(false); });
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [msgs.length]);

  const pushUser = useCallback(async (content: string) => {
    const row = await saveMessage({ role: "user", content });
    setMsgs((prev) => [...prev, toMsg(row)]);
    return row;
  }, []);

  const pushAssessor = useCallback(async (content: string, cartao?: Cartao) => {
    const row = await saveMessage({
      role: "assessor",
      content,
      message_type: cartao?.tipo ?? null,
      structured_payload: cartao ? cartao.dados : null,
      status: cartao ? "draft" : null,
    });
    setMsgs((prev) => [...prev, toMsg(row)]);
    return row;
  }, []);

  const interpretar = useCallback(async (input: string, intencaoForcada?: Intencao) => {
    const parsed = parse(input);
    const intencao: Intencao = intencaoForcada ?? parsed.intencao;
    const dados = construirDados(intencao, parsed, input);
    const label = LABEL_TIPO[intencao];
    await pushAssessor(`Preparei um rascunho de ${label}. Reveja e confirme.`, { tipo: intencao, dados });
  }, [pushAssessor]);

  const enviar = useCallback(async (input?: string) => {
    const conteudo = (input ?? texto).trim();
    if (!conteudo) return;
    setTexto("");
    try {
      await pushUser(conteudo);
      const parsed = parse(conteudo);
      if (parsed.intencao === "briefing") {
        await pushAssessor("Aqui está o seu dia.", { tipo: "briefing", dados: { texto: conteudo } });
      } else if (parsed.intencao === "procura") {
        await pushAssessor("Resultados da pesquisa:", { tipo: "procura", dados: { termo: conteudo } });
      } else {
        await interpretar(conteudo);
      }
    } catch (e) {
      toast.error((e as Error).message);
    }
  }, [texto, pushUser, pushAssessor, interpretar]);

  const acaoRapida = useCallback(async (tipo: CartaoTipo) => {
    try {
      if (tipo === "briefing") {
        await pushUser("O que tenho hoje?");
        await pushAssessor("Aqui está o seu dia.", { tipo: "briefing", dados: {} });
      } else if (tipo === "procura") {
        await pushUser("Procurar informação");
        await pushAssessor("O que quer procurar?", { tipo: "procura", dados: { termo: "" } });
      } else {
        await pushUser(LABEL_TIPO[tipo]);
        await pushAssessor(`Preencha os dados de ${LABEL_TIPO[tipo]}.`, { tipo, dados: construirDados(tipo, parse(""), "") });
      }
    } catch (e) { toast.error((e as Error).message); }
  }, [pushUser, pushAssessor]);

  const atualizarCartao = useCallback((id: string, patch: Partial<Msg>) => {
    setMsgs((prev) => prev.map((m) => (m.id === id ? { ...m, ...patch, cartao: patch.cartao ?? m.cartao } : m)));
  }, []);

  const confirmarCartao = useCallback(async (msg: Msg, dados: Record<string, unknown>) => {
    if (!msg.cartao) return;
    try {
      const entidadeId = await executarCartao(msg.cartao.tipo, dados, store);
      const payload = { ...dados, ...(entidadeId ? { __entidadeId: entidadeId } : {}) };
      await updateMessageStatus(msg.id, "confirmed", payload);
      atualizarCartao(msg.id, { status: "confirmed", cartao: { ...msg.cartao, dados: payload, entidadeId } });
      toast.success(`${LABEL_TIPO[msg.cartao.tipo]} registado.`);
    } catch (e) { toast.error((e as Error).message); }
  }, [store, atualizarCartao]);

  const cancelarCartao = useCallback(async (msg: Msg) => {
    try {
      await updateMessageStatus(msg.id, "cancelled");
      atualizarCartao(msg.id, { status: "cancelled" });
    } catch (e) { toast.error((e as Error).message); }
  }, [atualizarCartao]);

  const limpar = useCallback(async () => {
    if (!confirm("Apagar toda a conversa com o assessor?")) return;
    try { await clearMessages(); setMsgs([]); toast.success("Conversa apagada."); }
    catch (e) { toast.error((e as Error).message); }
  }, []);

  const conteudo = (
    <div className="grid h-full min-h-0 grid-rows-[minmax(0,1fr)_auto_auto]">
      <div
        ref={scrollRef}
        className="min-h-0 overflow-y-auto px-3 py-4 md:px-6"
        style={{ WebkitOverflowScrolling: "touch" }}
      >
        {carregando && <p className="text-center text-sm text-muted-foreground">A carregar…</p>}
        {!carregando && msgs.length === 0 && (
          <div className="mx-auto max-w-md rounded-2xl border border-border bg-card p-6 text-center">
            <Sparkles className="mx-auto h-6 w-6 text-primary" />
            <p className="mt-3 text-sm font-medium">Olá. Sou o seu assessor.</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Diga o que aconteceu ou o que precisa fazer. Ex: "Ligar à Ana amanhã às 10h", "Paguei 38€ de portagens", "Comissão de 4500€ da venda do T2".
            </p>
          </div>
        )}
        <div className="mx-auto flex max-w-3xl flex-col gap-3">
          {msgs.map((m) => (
            <Balao key={m.id} msg={m}
              onConfirm={(dados) => confirmarCartao(m, dados)}
              onCancel={() => cancelarCartao(m)}
              store={store}
            />
          ))}
        </div>
      </div>
      <div className="border-t border-border bg-background/95 px-3 pt-2 backdrop-blur md:px-6">
        <div className="mx-auto max-w-3xl">
          <div className="flex gap-2 overflow-x-auto pb-1">
            {ACOES.map((a) => (
              <button key={a.tipo} onClick={() => acaoRapida(a.tipo)}
                className="flex shrink-0 items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-xs text-foreground hover:bg-accent">
                <a.icon className="h-3.5 w-3.5" /> {a.label}
              </button>
            ))}
          </div>
        </div>
      </div>
      <div
        className="border-t border-border bg-background/95 px-3 py-2 backdrop-blur md:px-6"
        style={{ paddingBottom: "max(env(safe-area-inset-bottom), 0.5rem)" }}
      >
        <div className="mx-auto max-w-3xl">
          <div className="flex items-end gap-2 rounded-3xl border border-border bg-card px-3 py-1.5">
            <Textarea
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void enviar(); } }}
              placeholder="Escreva ao seu assessor…"
              rows={1}
              className="max-h-32 min-h-[36px] resize-none border-0 bg-transparent p-1 text-base focus-visible:ring-0 focus-visible:ring-offset-0"
            />
            {texto.trim() ? (
              <Button size="icon" className="h-9 w-9 shrink-0 rounded-full" onClick={() => void enviar()}><Send className="h-4 w-4" /></Button>
            ) : (
              <Button size="icon" variant="ghost" className="h-9 w-9 shrink-0 rounded-full" onClick={() => toast.info("Áudio ainda não disponível nesta versão piloto.")}><Mic className="h-4 w-4" /></Button>
            )}
          </div>
          <div className="mt-1 flex justify-between text-[10px] text-muted-foreground">
            <span>Piloto — validação de conceito. Reveja sempre antes de confirmar.</span>
            <button className="hover:text-foreground" onClick={limpar}><Trash2 className="mr-1 inline h-3 w-3" />Limpar</button>
          </div>
        </div>
      </div>
    </div>
  );

  if (isMobile) {
    return (
      <AppShell fullBleed>
        <div className="grid h-full min-h-0 grid-rows-[auto_minmax(0,1fr)]">
          <div className="border-b border-border bg-background px-4 py-2" style={{ paddingTop: "max(env(safe-area-inset-top), 0.5rem)" }}>
            <div className="text-sm font-semibold">Assessor</div>
            <div className="text-[11px] text-muted-foreground">Sempre disponível</div>
          </div>
          <div className="min-h-0">{conteudo}</div>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <PageHeader title="Assessor" subtitle="Fale ou escreva. Eu preparo um rascunho para si confirmar." />
      <div className="h-[calc(100vh-14rem)] rounded-2xl border border-border bg-card">{conteudo}</div>
    </AppShell>
  );
}

const LABEL_TIPO: Record<CartaoTipo, string> = {
  conversa: "conversa",
  seguimento: "seguimento",
  despesa: "despesa",
  comissao: "comissão",
  briefing: "briefing",
  procura: "pesquisa",
};

function construirDados(tipo: CartaoTipo, p: Extraidos, texto: string): Record<string, unknown> {
  const now = new Date();
  const dataDefault = p.data ?? new Date(now.getFullYear(), now.getMonth(), now.getDate(), 9, 0).toISOString();
  switch (tipo) {
    case "seguimento":
      return {
        tipoSeg: p.hora ? "Evento" : "Tarefa",
        titulo: texto || "",
        nomePessoa: p.nome ?? "",
        pessoaId: "",
        data: dataDefault,
        hora: p.hora ?? "",
        prioridade: "Média",
        notas: "",
      };
    case "despesa":
      return {
        descricao: texto || "",
        categoria: p.categoria ?? "Outros",
        valor: p.valor ?? 0,
        data: p.data ?? new Date().toISOString(),
      };
    case "comissao":
      return {
        descricao: texto || "Comissão",
        valor: p.valor ?? 0,
        estado: "Prevista",
        data: p.data ?? new Date().toISOString(),
        oportunidadeId: "",
      };
    case "conversa":
      return {
        nomePessoa: p.nome ?? "",
        pessoaId: "",
        resumo: texto,
        proximaAcao: "",
      };
    default:
      return { texto };
  }
}

async function executarCartao(
  tipo: CartaoTipo,
  dados: Record<string, unknown>,
  store: ReturnType<typeof useStore>,
): Promise<string | undefined> {
  if (tipo === "seguimento") {
    const titulo = String(dados.titulo || "").trim();
    if (!titulo) throw new Error("Título é obrigatório.");
    const s = await store.addSeguimentoReturning({
      tipo: (dados.tipoSeg as "Tarefa" | "Evento") || "Tarefa",
      titulo,
      data: String(dados.data),
      hora: (dados.hora as string) || undefined,
      pessoaId: (dados.pessoaId as string) || undefined,
      prioridade: (dados.prioridade as "Baixa" | "Média" | "Alta") || "Média",
      estado: "Pendente",
      notas: (dados.notas as string) || undefined,
    });
    return s?.id;
  }
  if (tipo === "despesa") {
    const valor = Number(dados.valor);
    if (!valor || valor <= 0) throw new Error("Valor tem de ser maior que zero.");
    const cats = ["Deslocação","Marketing","Escritório","Formação","Outros"] as const;
    const cat = (cats as readonly string[]).includes(String(dados.categoria))
      ? (String(dados.categoria) as typeof cats[number]) : "Outros";
    const d = await store.addDespesaReturning({
      descricao: String(dados.descricao || "Despesa").trim(),
      categoria: cat,
      valor,
      data: String(dados.data),
    });
    return d?.id;
  }
  if (tipo === "comissao") {
    const valor = Number(dados.valor);
    if (!valor || valor <= 0) throw new Error("Valor tem de ser maior que zero.");
    const c = await store.addComissaoReturning({
      descricao: String(dados.descricao || "Comissão"),
      valor,
      estado: (dados.estado as "Prevista" | "Faturada" | "Recebida") || "Prevista",
      data: String(dados.data),
      oportunidadeId: (dados.oportunidadeId as string) || "",
    });
    return c?.id;
  }
  if (tipo === "conversa") {
    const resumo = String(dados.resumo || "").trim();
    if (!resumo) throw new Error("Escreva o resumo da conversa.");
    await store.addInteracao({
      pessoaId: (dados.pessoaId as string) || undefined,
      conteudoOriginal: resumo,
      resumo,
      proximaAcao: (dados.proximaAcao as string) || undefined,
    });
    return undefined;
  }
  return undefined;
}

function Balao({ msg, onConfirm, onCancel, store }: {
  msg: Msg;
  onConfirm: (dados: Record<string, unknown>) => void;
  onCancel: () => void;
  store: ReturnType<typeof useStore>;
}) {
  const isUser = msg.role === "user";
  if (msg.cartao) {
    return <CartaoView msg={msg} onConfirm={onConfirm} onCancel={onCancel} store={store} />;
  }
  return (
    <div className={cn("flex", isUser ? "justify-end" : "justify-start")}>
      <div className={cn("max-w-[85%] rounded-2xl px-4 py-2 text-sm", isUser ? "bg-primary text-primary-foreground" : "bg-muted text-foreground")}>
        {msg.content}
      </div>
    </div>
  );
}

function CartaoView({ msg, onConfirm, onCancel, store }: {
  msg: Msg;
  onConfirm: (dados: Record<string, unknown>) => void;
  onCancel: () => void;
  store: ReturnType<typeof useStore>;
}) {
  const cartao = msg.cartao!;
  const [dados, setDados] = useState<Record<string, unknown>>(cartao.dados);
  const readOnly = msg.status === "confirmed" || msg.status === "cancelled";

  useEffect(() => { setDados(cartao.dados); }, [cartao]);

  const set = (k: string, v: unknown) => setDados((d) => ({ ...d, [k]: v }));

  return (
    <div className="flex justify-start">
      <Card className={cn("w-full max-w-[92%] p-3", msg.status === "cancelled" && "opacity-60", msg.status === "confirmed" && "border-primary/30 bg-primary/5")}>
        <div className="mb-2 flex items-center justify-between">
          <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{LABEL_TIPO[cartao.tipo]}</div>
          {msg.status && <Badge variant={msg.status === "confirmed" ? "default" : "secondary"}>{
            msg.status === "confirmed" ? "Registado" : msg.status === "cancelled" ? "Cancelado" : "Rascunho"
          }</Badge>}
        </div>

        {cartao.tipo === "seguimento" && <FormSeguimento dados={dados} set={set} store={store} readOnly={readOnly} />}
        {cartao.tipo === "despesa" && <FormDespesa dados={dados} set={set} readOnly={readOnly} />}
        {cartao.tipo === "comissao" && <FormComissao dados={dados} set={set} store={store} readOnly={readOnly} />}
        {cartao.tipo === "conversa" && <FormConversa dados={dados} set={set} store={store} readOnly={readOnly} />}
        {cartao.tipo === "briefing" && <BriefingView store={store} />}
        {cartao.tipo === "procura" && <ProcuraView dados={dados} set={set} store={store} />}

        {!readOnly && (cartao.tipo === "seguimento" || cartao.tipo === "despesa" || cartao.tipo === "comissao" || cartao.tipo === "conversa") && (
          <div className="mt-3 flex gap-2">
            <Button size="sm" onClick={() => onConfirm(dados)}>Confirmar</Button>
            <Button size="sm" variant="ghost" onClick={onCancel}>Cancelar</Button>
          </div>
        )}
      </Card>
    </div>
  );
}

// ---------- Sub-formulários ----------

function PessoaPicker({ nome, pessoaId, onChange, store }: {
  nome: string; pessoaId: string;
  onChange: (nome: string, pessoaId: string) => void;
  store: ReturnType<typeof useStore>;
}) {
  const [criando, setCriando] = useState(false);
  const matches = useMemo(() => {
    const q = nome.trim().toLowerCase();
    if (!q) return [];
    return store.pessoas.filter((p) => p.nome.toLowerCase().includes(q)).slice(0, 5);
  }, [nome, store.pessoas]);

  const selecionado = store.pessoas.find((p) => p.id === pessoaId);
  const semMatch = nome.trim().length > 1 && matches.length === 0 && !pessoaId;

  const criar = async () => {
    setCriando(true);
    try {
      const p = await store.addPessoa({ nome: nome.trim(), relacao: "Potencial", telefone: "", email: "", resumo: "" } as never);
      if (p) onChange(p.nome, p.id);
    } catch (e) { toast.error((e as Error).message); }
    finally { setCriando(false); }
  };

  return (
    <div>
      <Label className="text-xs">Pessoa</Label>
      <Input value={nome} onChange={(e) => onChange(e.target.value, "")} placeholder="Nome (opcional)" className="mt-1" />
      {selecionado && <p className="mt-1 text-xs text-primary">Ligado a {selecionado.nome}</p>}
      {!selecionado && matches.length > 0 && (
        <div className="mt-1 flex flex-wrap gap-1">
          {matches.map((p) => (
            <button key={p.id} type="button" onClick={() => onChange(p.nome, p.id)}
              className="rounded-full border border-border px-2 py-0.5 text-xs hover:bg-accent">{p.nome}</button>
          ))}
        </div>
      )}
      {semMatch && (
        <button type="button" onClick={criar} disabled={criando}
          className="mt-1 text-xs text-primary underline">
          {criando ? "A criar…" : `Criar pessoa "${nome.trim()}"`}
        </button>
      )}
    </div>
  );
}

function DateInput({ value, onChange, withTime }: { value: string; onChange: (iso: string) => void; withTime?: boolean }) {
  const d = value ? new Date(value) : new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  return (
    <Input
      type={withTime ? "datetime-local" : "date"}
      value={withTime ? `${yyyy}-${mm}-${dd}T${hh}:${mi}` : `${yyyy}-${mm}-${dd}`}
      onChange={(e) => {
        const v = e.target.value;
        if (!v) return;
        const nd = new Date(v);
        if (!isNaN(nd.getTime())) onChange(nd.toISOString());
      }}
      className="mt-1"
    />
  );
}

function FormSeguimento({ dados, set, store, readOnly }: any) {
  return (
    <div className="grid gap-3">
      <div className="grid grid-cols-2 gap-2">
        <div>
          <Label className="text-xs">Tipo</Label>
          <Select value={String(dados.tipoSeg)} onValueChange={(v) => set("tipoSeg", v)} disabled={readOnly}>
            <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="Tarefa">Tarefa (com prazo)</SelectItem>
              <SelectItem value="Evento">Evento (com hora)</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs">Prioridade</Label>
          <Select value={String(dados.prioridade)} onValueChange={(v) => set("prioridade", v)} disabled={readOnly}>
            <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="Baixa">Baixa</SelectItem>
              <SelectItem value="Média">Média</SelectItem>
              <SelectItem value="Alta">Alta</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <div>
        <Label className="text-xs">Título</Label>
        <Input value={String(dados.titulo)} onChange={(e) => set("titulo", e.target.value)} disabled={readOnly} className="mt-1" />
      </div>
      <PessoaPicker nome={String(dados.nomePessoa || "")} pessoaId={String(dados.pessoaId || "")}
        onChange={(n, id) => { set("nomePessoa", n); set("pessoaId", id); }} store={store} />
      <div className="grid grid-cols-2 gap-2">
        <div>
          <Label className="text-xs">{dados.tipoSeg === "Evento" ? "Data e hora" : "Prazo"}</Label>
          <DateInput value={String(dados.data)} onChange={(iso) => set("data", iso)} withTime={dados.tipoSeg === "Evento"} />
        </div>
        {dados.tipoSeg === "Evento" && (
          <div>
            <Label className="text-xs">Hora (etiqueta)</Label>
            <Input value={String(dados.hora || "")} onChange={(e) => set("hora", e.target.value)} placeholder="HH:mm" disabled={readOnly} className="mt-1" />
          </div>
        )}
      </div>
      <div>
        <Label className="text-xs">Notas</Label>
        <Textarea value={String(dados.notas || "")} onChange={(e) => set("notas", e.target.value)} rows={2} disabled={readOnly} className="mt-1" />
      </div>
    </div>
  );
}

function FormDespesa({ dados, set, readOnly }: any) {
  return (
    <div className="grid gap-3">
      <div>
        <Label className="text-xs">Descrição</Label>
        <Input value={String(dados.descricao)} onChange={(e) => set("descricao", e.target.value)} disabled={readOnly} className="mt-1" />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <Label className="text-xs">Categoria</Label>
          <Select value={String(dados.categoria)} onValueChange={(v) => set("categoria", v)} disabled={readOnly}>
            <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
            <SelectContent>
              {["Deslocação","Marketing","Formação","Escritório","Comissões partilhadas","Outros"].map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs">Valor (€)</Label>
          <Input type="number" step="0.01" value={String(dados.valor)} onChange={(e) => set("valor", Number(e.target.value))} disabled={readOnly} className="mt-1" />
        </div>
      </div>
      <div>
        <Label className="text-xs">Data</Label>
        <DateInput value={String(dados.data)} onChange={(iso) => set("data", iso)} />
      </div>
    </div>
  );
}

function FormComissao({ dados, set, store, readOnly }: any) {
  return (
    <div className="grid gap-3">
      <div>
        <Label className="text-xs">Descrição</Label>
        <Input value={String(dados.descricao)} onChange={(e) => set("descricao", e.target.value)} disabled={readOnly} className="mt-1" />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <Label className="text-xs">Valor (€)</Label>
          <Input type="number" step="0.01" value={String(dados.valor)} onChange={(e) => set("valor", Number(e.target.value))} disabled={readOnly} className="mt-1" />
        </div>
        <div>
          <Label className="text-xs">Estado</Label>
          <Select value={String(dados.estado)} onValueChange={(v) => set("estado", v)} disabled={readOnly}>
            <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="Prevista">Prevista</SelectItem>
              <SelectItem value="Faturada">Faturada</SelectItem>
              <SelectItem value="Recebida">Recebida</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <div>
        <Label className="text-xs">Data</Label>
        <DateInput value={String(dados.data)} onChange={(iso) => set("data", iso)} />
      </div>
      <div>
        <Label className="text-xs">Oportunidade (opcional)</Label>
        <Select value={String(dados.oportunidadeId || "__none")} onValueChange={(v) => set("oportunidadeId", v === "__none" ? "" : v)} disabled={readOnly}>
          <SelectTrigger className="mt-1"><SelectValue placeholder="Nenhuma" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__none">Nenhuma</SelectItem>
            {store.oportunidades.map((o: any) => (
              <SelectItem key={o.id} value={o.id}>{o.tipo} · {formatEUR(o.valor)}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}

function FormConversa({ dados, set, store, readOnly }: any) {
  return (
    <div className="grid gap-3">
      <PessoaPicker nome={String(dados.nomePessoa || "")} pessoaId={String(dados.pessoaId || "")}
        onChange={(n, id) => { set("nomePessoa", n); set("pessoaId", id); }} store={store} />
      <div>
        <Label className="text-xs">Resumo da conversa</Label>
        <Textarea value={String(dados.resumo || "")} onChange={(e) => set("resumo", e.target.value)} rows={3} disabled={readOnly} className="mt-1" />
      </div>
      <div>
        <Label className="text-xs">Próxima ação (opcional)</Label>
        <Input value={String(dados.proximaAcao || "")} onChange={(e) => set("proximaAcao", e.target.value)} disabled={readOnly} className="mt-1" />
      </div>
    </div>
  );
}

function BriefingView({ store }: { store: ReturnType<typeof useStore> }) {
  const now = new Date();
  const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString();
  const eventos = store.seguimentos.filter((s) => s.tipo === "Evento" && sameDay(new Date(s.data), now) && s.estado !== "Concluído");
  const tarefas = store.seguimentos.filter((s) => s.tipo === "Tarefa" && sameDay(new Date(s.data), now) && s.estado !== "Concluído");
  const atrasados = store.seguimentos.filter((s) => s.estado !== "Concluído" && new Date(s.data) < now && !sameDay(new Date(s.data), now));
  const semAcao = store.oportunidades.filter((o) => !o.proximaAcao && o.estado !== "Perdida" && o.estado !== "Escritura");
  const nomeP = (id?: string) => store.pessoas.find((p) => p.id === id)?.nome ?? "";

  return (
    <div className="text-sm">
      <p><strong>{eventos.length}</strong> compromisso(s), <strong>{tarefas.length}</strong> tarefa(s) hoje. <strong>{atrasados.length}</strong> em atraso. <strong>{semAcao.length}</strong> oportunidade(s) sem próxima ação.</p>
      {eventos.length > 0 && (
        <div className="mt-2">
          <div className="text-xs font-medium text-muted-foreground">Compromissos</div>
          <ul className="mt-1 space-y-1">{eventos.map((e) => (
            <li key={e.id} className="text-xs">• {e.hora || ""} {e.titulo} {nomeP(e.pessoaId) && `— ${nomeP(e.pessoaId)}`}</li>
          ))}</ul>
        </div>
      )}
      {tarefas.length > 0 && (
        <div className="mt-2">
          <div className="text-xs font-medium text-muted-foreground">Tarefas</div>
          <ul className="mt-1 space-y-1">{tarefas.map((t) => (
            <li key={t.id} className="text-xs">• {t.titulo} {nomeP(t.pessoaId) && `— ${nomeP(t.pessoaId)}`}</li>
          ))}</ul>
        </div>
      )}
      {store.seguimentos.length === 0 && store.oportunidades.length === 0 && (
        <p className="mt-2 text-xs text-muted-foreground">Ainda não há dados. Comece por registar uma conversa ou criar um seguimento.</p>
      )}
    </div>
  );
}

function ProcuraView({ dados, set, store }: any) {
  const termo = String(dados.termo || "").trim().toLowerCase();
  const pessoas = termo ? store.pessoas.filter((p: any) => (p.nome + " " + (p.email || "") + " " + (p.telefone || "")).toLowerCase().includes(termo)).slice(0, 5) : [];
  const oport = termo ? store.oportunidades.filter((o: any) => (o.tipo + " " + (o.notas || "")).toLowerCase().includes(termo)).slice(0, 5) : [];
  const seg = termo ? store.seguimentos.filter((s: any) => s.titulo.toLowerCase().includes(termo)).slice(0, 5) : [];
  const imo = termo ? store.imoveis.filter((i: any) => (i.titulo + " " + (i.localizacao || "")).toLowerCase().includes(termo)).slice(0, 5) : [];

  return (
    <div>
      <Input value={String(dados.termo || "")} onChange={(e) => set("termo", e.target.value)} placeholder="Procurar em pessoas, oportunidades, seguimentos, imóveis…" />
      {termo && (
        <div className="mt-3 space-y-2 text-xs">
          {pessoas.length > 0 && <ResultadoBloco titulo="Pessoas" items={pessoas.map((p: any) => `${p.nome} · ${p.telefone || p.email || ""}`)} />}
          {oport.length > 0 && <ResultadoBloco titulo="Oportunidades" items={oport.map((o: any) => `${o.tipo} · ${formatEUR(o.valor)} · ${o.estado}`)} />}
          {seg.length > 0 && <ResultadoBloco titulo="Seguimentos" items={seg.map((s: any) => s.titulo)} />}
          {imo.length > 0 && <ResultadoBloco titulo="Imóveis" items={imo.map((i: any) => `${i.titulo} · ${i.localizacao || ""}`)} />}
          {pessoas.length + oport.length + seg.length + imo.length === 0 && <p className="text-muted-foreground">Nada encontrado.</p>}
        </div>
      )}
    </div>
  );
}

function ResultadoBloco({ titulo, items }: { titulo: string; items: string[] }) {
  return (
    <div>
      <div className="font-medium text-muted-foreground">{titulo}</div>
      <ul className="mt-1 space-y-0.5">{items.map((s, i) => <li key={i}>• {s}</li>)}</ul>
    </div>
  );
}