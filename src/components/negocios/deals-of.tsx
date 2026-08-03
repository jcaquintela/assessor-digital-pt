// Negócios ligados a uma pessoa ou a um imóvel. Usado nas fichas para que
// o consultor veja sempre o fio condutor, não registos soltos.
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Handshake, Loader2 } from "lucide-react";
import { formatData, formatEUR } from "@/lib/demo-data";
import { listDealsFor } from "@/lib/deals/deals.functions";
import { KIND_LABEL, STAGE_LABEL } from "@/lib/deals/stages";

export function DealsOf({ personId, propertyId }: { personId?: string; propertyId?: string }) {
  const fn = useServerFn(listDealsFor);
  const { data, isLoading } = useQuery({
    queryKey: ["deals-of", personId ?? null, propertyId ?? null],
    queryFn: () => fn({ data: { personId, propertyId } }),
    retry: false,
  });
  const deals = (data ?? []).filter((d) => !d.archivedAt);

  return (
    <Card>
      <CardContent className="p-4">
        <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold">
          <Handshake className="h-4 w-4 text-muted-foreground" /> Negócios ({deals.length})
          {isLoading && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
        </h3>
        {!isLoading && deals.length === 0 ? (
          <p className="text-sm text-muted-foreground">Sem negócios ligados.</p>
        ) : (
          <div className="space-y-2">
            {deals.map((d) => (
              <Link
                key={d.id}
                to="/negocios/$id"
                params={{ id: d.id }}
                className="block rounded-lg border border-border p-3 text-sm hover:border-primary/40"
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="min-w-0 truncate font-medium">{d.title}</span>
                  <Badge variant="secondary" className="shrink-0">{STAGE_LABEL[d.stage]}</Badge>
                </div>
                <div className="mt-0.5 text-xs text-muted-foreground">
                  {[KIND_LABEL[d.kind], formatEUR(d.value), d.nextAction ? `Próx.: ${d.nextAction}${d.nextActionAt ? ` · ${formatData(d.nextActionAt)}` : ""}` : null]
                    .filter(Boolean).join(" · ")}
                </div>
              </Link>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
