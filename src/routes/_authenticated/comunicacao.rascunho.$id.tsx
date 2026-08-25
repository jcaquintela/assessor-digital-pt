import { appTitle } from "@/lib/brand";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AppShell, PageHeader } from "@/components/app-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { ChevronLeft, Save, Ban, RotateCcw } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { cancelEmailDraft, restartEmailDraft } from "@/lib/email/drafts.functions";

export const Route = createFileRoute("/_authenticated/comunicacao/rascunho/$id")({
  head: () => ({
    meta: [
      { title: appTitle("Rascunho de email") },
      {
        name: "description",
        content: "Revê e ajusta o rascunho de resposta antes de autorizares o envio.",
      },
      { property: "og:title", content: appTitle("Rascunho de email") },
      {
        property: "og:description",
        content: "Edita o texto da resposta preparada. O envio continua a ser a tua decisão.",
      },
      { property: "og:type", content: "article" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: RascunhoPage,
});

type Draft = {
  id: string;
  provider: string;
  to_name: string | null;
  to_emails: string[] | null;
  subject: string | null;
  body: string;
  status: string;
  sent_at: string | null;
  cancelled_at: string | null;
  expires_at: string | null;
};

const STATUS_LABEL: Record<string, string> = {
  pending: "À espera da tua palavra",
  confirmed: "Autorizado",
  sent: "Autorizado e concluído",
  discarded: "Descartado",
  cancelled: "Cancelado",
};

function RascunhoPage() {
  const { id } = Route.useParams();
  const qc = useQueryClient();
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");

  const q = useQuery({
    queryKey: ["email-draft", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("email_drafts")
        .select(
          "id,provider,to_name,to_emails,subject,body,status,sent_at,cancelled_at,expires_at",
        )
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      return (data as unknown as Draft) ?? null;
    },
  });

  useEffect(() => {
    if (q.data) {
      setSubject(q.data.subject ?? "");
      setBody(q.data.body ?? "");
    }
  }, [q.data]);

  const cancelled = q.data ? q.data.status === "cancelled" || Boolean(q.data.cancelled_at) : false;
  const locked = q.data
    ? q.data.status === "sent" || q.data.status === "confirmed" || cancelled
    : true;

  const cancelFn = useServerFn(cancelEmailDraft);
  const cancel = useMutation({
    mutationFn: async () => cancelFn({ data: { draftId: id } }),
    onSuccess: (res: { status: string }) => {
      if (res.status === "already_sent") {
        toast.error("Este email já tinha seguido — não há nada para cancelar.");
      } else {
        toast.success("Rascunho cancelado. Já não pode ser confirmado.");
      }
      void qc.invalidateQueries({ queryKey: ["email-draft", id] });
      void qc.invalidateQueries({ queryKey: ["email-drafts"] });
    },
    onError: (e: unknown) =>
      toast.error(e instanceof Error ? e.message : "Não deu para cancelar."),
  });

  const restartFn = useServerFn(restartEmailDraft);
  const navigate = Route.useNavigate();
  const restart = useMutation({
    mutationFn: async () => restartFn({ data: { draftId: id, subject, body } }),
    onSuccess: (res: { status: string; draftId?: string }) => {
      if (res.status === "created" && res.draftId) {
        toast.success("Novo rascunho criado com o teu texto.");
        void qc.invalidateQueries({ queryKey: ["email-drafts"] });
        void navigate({
          to: "/comunicacao/rascunho/$id",
          params: { id: res.draftId },
        });
      } else {
        toast.error("Não deu para recomeçar este rascunho.");
      }
    },
    onError: (e: unknown) =>
      toast.error(e instanceof Error ? e.message : "Não deu para recomeçar."),
  });

  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("email_drafts")
        .update({ subject, body } as never)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Rascunho atualizado.");
      void qc.invalidateQueries({ queryKey: ["email-draft", id] });
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Não deu para guardar."),
  });

  return (
    <AppShell>
      <div className="mb-4">
        <Button variant="ghost" size="sm" asChild>
          <Link to="/comunicacao">
            <ChevronLeft className="mr-1 h-4 w-4" aria-hidden />
            Comunicação
          </Link>
        </Button>
      </div>
      <PageHeader
        title="Rascunho de resposta"
        subtitle="Ajusta o texto se quiseres. O envio só acontece quando disseres “enviar”."
      />
      {q.isLoading ? (
        <p className="text-sm text-muted-foreground">A carregar…</p>
      ) : !q.data ? (
        <p className="text-sm text-muted-foreground">Não encontrei este rascunho.</p>
      ) : (
        <Card>
          <CardContent className="space-y-4 py-5">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={q.data.status === "sent" ? "default" : "secondary"}>
                {STATUS_LABEL[q.data.status] ?? q.data.status}
              </Badge>
              <span className="text-xs text-muted-foreground">
                Para {q.data.to_name || q.data.to_emails?.[0] || "—"}
              </span>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="assunto">Assunto</Label>
              <Input
                id="assunto"
                value={subject}
                disabled={locked}
                onChange={(e) => setSubject(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="corpo">Texto</Label>
              <Textarea
                id="corpo"
                rows={14}
                value={body}
                disabled={locked}
                onChange={(e) => setBody(e.target.value)}
              />
            </div>
            {cancelled ? (
              <div className="space-y-3 rounded-md border border-destructive/40 bg-destructive/5 p-4">
                <div className="flex items-start gap-2">
                  <Ban className="mt-0.5 h-4 w-4 text-destructive" aria-hidden />
                  <div className="space-y-1">
                    <p className="text-sm font-medium">Rascunho cancelado</p>
                    <p className="text-xs text-muted-foreground">
                      Este rascunho ficou fechado: não podes editá-lo nem autorizá-lo, e dizer
                      “enviar” na conversa também não o desbloqueia. Se ainda quiseres responder,
                      posso abrir um novo rascunho com este texto já preenchido.
                    </p>
                  </div>
                </div>
                <Button onClick={() => restart.mutate()} disabled={restart.isPending}>
                  <RotateCcw className="mr-1 h-4 w-4" aria-hidden />
                  Criar novo rascunho com este texto
                </Button>
              </div>
            ) : locked ? (
              <p className="text-xs text-muted-foreground">
                Já autorizaste este rascunho, por isso ficou fechado a alterações.
              </p>
            ) : (
              <div className="flex flex-wrap items-center gap-2">
                <Button onClick={() => save.mutate()} disabled={save.isPending}>
                  <Save className="mr-1 h-4 w-4" aria-hidden />
                  Guardar alterações
                </Button>
                <Button
                  variant="outline"
                  onClick={() => cancel.mutate()}
                  disabled={cancel.isPending}
                >
                  <Ban className="mr-1 h-4 w-4" aria-hidden />
                  Cancelar rascunho
                </Button>
                <span className="text-xs text-muted-foreground">
                  Depois volta à conversa e diz “enviar”.
                </span>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </AppShell>
  );
}
