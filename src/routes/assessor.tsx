import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { AppShell, PageHeader } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerClose,
} from "@/components/ui/drawer";
import { useStore } from "@/lib/store";
import { formatDataHora, formatEUR } from "@/lib/demo-data";
import { toast } from "sonner";
import {
  CalendarPlus,
  Check,
  ClipboardList,
  Coins,
  FileText,
  Image as ImageIcon,
  MessageSquarePlus,
  Mic,
  MoreVertical,
  Paperclip,
  Pencil,
  Plus,
  Receipt,
  Search,
  Send,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";

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
  ts: string;
}

const acoesDesktop: { tipo: CartaoTipo; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { tipo: "conversa", label: "Registar conversa", icon: MessageSquarePlus },
  { tipo: "seguimento", label: "Criar seguimento", icon: CalendarPlus },
  { tipo: "despesa", label: "Registar despesa", icon: Receipt },
  { tipo: "comissao", label: "Registar comissão", icon: Coins },
  { tipo: "briefing", label: "O que tenho hoje?", icon: ClipboardList },
  { tipo: "procura", label: "Procurar informação", icon: Search },
];

const sugestoesIniciais: { tipo: CartaoTipo; label: string }[] = [
  { tipo: "conversa", label: "Registar conversa" },
  { tipo: "seguimento", label: "Criar seguimento" },
  { tipo: "despesa", label: "Registar despesa" },
  { tipo: "briefing", label: "Ver o meu dia" },
];

const sugestoesContextuais: Record<CartaoTipo, { tipo: CartaoTipo; label: string }[]> = {
  seguimento: [
    { tipo: "seguimento", label: "Reagendar" },
    { tipo: "conversa", label: "Associar pessoa" },
    { tipo: "briefing", label: "Ver seguimentos" },
  ],
  conversa: [
    { tipo: "seguimento", label: "Criar seguimento" },
    { tipo: "despesa", label: "Registar despesa" },
  ],
  despesa: [
    { tipo: "despesa", label: "Nova despesa" },
    { tipo: "briefing", label: "Ver o meu dia" },
  ],
  comissao: [
    { tipo: "briefing", label: "Ver o meu dia" },
  ],
  briefing: [
    { tipo: "seguimento", label: "Criar seguimento" },
    { tipo: "conversa", label: "Registar conversa" },
  ],
  procura: [
    { tipo: "seguimento", label: "Criar seguimento" },
    { tipo: "conversa", label: "Registar conversa" },
  ],
};

let mid = 0;
const newId = () => `m${++mid}`;
const nowIso = () => new Date().toISOString();

