import { createFileRoute } from "@tanstack/react-router";
import { AppShell, PageHeader } from "@/components/app-shell";
import { useStore } from "@/lib/store";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FileText, Upload } from "lucide-react";
import { formatData } from "@/lib/demo-data";
import { toast } from "sonner";

export const Route = createFileRoute("/documentos")({
  head: () => ({
    meta: [
      { title: "Documentos — Assessor do Consultor" },
      { name: "description", content: "Documentos do consultor, associados a pessoas e imóveis." },
      { property: "og:title", content: "Documentos — Assessor do Consultor" },
      { property: "og:description", content: "Documentos do consultor, associados a pessoas e imóveis." },
    ],
  }),
  component: DocumentosPage,
});

function DocumentosPage() {
  const { documentos, pessoas, imoveis } = useStore();
  return (
    <AppShell>
      <PageHeader
        title="Documentos"
        subtitle={`${documentos.length} ficheiros`}
        action={
          <Button onClick={() => toast.info("Upload disponível em breve.")}>
            <Upload className="mr-1.5 h-4 w-4" /> Carregar
          </Button>
        }
      />
      <div className="space-y-2">
        {documentos.map((d) => {
          const p = pessoas.find((x) => x.id === d.pessoaId);
          const i = imoveis.find((x) => x.id === d.imovelId);
          return (
            <Card key={d.id}>
              <CardContent className="flex items-center justify-between gap-3 p-3">
                <div className="flex min-w-0 items-center gap-3">
                  <FileText className="h-5 w-5 shrink-0 text-muted-foreground" />
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">{d.nome}</div>
                    <div className="text-xs text-muted-foreground">
                      {formatData(d.dataUpload)}
                      {p && ` · ${p.nome}`}
                      {i && ` · ${i.titulo}`}
                    </div>
                  </div>
                </div>
                <Button variant="ghost" size="sm">Abrir</Button>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </AppShell>
  );
}