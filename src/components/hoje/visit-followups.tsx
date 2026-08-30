import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowRight, DoorOpen, Home, User } from "lucide-react";
import { listVisitFollowUps } from "@/lib/people/visit-followups.functions";
import { formatData } from "@/lib/demo-data";

/** Visitas concluídas nos últimos 14 dias e o seguimento que falta em cada uma. */
export function VisitFollowUpsCard() {
  const listFn = useServerFn(listVisitFollowUps);
  const { data } = useQuery({
    queryKey: ["visitas-seguimento"],
    queryFn: () => listFn(),
    staleTime: 5 * 60_000,
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
        {visitas.map((v) => (
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
        ))}
      </CardContent>
    </Card>
  );
}
