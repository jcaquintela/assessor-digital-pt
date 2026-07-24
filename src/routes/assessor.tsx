import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { AppShell, PageHeader } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { useStore } from "@/lib/store";
import { formatDataHora, formatEUR } from "@/lib/demo-data";
import { toast } from "sonner";
import {
  CalendarPlus,
  Check,
  ClipboardList,
  Coins,
  MessageSquarePlus,
  Mic,
  Paperclip,
  Pencil,
  Receipt,
  Search,
  Send,
  Sparkles,
  X,
} from "lucide-react";

export const Route = createFileRoute("/assessor")({
  head: () => ({
    meta: [
      { title: "Assessor — chat" },
      { name: "description", content: "Fale com o seu assessor pessoal digital." },
      { property: "og:title", content: "Assessor — chat" },
      { property: "og:description", content: "Fale com o seu assessor pessoal digital." },
    ],
  }),
  component: AssessorPage,
});

type CartaoTipo =
  | "conversa"
  | "seguimento"
  | "despesa"
  | "comissao"
  | "briefing"
  | "procura";

interface Mensagem {
  id: string;
  autor: "consultor" | "assessor";
  texto?: string;
  cartao?: { tipo: CartaoTipo; dados: Record<string, string> };
  confirmado?: boolean;
  cancelado?: boolean;
}

const acoesRapidas: { tipo: CartaoTipo; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { tipo: "conversa", label: "Registar conversa", icon: MessageSquarePlus },
  { tipo: "seguimento", label: "Criar seguimento", icon: CalendarPlus },
  { tipo: "despesa", label: "Registar despesa", icon: Receipt },
  { tipo: "comissao", label: "Registar comissão", icon: Coins },
  { tipo: "briefing", label: "O que tenho hoje?", icon: ClipboardList },
  { tipo: "procura", label: "Procurar informação", icon: Search },
];

let mid = 0;
const newId = () => `m${++mid}`;