export function AssessorPage() {
  const store = useStore();
  const [mensagens, setMensagens] = useState<Mensagem[]>([
    {
      id: newId(),
      autor: "assessor",
      texto: "Olá, Júlio. O que queres registar ou consultar?",
      ts: nowIso(),
    },
  ]);
  const [input, setInput] = useState("");
  const [ultimoTipo, setUltimoTipo] = useState<CartaoTipo | null>(null);
  const scrollDesktop = useRef<HTMLDivElement>(null);
  const scrollMobile = useRef<HTMLDivElement>(null);

  useEffect(() => {
    for (const r of [scrollDesktop, scrollMobile]) {
      r.current?.scrollTo({ top: r.current.scrollHeight, behavior: "smooth" });
    }
  }, [mensagens]);

  const responder = (tipo: CartaoTipo, textoConsultor?: string) => {
    if (textoConsultor) {
      setMensagens((m) => [...m, { id: newId(), autor: "consultor", texto: textoConsultor, ts: nowIso() }]);
    }
    setTimeout(() => {
      setMensagens((m) => [...m, { id: newId(), autor: "assessor", cartao: montarCartao(tipo, store), ts: nowIso() }]);
      setUltimoTipo(tipo);
    }, 300);
  };

  const enviar = (textoOverride?: string) => {
    const t = (textoOverride ?? input).trim();
    if (!t) return;
    setInput("");
    setMensagens((m) => [...m, { id: newId(), autor: "consultor", texto: t, ts: nowIso() }]);
    const lower = t.toLowerCase();
    let tipo: CartaoTipo = "conversa";
    if (lower.includes("despesa") || lower.includes("gasto") || lower.includes("portagem")) tipo = "despesa";
    else if (lower.includes("comissão") || lower.includes("comissao")) tipo = "comissao";
    else if (lower.includes("hoje") || lower.includes("dia")) tipo = "briefing";
    else if (lower.includes("procur") || lower.includes("onde") || lower.includes("quanto")) tipo = "procura";
    else if (lower.includes("liga") || lower.includes("marca") || lower.includes("visita") || lower.includes("enviar")) tipo = "seguimento";
    setTimeout(() => {
      setMensagens((m) => [...m, { id: newId(), autor: "assessor", cartao: montarCartao(tipo, store, t), ts: nowIso() }]);
      setUltimoTipo(tipo);
    }, 400);

    store.addEntrada({
      canal: "web",
      conteudoOriginal: t,
      interpretacao: tipo,
      confirmado: false,
      data: nowIso(),
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

  const mensagensComSeparadores = useMemo(() => inserirSeparadores(mensagens), [mensagens]);
  const conversaComecou = mensagens.length > 1;

  return (
    <>
      {/* ========== MOBILE ========== */}
      <div className="md:hidden">
        <MobileAssessorLayout
          scrollRef={scrollMobile}
          mensagens={mensagensComSeparadores}
          onConfirm={confirmar}
          onCancel={cancelar}
          onSend={enviar}
          input={input}
          setInput={setInput}
          onQuickAction={responder}
          mostrarSugestoesIniciais={!conversaComecou}
          sugestoesContextuais={ultimoTipo ? sugestoesContextuais[ultimoTipo] : []}
        />
      </div>

      {/* ========== DESKTOP ========== */}
      <div className="hidden md:block">
        <AppShell>
          <PageHeader
            title="Assessor"
            subtitle="O seu assessor digital. Fale como falaria a um colega."
            action={<Badge variant="outline" className="gap-1"><Sparkles className="h-3 w-3" /> modo demo</Badge>}
          />
          <Card className="flex h-[calc(100vh-14rem)] flex-col overflow-hidden">
            <div ref={scrollDesktop} className="flex-1 space-y-4 overflow-y-auto p-6">
              {mensagens.map((m) => (
                <DesktopMessageRow
                  key={m.id}
                  m={m}
                  onConfirm={() => confirmar(m.id)}
                  onCancel={() => cancelar(m.id)}
                />
              ))}
            </div>
            <div className="border-t border-border bg-card p-3">
              <div className="mb-2 flex gap-2 overflow-x-auto pb-1">
                {acoesDesktop.map(({ tipo, label, icon: Icon }) => (
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
                <Button variant="ghost" size="icon" onClick={() => toast.info("Anexos em breve.")} aria-label="Anexar">
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
                  placeholder='Escreva algo… por ex.: "Reunião amanhã 15h com a Ana Silva"'
                  rows={1}
                  className="min-h-[40px] max-h-32 resize-none"
                />
                <Button variant="ghost" size="icon" onClick={() => toast.info("Áudio em breve.")} aria-label="Gravar áudio">
                  <Mic className="h-5 w-5" />
                </Button>
                <Button onClick={() => enviar()} size="icon" aria-label="Enviar">
                  <Send className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </Card>
        </AppShell>
      </div>
    </>
  );
}

/* ================================================================
   MOBILE LAYOUT — dedicated messaging-app experience
   ================================================================ */

function MobileAssessorLayout({
  scrollRef,
  mensagens,
  onConfirm,
  onCancel,
  onSend,
  input,
  setInput,
  onQuickAction,
  mostrarSugestoesIniciais,
  sugestoesContextuais,
}: {
  scrollRef: React.RefObject<HTMLDivElement | null>;
  mensagens: (Mensagem | { separador: string; id: string })[];
  onConfirm: (id: string) => void;
  onCancel: (id: string) => void;
  onSend: (t?: string) => void;
  input: string;
  setInput: (v: string) => void;
  onQuickAction: (tipo: CartaoTipo, label: string) => void;
  mostrarSugestoesIniciais: boolean;
  sugestoesContextuais: { tipo: CartaoTipo; label: string }[];
}) {
  const [attachOpen, setAttachOpen] = useState(false);
  const [recording, setRecording] = useState(false);
  const [recSeconds, setRecSeconds] = useState(0);

  useEffect(() => {
    if (!recording) return;
    setRecSeconds(0);
    const t = setInterval(() => setRecSeconds((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [recording]);

  const NAV_H = "3.25rem";
  const HEADER_TOP = "calc(env(safe-area-inset-top) + 0.5rem)";
  const NAV_BOTTOM = `calc(${NAV_H} + env(safe-area-inset-bottom))`;

  return (
    <div
      className="fixed inset-0 z-10 flex flex-col overflow-hidden bg-[hsl(var(--muted)/0.35)]"
      style={{ height: "100dvh" }}
    >
      {/* Header */}
      <header
        className="flex shrink-0 items-center gap-3 border-b border-border/60 bg-card/95 px-4 backdrop-blur"
        style={{ paddingTop: HEADER_TOP, paddingBottom: "0.5rem" }}
      >
        <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground">
          <Sparkles className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1 leading-tight">
          <div className="truncate text-[15px] font-semibold">Assessor</div>
          <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-500" />
            Disponível
          </div>
        </div>
        <button
          type="button"
          onClick={() => toast.info("Mais opções em breve.")}
          className="grid h-9 w-9 place-items-center rounded-full text-muted-foreground hover:bg-muted"
          aria-label="Mais opções"
        >
          <MoreVertical className="h-5 w-5" />
        </button>
      </header>

      {/* Messages */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto overflow-x-hidden px-3 py-3"
        style={{ paddingBottom: `calc(${NAV_BOTTOM} + 8.5rem)` }}
      >
        <div className="mx-auto flex max-w-[560px] flex-col gap-1">
          {mensagens.map((item) =>
            "separador" in item ? (
              <div key={item.id} className="my-2 flex justify-center">
                <span className="rounded-full bg-background/80 px-2.5 py-0.5 text-[11px] text-muted-foreground shadow-sm">
                  {item.separador}
                </span>
              </div>
            ) : (
              <MobileMessage
                key={item.id}
                m={item}
                onConfirm={() => onConfirm(item.id)}
                onCancel={() => onCancel(item.id)}
              />
            ),
          )}

          {mostrarSugestoesIniciais && (
            <div className="mt-3 flex flex-wrap gap-2 pl-1">
              {sugestoesIniciais.map((s) => (
                <button
                  key={s.label}
                  type="button"
                  onClick={() => onQuickAction(s.tipo, s.label)}
                  className="rounded-full border border-border bg-background px-3 py-1.5 text-[13px] text-foreground shadow-sm active:scale-[0.98]"
                >
                  {s.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Composer + contextual chips (fixed above nav) */}
      <div
        className="pointer-events-none fixed inset-x-0 z-20"
        style={{ bottom: NAV_BOTTOM }}
      >
        {sugestoesContextuais.length > 0 && (
          <div className="pointer-events-auto mb-1 flex gap-2 overflow-x-auto px-3 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {sugestoesContextuais.map((s) => (
              <button
                key={s.label}
                type="button"
                onClick={() => onQuickAction(s.tipo, s.label)}
                className="shrink-0 rounded-full border border-border bg-background/95 px-3 py-1 text-[12.5px] text-muted-foreground shadow-sm backdrop-blur active:scale-[0.98]"
              >
                {s.label}
              </button>
            ))}
          </div>
        )}
        <div className="pointer-events-auto border-t border-border/60 bg-card/95 px-2 py-2 backdrop-blur">
          {recording ? (
            <RecordingBar
              seconds={recSeconds}
              onCancel={() => setRecording(false)}
              onSend={() => {
                setRecording(false);
                onSend(`[Áudio ${formatDuration(recSeconds)}]`);
              }}
            />
          ) : (
            <MobileMessageComposer
              input={input}
              setInput={setInput}
              onSend={() => onSend()}
              onAttach={() => setAttachOpen(true)}
              onStartRecord={() => setRecording(true)}
            />
          )}
        </div>
      </div>

      {/* Bottom nav — mobile-native */}
      <MobileBottomNav />

      {/* Attachments sheet */}
      <Drawer open={attachOpen} onOpenChange={setAttachOpen}>
        <DrawerContent>
          <DrawerHeader className="text-left">
            <DrawerTitle>Anexar</DrawerTitle>
          </DrawerHeader>
          <div className="grid grid-cols-4 gap-3 px-4 pb-6">
            <AttachOption icon={FileText} label="Documento" onSelect={() => handleAttach("Documento", setAttachOpen, onSend)} />
            <AttachOption icon={ImageIcon} label="Fotografia" onSelect={() => handleAttach("Fotografia", setAttachOpen, onSend)} />
            <AttachOption icon={Receipt} label="Recibo" onSelect={() => handleAttach("Recibo", setAttachOpen, onSend)} />
            <AttachOption icon={ImageIcon} label="Galeria" onSelect={() => handleAttach("Galeria", setAttachOpen, onSend)} />
          </div>
          <DrawerClose className="sr-only">Fechar</DrawerClose>
        </DrawerContent>
      </Drawer>
    </div>
  );
}

function handleAttach(
  tipo: string,
  setOpen: (v: boolean) => void,
  onSend: (t?: string) => void,
) {
  setOpen(false);
  onSend(`[Anexo: ${tipo}]`);
}

function AttachOption({
  icon: Icon,
  label,
  onSelect,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className="flex flex-col items-center gap-2 rounded-xl py-3 text-center active:bg-muted"
    >
      <span className="grid h-12 w-12 place-items-center rounded-full bg-muted text-foreground">
        <Icon className="h-5 w-5" />
      </span>
      <span className="text-[12px] text-foreground">{label}</span>
    </button>
  );
}

function MobileMessageComposer({
  input,
  setInput,
  onSend,
  onAttach,
  onStartRecord,
}: {
  input: string;
  setInput: (v: string) => void;
  onSend: () => void;
  onAttach: () => void;
  onStartRecord: () => void;
}) {
  const taRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = Math.min(ta.scrollHeight, 120) + "px";
  }, [input]);
  const hasText = input.trim().length > 0;
  return (
    <div className="flex items-end gap-1.5">
      <button
        type="button"
        onClick={onAttach}
        aria-label="Anexar"
        className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-muted-foreground active:bg-muted"
      >
        <Plus className="h-5 w-5" />
      </button>
      <div className="flex flex-1 items-end rounded-3xl bg-background px-3 py-1.5 shadow-sm ring-1 ring-border">
        <textarea
          ref={taRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Mensagem…"
          rows={1}
          className="max-h-[120px] w-full resize-none bg-transparent py-1.5 text-[15px] leading-snug outline-none placeholder:text-muted-foreground"
        />
      </div>
      {hasText ? (
        <button
          type="button"
          onClick={onSend}
          aria-label="Enviar"
          className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground shadow-sm active:scale-95"
        >
          <Send className="h-4 w-4" />
        </button>
      ) : (
        <button
          type="button"
          onClick={onStartRecord}
          aria-label="Gravar áudio"
          className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground shadow-sm active:scale-95"
        >
          <Mic className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}

function RecordingBar({
  seconds,
  onCancel,
  onSend,
}: {
  seconds: number;
  onCancel: () => void;
  onSend: () => void;
}) {
  return (
    <div className="flex items-center gap-3 px-1">
      <button
        type="button"
        onClick={onCancel}
        aria-label="Cancelar gravação"
        className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-muted-foreground active:bg-muted"
      >
        <Trash2 className="h-5 w-5" />
      </button>
      <div className="flex flex-1 items-center gap-2 rounded-full bg-background px-4 py-2 ring-1 ring-border">
        <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-red-500" />
        <span className="text-[13px] tabular-nums text-foreground">{formatDuration(seconds)}</span>
        <span className="ml-2 truncate text-[12px] text-muted-foreground">a gravar…</span>
      </div>
      <button
        type="button"
        onClick={onSend}
        aria-label="Enviar áudio"
        className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground shadow-sm active:scale-95"
      >
        <Send className="h-4 w-4" />
      </button>
    </div>
  );
}

function formatDuration(s: number) {
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m.toString().padStart(1, "0")}:${r.toString().padStart(2, "0")}`;
}

function MobileMessage({
  m,
  onConfirm,
  onCancel,
}: {
  m: Mensagem;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const isMe = m.autor === "consultor";
  const hora = new Date(m.ts).toLocaleTimeString("pt-PT", { hour: "2-digit", minute: "2-digit" });
  return (
    <div className={cn("flex w-full", isMe ? "justify-end" : "justify-start")}>
      <div className={cn("flex flex-col", isMe ? "items-end max-w-[80%]" : "items-start max-w-[85%]")}>
        {m.texto && (
          <div
            className={cn(
              "rounded-2xl px-3 py-1.5 text-[15px] leading-snug shadow-sm",
              isMe
                ? "rounded-br-md bg-primary text-primary-foreground"
                : "rounded-bl-md bg-card text-foreground ring-1 ring-border/60",
            )}
          >
            {m.texto}
          </div>
        )}
        {m.cartao && !m.cancelado && (
          <MobileActionCard
            cartao={m.cartao}
            confirmado={!!m.confirmado}
            onConfirm={onConfirm}
            onCancel={onCancel}
          />
        )}
        {m.cancelado && (
          <div className="mt-0.5 text-[11px] italic text-muted-foreground">Cancelado</div>
        )}
        <div className="mt-0.5 px-1 text-[10.5px] text-muted-foreground">{hora}</div>
      </div>
    </div>
  );
}

/* Compact structured message rendered inside chat bubble */
function MobileActionCard({
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
  const [menuOpen, setMenuOpen] = useState(false);
  const linhas = resumoCartao(cartao);
  return (
    <div
      className={cn(
        "mt-1 w-full rounded-2xl rounded-bl-md bg-card px-3 py-2.5 shadow-sm ring-1 ring-border/60",
        confirmado && "opacity-90",
      )}
    >
      <div className="mb-1 flex items-center justify-between gap-2">
        <div className="text-[13px] font-semibold text-foreground">{tituloCartao[cartao.tipo]}</div>
        {confirmado && (
          <span className="flex items-center gap-1 text-[11px] text-emerald-600">
            <Check className="h-3 w-3" /> Concluído
          </span>
        )}
      </div>
      <div className="space-y-0.5 text-[13.5px] leading-snug text-foreground">
        {linhas.map((l, i) => (
          <div
            key={i}
            className={cn(
              i === 0 ? "font-medium" : "text-muted-foreground",
              "break-words",
            )}
          >
            {l}
          </div>
        ))}
      </div>
      {!confirmado && (
        <div className="mt-2.5 flex items-center gap-2">
          <Button size="sm" className="h-8 flex-1 rounded-full text-[13px]" onClick={onConfirm}>
            <Check className="mr-1 h-3.5 w-3.5" /> Confirmar
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-8 rounded-full px-3 text-[13px]"
            onClick={() => toast.info("Edição em breve.")}
          >
            <Pencil className="mr-1 h-3.5 w-3.5" /> Editar
          </Button>
          <div className="relative">
            <button
              type="button"
              onClick={() => setMenuOpen((v) => !v)}
              className="grid h-8 w-8 place-items-center rounded-full text-muted-foreground active:bg-muted"
              aria-label="Mais"
            >
              <MoreVertical className="h-4 w-4" />
            </button>
            {menuOpen && (
              <div className="absolute right-0 bottom-9 z-10 w-36 overflow-hidden rounded-xl border border-border bg-card shadow-lg">
                <button
                  type="button"
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-[13px] text-destructive hover:bg-muted"
                  onClick={() => {
                    setMenuOpen(false);
                    onCancel();
                  }}
                >
                  <X className="h-3.5 w-3.5" /> Cancelar
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/* Turn field dict into short human lines */
function resumoCartao(c: { tipo: CartaoTipo; dados: Record<string, string> }): string[] {
  const d = c.dados;
  switch (c.tipo) {
    case "seguimento":
      return [
        d["Título"] ?? "Novo seguimento",
        [d["Pessoa"], d["Data"], d["Hora"]].filter(Boolean).join(" · "),
        d["Prioridade"] ? `Prioridade ${d["Prioridade"].toLowerCase()}` : "",
      ].filter(Boolean);
    case "conversa":
      return [d["Pessoa"] ?? "Conversa", d["Resumo"] ?? "", d["Sentimento"] ? `Sentimento: ${d["Sentimento"].toLowerCase()}` : ""].filter(Boolean);
    case "despesa":
      return [d["Descrição"] ?? "Despesa", `${d["Valor"] ?? ""} · ${d["Categoria"] ?? ""}`, d["Data"] ?? ""].filter(Boolean);
    case "comissao":
      return [d["Oportunidade"] ?? "Comissão", `${d["Valor"] ?? ""} · ${d["Estado"] ?? ""}`, d["Data prevista"] ? `Prevista ${d["Data prevista"]}` : ""].filter(Boolean);
    case "briefing":
      return [
        `${d["Compromissos"] ?? 0} compromisso(s) hoje`,
        d["Próximo"] ? `Próximo: ${d["Próximo"]}` : "",
        d["Atrasados"] && Number(d["Atrasados"]) > 0 ? `${d["Atrasados"]} atrasado(s)` : "",
        d["Foco"] ? `Foco: ${d["Foco"]}` : "",
      ].filter(Boolean);
    case "procura":
      return [d["Consulta"] ?? "", d["Resultados"] ?? "", d["Sugestão"] ? `→ ${d["Sugestão"]}` : ""].filter(Boolean);
  }
}

/* ================================================================
   DATE SEPARATORS
   ================================================================ */

function inserirSeparadores(msgs: Mensagem[]): (Mensagem | { separador: string; id: string })[] {
  const out: (Mensagem | { separador: string; id: string })[] = [];
  let lastKey = "";
  for (const m of msgs) {
    const d = new Date(m.ts);
    const key = d.toDateString();
    if (key !== lastKey) {
      out.push({ separador: rotuloData(d), id: "sep-" + key });
      lastKey = key;
    }
    out.push(m);
  }
  return out;
}

function rotuloData(d: Date): string {
  const now = new Date();
  const yest = new Date(); yest.setDate(now.getDate() - 1);
  if (sameDay(d, now)) return "Hoje";
  if (sameDay(d, yest)) return "Ontem";
  return d.toLocaleDateString("pt-PT", { day: "2-digit", month: "long" });
}

/* ================================================================
   MOBILE BOTTOM NAV — slim
   ================================================================ */

function MobileBottomNav() {
  const items = [
    { to: "/assessor", label: "Assessor", icon: MessageSquarePlus, active: true },
    { to: "/hoje", label: "Hoje", icon: ClipboardList, active: false },
    { to: "/seguimentos", label: "Seguimentos", icon: CalendarPlus, active: false },
    { to: "/mais", label: "Mais", icon: MoreVertical, active: false },
  ];
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-30 border-t border-border/60 bg-card/95 backdrop-blur"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <div className="mx-auto grid max-w-lg grid-cols-4">
        {items.map(({ to, label, icon: Icon, active }) => (
          <a
            key={to}
            href={to}
            className={cn(
              "flex flex-col items-center gap-0.5 py-2 text-[10.5px]",
              active ? "text-primary" : "text-muted-foreground",
            )}
          >
            <Icon className="h-[18px] w-[18px]" />
            <span>{label}</span>
          </a>
        ))}
      </div>
    </nav>
  );
}

/* ================================================================
   DESKTOP MESSAGE ROW — original card-style bubbles
   ================================================================ */

function DesktopMessageRow({
  m,
  onConfirm,
  onCancel,
}: {
  m: Mensagem;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const isMe = m.autor === "consultor";
  return (
    <div className={isMe ? "flex justify-end" : "flex justify-start"}>
      <div className={isMe ? "max-w-[85%]" : "max-w-[80%]"}>
        {m.texto && (
          <div
            className={
              isMe
                ? "rounded-2xl rounded-tr-sm bg-primary px-4 py-2 text-sm text-primary-foreground"
                : "text-sm leading-relaxed text-foreground"
            }
          >
            {m.texto}
          </div>
        )}
        {m.cartao && !m.cancelado && (
          <Card className="mt-2 border-border bg-card p-4">
            <div className="mb-2 flex items-center justify-between gap-2">
              <div className="text-sm font-medium">{tituloCartao[m.cartao.tipo]}</div>
              <span className="text-[11px] text-muted-foreground">{formatDataHora(m.ts)}</span>
            </div>
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
              {Object.entries(m.cartao.dados).map(([k, v]) => (
                <div key={k} className="contents">
                  <dt className="text-muted-foreground">{k}</dt>
                  <dd className="min-w-0 break-words font-medium">{v}</dd>
                </div>
              ))}
            </dl>
            {!m.confirmado ? (
              <div className="mt-4 flex flex-wrap gap-2">
                <Button size="sm" onClick={onConfirm}><Check className="mr-1 h-4 w-4" /> Confirmar</Button>
                <Button size="sm" variant="outline"><Pencil className="mr-1 h-4 w-4" /> Editar</Button>
                <Button size="sm" variant="ghost" onClick={onCancel}><X className="mr-1 h-4 w-4" /> Cancelar</Button>
              </div>
            ) : (
              <div className="mt-3 flex items-center gap-1 text-xs text-primary"><Check className="h-3.5 w-3.5" /> Confirmado</div>
            )}
          </Card>
        )}
        {m.cancelado && <div className="mt-1 text-xs italic text-muted-foreground">Cancelado.</div>}
      </div>
    </div>
  );
}

/* ================================================================
   CARD BUILDERS
   ================================================================ */

function montarCartao(tipo: CartaoTipo, store: ReturnType<typeof useStore>, texto?: string) {
  const now = new Date();
  const amanha = new Date(now); amanha.setDate(now.getDate() + 1);
  const dados: Record<string, string> = {};
  switch (tipo) {
    case "conversa":
      dados["Pessoa"] = "Ana Silva";
      dados["Resumo"] = texto ?? "Conversa breve sobre visita de amanhã.";
      dados["Sentimento"] = "Positivo";
      break;
    case "seguimento":
      dados["Título"] = texto ?? "Ligar a Ana Silva";
      dados["Pessoa"] = "Ana Silva";
      dados["Tipo"] = "Tarefa";
      dados["Data"] = amanha.toLocaleDateString("pt-PT");
      dados["Hora"] = "10:00";
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
      dados["Oportunidade"] = op ? `${op.tipo} — ${store.pessoas.find((p) => p.id === op.pessoaId)?.nome ?? ""}` : "—";
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
  const now = nowIso();
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
  conversa: "Conversa registada",
  seguimento: "Seguimento criado",
  despesa: "Despesa registada",
  comissao: "Comissão registada",
  briefing: "O seu dia",
  procura: "Resultados",
};
