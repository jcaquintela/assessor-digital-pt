// Documentos de uma ficha. Mostra tudo o que está ligado — direta ou
// indiretamente (um documento do Negócio aparece na Pessoa e no Imóvel desse
// negócio, sem precisar de estar ligado três vezes).
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { FileText } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { listEntityFiles } from "@/lib/drive/drive.functions";

export function EntityFilesCard({
  entityType,
  entityId,
  className,
  cardIdFor,
  highlightId,
  ringClass,
}: {
  entityType: "person" | "property" | "opportunity";
  entityId: string;
  className?: string;
  cardIdFor?: (id: string) => string;
  highlightId?: string | null;
  ringClass?: string;
}) {
  const fetchFiles = useServerFn(listEntityFiles);
  const q = useQuery({
    queryKey: ["entity-files", entityType, entityId],
    queryFn: () => fetchFiles({ data: { entityType, entityId } }),
  });
  const files = q.data ?? [];

  return (
    <Card className={className}>
      <CardContent className="p-4">
        <h3 className="mb-3 text-sm font-semibold">Documentos ({files.length})</h3>
        {q.isLoading ? (
          <p className="text-sm text-muted-foreground">A carregar…</p>
        ) : files.length === 0 ? (
          <p className="text-sm text-muted-foreground">Sem documentos.</p>
        ) : (
          <div className="space-y-2">
            {files.map((f: any) => {
              const id = cardIdFor?.(f.id);
              return (
                <Link
                  key={f.id}
                  to="/drive/$id"
                  params={{ id: f.id }}
                  id={id}
                  className={
                    "flex items-start gap-2 rounded-lg border border-border p-3 text-sm hover:bg-muted/50 " +
                    (id && highlightId === id ? (ringClass ?? "") : "")
                  }
                >
                  <FileText className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                  <span className="min-w-0">
                    <span className="block truncate">{f.name ?? "Documento"}</span>
                    {f.via && (
                      <span className="text-xs text-muted-foreground">
                        via {f.via.label}
                      </span>
                    )}
                  </span>
                </Link>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}