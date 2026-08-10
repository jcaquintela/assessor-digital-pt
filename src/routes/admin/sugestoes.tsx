import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { listTeamSuggestions, updateTeamSuggestion } from "@/lib/admin/suggestions.functions";
import type { AdminSuggestion } from "@/lib/admin/suggestions-list.server";

export const Route = createFileRoute("/admin/sugestoes")({
  component: SugestoesPage,
  head: () => ({
    meta: [
      { title: "Sugestões dos consultores · Admin" },
      {
        name: "description",
        content: "Todas as sugestões enviadas pelos consultores, de todos os canais, num só sítio.",
      },
    ],
  }),
});

const CANAL: Record<string, string> = {
  whatsapp: "WhatsApp",
  telegram: "Telegram",
  web: "Dashboard",
  dashboard: "Dashboard",
};

function fmt(d: string) {
  return new Date(d).toLocaleString("pt-PT", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function SugestoesPage() {
  const list = useServerFn(listTeamSuggestions);
  const update = useServerFn(updateTeamSuggestion);
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["admin", "sugestoes"],
    queryFn: () => list(),
  });

  const [tab, setTab] = useState<"por_ler" | "lidas" | "arquivadas" | "todas">("por_ler");
  const [q, setQ] = useState("");
  const [reply, setReply] = useState<AdminSuggestion | null>(null);

  const mut = useMutation({
    mutationFn: (v: { id: string; source: "feedback" | "diversos"; action: "read" | "unread" | "archive" }) =>
      update({ data: v as never }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "sugestoes"] });
      qc.invalidateQueries({ queryKey: ["admin", "sugestoes", "count"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Não consegui atualizar."),
  });

  const all: AdminSuggestion[] = (data as any)?.items ?? [];
  const items = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return all
      .filter((i) => {
        if (tab === "por_ler") return !i.read_at && !i.archived;
        if (tab === "lidas") return !!i.read_at && !i.archived;
        if (tab === "arquivadas") return i.archived;
        return true;
      })
      .filter((i) =>
        !needle
          ? true
          : [i.title, i.body, i.consultant_name, i.consultant_email]
              .filter(Boolean)
              .some((t) => String(t).toLowerCase().includes(needle)),
      );
  }, [all, tab, q]);

  const unread = all.filter((i) => !i.read_at && !i.archived).length;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Sugestões dos consultores</h1>
        <p className="text-sm text-muted-foreground">
          Tudo o que os consultores sugeriram, venha do WhatsApp, do Telegram ou do dashboard —
          incluindo as sugestões antigas que tinham ficado guardadas em Diversos.
        </p>
      </header>

      <div className="flex flex-wrap items-center gap-2">
        {(
          [
            ["por_ler", `Por ler${unread ? ` (${unread})` : ""}`],
            ["lidas", "Lidas"],
            ["arquivadas", "Arquivadas"],
            ["todas", "Todas"],
          ] as const
        ).map(([v, l]) => (
          <Button key={v} size="sm" variant={tab === v ? "default" : "outline"} onClick={() => setTab(v)}>
            {l}
          </Button>
        ))}
        <div className="ml-auto w-full max-w-xs">
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Pesquisar sugestões…" />
        </div>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">A carregar…</p>
      ) : items.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nada nesta vista.</p>
      ) : (
        <div className="grid gap-3">
          {items.map((i) => (
            <article key={`${i.source}:${i.id}`} className="rounded-lg border bg-card p-4">
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <span className="font-medium text-foreground">
                  {i.consultant_name ?? i.consultant_email ?? "Consultor"}
                </span>
                <span>· {CANAL[i.channel] ?? i.channel}</span>
                <span>· {fmt(i.created_at)}</span>
                {i.source === "diversos" ? <span>· registada em Diversos</span> : null}
                <span className="ml-auto rounded-full border px-2 py-0.5">
                  {i.archived ? "Arquivada" : i.read_at ? "Lida" : "Por ler"}
                </span>
              </div>
              <h2 className="mt-2 text-sm font-semibold">{i.title}</h2>
              {i.body && i.body !== i.title ? (
                <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">{i.body}</p>
              ) : null}
              {i.attachments.length > 0 ? (
                <ul className="mt-2 flex flex-wrap gap-2 text-xs">
                  {i.attachments.map((a, n) => (
                    <li key={n}>
                      {a.url ? (
                        <a
                          className="rounded border px-2 py-1 underline-offset-2 hover:underline"
                          href={a.url}
                          target="_blank"
                          rel="noreferrer"
                        >
                          {a.name}
                        </a>
                      ) : (
                        <span className="rounded border px-2 py-1">{a.name}</span>
                      )}
                    </li>
                  ))}
                </ul>
              ) : null}
              <div className="mt-3 flex flex-wrap gap-2">
                {i.read_at ? (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={mut.isPending}
                    onClick={() => mut.mutate({ id: i.id, source: i.source, action: "unread" })}
                  >
                    Repor por ler
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    disabled={mut.isPending}
                    onClick={() => mut.mutate({ id: i.id, source: i.source, action: "read" })}
                  >
                    Marcar como lida
                  </Button>
                )}
                {!i.archived ? (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={mut.isPending}
                    onClick={() => mut.mutate({ id: i.id, source: i.source, action: "archive" })}
                  >
                    Arquivar
                  </Button>
                ) : null}
                <Button size="sm" variant="outline" onClick={() => setReply(i)}>
                  Responder ao consultor
                </Button>
              </div>
            </article>
          ))}
        </div>
      )}

      <ReplyDialog item={reply} onClose={() => setReply(null)} />
    </div>
  );
}

/** Rascunho de resposta: nunca envia sozinho — a equipa copia e envia pelo canal. */
function ReplyDialog({ item, onClose }: { item: AdminSuggestion | null; onClose: () => void }) {
  const [text, setText] = useState("");

  useEffect(() => {
    if (!item) return;
    const nome = (item.consultant_name ?? "").split(" ")[0] ?? "";
    setText(
      `Olá${nome ? ` ${nome}` : ""}, obrigado pela sugestão "${item.title}". Já a lemos e vamos ter em conta na próxima melhoria do Afonso.`,
    );
  }, [item]);

  const phone = (item?.consultant_phone ?? "").replace(/[^\d]/g, "");
  const wa = phone ? `https://wa.me/${phone}?text=${encodeURIComponent(text)}` : null;

  return (
    <Dialog open={!!item} onOpenChange={(o) => (!o ? onClose() : undefined)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Responder ao consultor</DialogTitle>
          <DialogDescription>
            Isto é um rascunho. Nada sai daqui automaticamente — copia e envia pelo canal do
            consultor ({item ? (CANAL[item.channel] ?? item.channel) : ""}).
          </DialogDescription>
        </DialogHeader>
        <Textarea value={text} onChange={(e) => setText(e.target.value)} rows={5} />
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            onClick={async () => {
              await navigator.clipboard.writeText(text);
              toast.success("Mensagem copiada.");
            }}
          >
            Copiar mensagem
          </Button>
          {wa ? (
            <Button size="sm" variant="outline" asChild>
              <a href={wa} target="_blank" rel="noreferrer">
                Abrir no WhatsApp
              </a>
            </Button>
          ) : null}
          <Button size="sm" variant="ghost" onClick={onClose}>
            Fechar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}