export function AssessorPage() {
  const store = useStore();
  const [mensagens, setMensagens] = useState<Mensagem[]>([
    {
      id: newId(),
      autor: "assessor",
      texto:
        "Olá. Sou o seu assessor. Diga-me o que aconteceu — registo conversas, seguimentos, despesas ou comissões. Também posso preparar o seu dia.",
    },
  ]);
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [mensagens]);

  const responder = (tipo: CartaoTipo, textoConsultor?: string) => {
    if (textoConsultor) {
      setMensagens((m) => [...m, { id: newId(), autor: "consultor", texto: textoConsultor }]);
    }
    setTimeout(() => {
      setMensagens((m) => [...m, { id: newId(), autor: "assessor", cartao: montarCartao(tipo, store) }]);
    }, 300);
  };

  const enviar = () => {
    const t = input.trim();
    if (!t) return;
    setInput("");
    setMensagens((m) => [...m, { id: newId(), autor: "consultor", texto: t }]);
    // INTEGRATION POINT: interpretação NLP real (OpenAI) — por agora heurística simples.
    const lower = t.toLowerCase();
    let tipo: CartaoTipo = "conversa";
    if (lower.includes("despesa") || lower.includes("gasto") || lower.includes("portagem")) tipo = "despesa";
    else if (lower.includes("comissão") || lower.includes("comissao")) tipo = "comissao";
    else if (lower.includes("hoje") || lower.includes("dia")) tipo = "briefing";
    else if (lower.includes("procur") || lower.includes("onde") || lower.includes("quanto")) tipo = "procura";
    else if (lower.includes("liga") || lower.includes("marca") || lower.includes("visita") || lower.includes("enviar")) tipo = "seguimento";
    setTimeout(() => {
      setMensagens((m) => [...m, { id: newId(), autor: "assessor", cartao: montarCartao(tipo, store, t) }]);
    }, 400);

    store.addEntrada({
      canal: "web",
      conteudoOriginal: t,
      interpretacao: tipo,
      confirmado: false,
      data: new Date().toISOString(),
    });
  };

  const confirmar = (id: string) => {
    setMensagens((m) =>
      m.map((msg) => {
        if (msg.id !== id || !msg.cartao) return msg;
        aplicarCartao(msg.cartao, store);
        toast.success("Registado.");
        return { ...msg, confirmado: true };
      }),
    );
  };
  const cancelar = (id: string) => {
    setMensagens((m) => m.map((msg) => (msg.id === id ? { ...msg, cancelado: true } : msg)));
  };

  return (
    <AppShell>
      <PageHeader
        title="Assessor"
        subtitle="O seu assessor digital. Fale como falaria a um colega."
        action={<Badge variant="outline" className="gap-1"><Sparkles className="h-3 w-3" /> modo demo</Badge>}
      />

      <Card className="flex h-[calc(100vh-15rem)] flex-col overflow-hidden md:h-[calc(100vh-14rem)]">
        <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto p-4 md:p-6">
          {mensagens.map((m) => (
            <div key={m.id} className={m.autor === "consultor" ? "flex justify-end" : "flex justify-start"}>
              <div className={m.autor === "consultor" ? "max-w-[80%]" : "max-w-[92%] w-full md:max-w-[80%]"}>
                {m.texto && (
                  <div
                    className={
                      m.autor === "consultor"
                        ? "rounded-2xl rounded-tr-sm bg-primary px-4 py-2 text-sm text-primary-foreground"
                        : "text-sm leading-relaxed text-foreground"
                    }
                  >
                    {m.texto}
                  </div>
                )}
                {m.cartao && !m.cancelado && (
                  <CartaoEstruturado
                    cartao={m.cartao}
                    confirmado={!!m.confirmado}
                    onConfirm={() => confirmar(m.id)}
                    onCancel={() => cancelar(m.id)}
                  />
                )}
                {m.cancelado && (
                  <div className="mt-1 text-xs text-muted-foreground italic">Cancelado.</div>
                )}
              </div>
            </div>
          ))}
        </div>

        <div className="border-t border-border bg-card p-3">
          <div className="mb-2 flex gap-2 overflow-x-auto pb-1">
            {acoesRapidas.map(({ tipo, label, icon: Icon }) => (
              <Button
                key={tipo}
                variant="secondary"
                size="sm"
                className="shrink-0 rounded-full"
                onClick={() => responder(tipo, label)}
              >
                <Icon className="mr-1.5 h-3.5 w-3.5" />
                {label}
              </Button>
            ))}
          </div>
          <div className="flex items-end gap-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => toast.info("Anexos disponíveis em breve.")}
              aria-label="Anexar"
            >
              <Paperclip className="h-5 w-5" />
            </Button>
            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  enviar();
                }
              }}
              placeholder="Escreva algo... por exemplo: “Reunião amanhã 15h com a Ana Silva”"
              rows={1}
              className="min-h-[40px] max-h-32 resize-none"
            />
            <Button
              variant="ghost"
              size="icon"
              onClick={() => toast.info("Gravação de áudio (simulada) — em breve envia por WhatsApp.")}
              aria-label="Gravar áudio"
            >
              <Mic className="h-5 w-5" />
            </Button>
            <Button onClick={enviar} size="icon" aria-label="Enviar">
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </Card>
    </AppShell>
  );
}

