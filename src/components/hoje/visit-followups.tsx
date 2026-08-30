import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ArrowRight, Check, DoorOpen, Home, User } from "lucide-react";
import {
  completeVisitFollowUp, listVisitFollowUps,
} from "@/lib/people/visit-followups.functions";
import { formatData } from "@/lib/demo-data";

/** Visitas concluídas nos últimos 14 dias e o seguimento que falta em cada uma. */
export function VisitFollowUpsCard() {
  const listFn = useServerFn(listVisitFollowUps);
  const completeFn = useServerFn(completeVisitFollowUp);
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ["visitas-seguimento"],
    queryFn: () => listFn(),
    staleTime: 5 * 60_000,
  });
  // Só uma nota aberta de cada vez: o cartão não é um formulário.
  const [abertoId, setAbertoId] = useState<string | null>(null);
  const [nota, setNota] = useState("");

  const concluir = useMutation({
    mutationFn: (v: {
      followUpId: string | null; note: string | null;
      personId: string | null; propertyId: string | null;
    }) => completeFn({ data: v }),
    onSuccess: (res) => {
      setAbertoId(null);
      setNota("");
      toast.success(
        res.completed
          ? res.noted ? "Seguimento concluído e nota registada." : "Seguimento concluído."
          : "Nota registada.",
      );
      qc.invalidateQueries({ queryKey: ["visitas-seguimento"] });
      qc.invalidateQueries({ queryKey: ["prioridades"] });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const visitas = data ?? [];
  if (!visitas.length) return null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <DoorOpen className="h-4 w-4" /> Visitas concluídas
          <Badge variant="secondary">{visitas.length}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {visitas.map((v) => {
          const aberto = abertoId === v.visitId;
          const aGravar = concluir.isPending && aberto;
          return (
            <div key={v.visitId} className="rounded-lg border p-3">
              <div className="flex flex-wrap items-center gap-2 text-sm">
                {v.personName && (
                  <span className="inline-flex items-center gap-1 font-medium">
                    <User className="h-3.5 w-3.5" /> {v.personName}
                  </span>
                )}
                {v.propertyLabel && (
                  <span className="inline-flex items-center gap-1 text-muted-foreground">
                    <Home className="h-3.5 w-3.5" /> {v.propertyLabel}
                  </span>
                )}
                {v.occurredAt && (
                  <span className="text-muted-foreground">· {formatData(v.occurredAt)}</span>
                )}
              </div>
              <p className="mt-1 text-sm text-muted-foreground">{v.summary}</p>
              <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                {v.pending ? (
                  <span className="text-sm">
                    Seguimento marcado: {v.pending.title}
                    {v.pending.dueDate ? ` · ${formatData(v.pending.dueDate)}` : ""}
                  </span>
                ) : (
                  <Badge variant="destructive">Sem seguimento marcado</Badge>
                )}
                <div className="flex flex-wrap items-center gap-1">
                  <Button
                    variant={aberto ? "secondary" : "ghost"}
                    size="sm"
                    className="gap-1 px-2"
                    onClick={() => {
                      setAbertoId(aberto ? null : v.visitId);
                      setNota("");
                    }}
                  >
                    <Check className="h-3.5 w-3.5" />
                    {v.pending ? "Concluir" : "Registar nota"}
                  </Button>
                  <Button asChild variant="ghost" size="sm" className="gap-1 px-2">
                    <Link
                      to={v.pending ? "/seguimentos/$id" : v.personId ? "/pessoas/$id" : "/seguimentos"}
                      params={{ id: (v.pending ? v.pending.id : v.personId) ?? "" } as never}
                    >
                      Abrir <ArrowRight className="h-3.5 w-3.5" />
                    </Link>
                  </Button>
                </div>
              </div>

              {aberto && (
                <div className="mt-3 space-y-2">
                  <Textarea
                    value={nota}
                    onChange={(e) => setNota(e.target.value)}
                    rows={2}
                    maxLength={600}
                    placeholder="Nota curta: o que ficou desta visita? (opcional)"
                  />
                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      disabled={aGravar || (!v.pending && !nota.trim())}
                      onClick={() =>
                        concluir.mutate({
                          followUpId: v.pending?.id ?? null,
                          note: nota.trim() || null,
                          personId: v.personId,
                          propertyId: v.propertyId,
                        })
                      }
                    >
                      {aGravar ? "A guardar…" : v.pending ? "Marcar como concluído" : "Guardar nota"}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={aGravar}
                      onClick={() => { setAbertoId(null); setNota(""); }}
                    >
                      Cancelar
                    </Button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
