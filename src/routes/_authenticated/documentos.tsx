import { createFileRoute, Link } from "@tanstack/react-router";
import { AppShell, PageHeader } from "@/components/app-shell";
import { useStore } from "@/lib/store";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FileText, Upload } from "lucide-react";
import { formatData } from "@/lib/demo-data";
import { toast } from "sonner";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { driveQuotaSummary } from "@/lib/drive/drive.functions";
import { usePreviewTier } from "@/lib/subscription/tier-preview";

export const Route = createFileRoute("/_authenticated/documentos")({
  head: () => ({
    meta: [
      { title: "Documentos — Afonso" },
      { name: "description", content: "Documentos do consultor, associados a pessoas e imóveis." },
      { property: "og:title", content: "Documentos — Afonso" },
      { property: "og:description", content: "Documentos do consultor, associados a pessoas e imóveis." },
    ],
  }),
  component: DocumentosPage,
});

function QuotaSummary() {
  const fetchQuota = useServerFn(driveQuotaSummary);
  const previewTier = usePreviewTier();
  const quotaQ = useQuery({
    queryKey: ["drive", "quota", "documentos", previewTier ?? "real"],
    queryFn: () => fetchQuota({ data: { previewTier } }),
  });

  if (!quotaQ.data || quotaQ.data.limit === null) return null;

  const remaining = Math.max(0, quotaQ.data.limit - quotaQ.data.used);
  const pct = Math.min(100, (quotaQ.data.used / quotaQ.data.limit) * 100);

  return (
    <Card className="mb-4">
      <CardContent className="p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-sm font-medium">Ficheiros este mês</div>
            <div className="text-xs text-muted-foreground">
              Plano {quotaQ.data.label}
              {quotaQ.data.preview && (
                <span className="ml-1.5 inline-flex items-center rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                  a simular
                </span>
              )}
              <span className="ml-1.5">· reset no dia 1</span>
            </div>
          </div>
          <div className="text-right">
            <div className="text-sm font-semibold">
              {quotaQ.data.used} de {quotaQ.data.limit}
            </div>
            <div className="text-xs text-muted-foreground">
              {remaining} restantes
            </div>
          </div>
        </div>
        <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-primary/20">
          <div
            className="h-full rounded-full bg-primary transition-all"
            style={{ width: `${pct}%` }}
          />
        </div>
        {quotaQ.data.hint && (
          <div className="mt-2 text-xs text-amber-600 dark:text-amber-400">
            {quotaQ.data.hint}
          </div>
        )}
        {quotaQ.data.hint && (
          <Button asChild size="sm" className="mt-3 w-full sm:w-auto">
            <Link to="/subscricao">Fazer upgrade do plano</Link>
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

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
      <QuotaSummary />
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