function montarCartao(tipo: CartaoTipo, store: ReturnType<typeof useStore>, texto?: string) {
  const now = new Date();
  const amanha = new Date(now); amanha.setDate(now.getDate() + 1);
  const hora = "15:00";
  const dados: Record<string, string> = {};
  switch (tipo) {
    case "conversa":
      dados["Pessoa"] = "Ana Silva";
      dados["Resumo"] = texto ?? "Conversa breve sobre visita de amanhã.";
      dados["Sentimento"] = "Positivo";
      break;
    case "seguimento":
      dados["Título"] = texto ?? "Ligar a Ana Silva";
      dados["Tipo"] = "Tarefa";
      dados["Data"] = amanha.toLocaleDateString("pt-PT");
      dados["Prioridade"] = "Média";
      break;
    case "despesa":
      dados["Descrição"] = texto ?? "Combustível — visita";
      dados["Categoria"] = "Deslocação";
      dados["Valor"] = formatEUR(42);
      dados["Data"] = now.toLocaleDateString("pt-PT");
      break;
    case "comissao": {
      const op = store.oportunidades[0];
      dados["Oportunidade"] = op ? `${op.tipo} — ${store.pessoas.find(p => p.id === op.pessoaId)?.nome ?? ""}` : "—";
      dados["Valor"] = formatEUR(9450);
      dados["Estado"] = "Prevista";
      dados["Data prevista"] = new Date(now.getFullYear(), now.getMonth() + 1, 15).toLocaleDateString("pt-PT");
      break;
    }
    case "briefing": {
      const eventos = store.seguimentos.filter((s) => s.tipo === "Evento" && sameDay(new Date(s.data), now) && s.estado !== "Concluído");
      const atrasados = store.seguimentos.filter((s) => s.estado !== "Concluído" && new Date(s.data) < now && !sameDay(new Date(s.data), now));
      dados["Compromissos"] = String(eventos.length);
      dados["Próximo"] = eventos[0] ? `${eventos[0].hora} · ${eventos[0].titulo}` : "sem compromissos";
      dados["Atrasados"] = String(atrasados.length);
      dados["Foco"] = "Confirmar visita das 10:30 com a Ana Silva";
      break;
    }
    case "procura":
      dados["Consulta"] = texto ?? "T2 Alvalade";
      dados["Resultados"] = "3 imóveis, 2 pessoas, 1 oportunidade";
      dados["Sugestão"] = "Abrir T2 Rua João Saraiva";
      break;
  }
  return { tipo, dados };
}

function sameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function aplicarCartao(cartao: { tipo: CartaoTipo; dados: Record<string, string> }, store: ReturnType<typeof useStore>) {
  const now = new Date().toISOString();
  if (cartao.tipo === "seguimento") {
    store.addSeguimento({
      tipo: "Tarefa",
      titulo: cartao.dados["Título"] ?? "Novo seguimento",
      data: now,
      estado: "Pendente",
      prioridade: "Média",
    });
  } else if (cartao.tipo === "despesa") {
    store.addDespesa({
      descricao: cartao.dados["Descrição"] ?? "Despesa",
      categoria: "Deslocação",
      valor: 42,
      data: now,
    });
  } else if (cartao.tipo === "comissao") {
    store.addComissao({
      oportunidadeId: store.oportunidades[0]?.id ?? "",
      valor: 9450,
      data: now,
      estado: "Prevista",
    });
  }
}

const tituloCartao: Record<CartaoTipo, string> = {
  conversa: "Registo de conversa",
  seguimento: "Novo seguimento",
  despesa: "Nova despesa",
  comissao: "Nova comissão",
  briefing: "O seu dia",
  procura: "Resultados",
};

function CartaoEstruturado({
  cartao,
  confirmado,
  onConfirm,
  onCancel,
}: {
  cartao: { tipo: CartaoTipo; dados: Record<string, string> };
  confirmado: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Card className="mt-2 border-border bg-card p-4">
      <div className="mb-2 flex items-center justify-between">
        <div className="text-sm font-medium">{tituloCartao[cartao.tipo]}</div>
        <span className="text-xs text-muted-foreground">{formatDataHora(new Date().toISOString())}</span>
      </div>
      <dl className="grid grid-cols-1 gap-1.5 text-sm sm:grid-cols-[auto_1fr] sm:gap-x-4">
        {Object.entries(cartao.dados).map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="text-muted-foreground">{k}</dt>
            <dd className="font-medium">{v}</dd>
          </div>
        ))}
      </dl>
      {!confirmado ? (
        <div className="mt-4 flex flex-wrap gap-2">
          <Button size="sm" onClick={onConfirm}><Check className="mr-1 h-4 w-4" /> Confirmar</Button>
          <Button size="sm" variant="outline"><Pencil className="mr-1 h-4 w-4" /> Editar</Button>
          <Button size="sm" variant="ghost" onClick={onCancel}><X className="mr-1 h-4 w-4" /> Cancelar</Button>
        </div>
      ) : (
        <div className="mt-3 text-xs text-primary flex items-center gap-1"><Check className="h-3.5 w-3.5" /> Confirmado</div>
      )}
    </Card>
  );
}