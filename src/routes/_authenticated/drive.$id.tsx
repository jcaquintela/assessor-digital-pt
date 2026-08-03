import { MODULE_NAME, moduleTitle } from "@/lib/seo/module-names";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AppShell, PageHeader } from "@/components/app-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  getDriveFile,
  setDriveFileStatus,
  removeFileLink,
} from "@/lib/drive/drive.functions";
import { FixLinkDialog } from "@/components/drive/fix-link-dialog";
import { useState } from "react";
import {
  ChevronLeft,
  Download,
  Archive,
  ArchiveRestore,
  Trash2,
  ExternalLink,
  X,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/drive/$id")({
  head: () => ({
    meta: [
      { title: moduleTitle("drive", "Ficheiro") },
      { name: "description", content: `Detalhe do ficheiro no ${MODULE_NAME.drive}.` },
    ],
  }),
  component: DriveDetail,
});

const ENTITY_TARGET: Record<string, (id: string) => { to: string; params: any }> = {
  person: (id) => ({ to: "/pessoas/$id", params: { id } }),
  property: (id) => ({ to: "/imoveis/$id", params: { id } }),
  opportunity: (id) => ({ to: "/negocios/$id", params: { id } }),
  follow_up: (id) => ({ to: "/seguimentos/$id", params: { id } }),
  miscellaneous: (id) => ({ to: "/diversos/$id", params: { id } }),
  prospecting_lead: (id) => ({ to: "/oportunidades/prospecao/$id", params: { id } }),
  interaction: (id) => ({ to: "/interacoes/$id", params: { id } }),
};

const ENTITY_LABEL: Record<string, string> = {
  person: "Pessoa",
  property: "Imóvel",
  opportunity: "Oportunidade",
  follow_up: "Seguimento",
  miscellaneous: "Diversos",
  prospecting_lead: "Prospeção",
  interaction: "Interação",
};

function DriveDetail() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const fetchOne = useServerFn(getDriveFile);
  const setStatus = useServerFn(setDriveFileStatus);
  const removeLink = useServerFn(removeFileLink);
  const [fixOpen, setFixOpen] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["drive", "one", id],
    queryFn: () => fetchOne({ data: { id } }),
    retry: false,
  });

  const statusMut = useMutation({
    mutationFn: (action: "archive" | "unarchive" | "delete") =>
      setStatus({ data: { id, action } }),
    onSuccess: (_r, action) => {
      qc.invalidateQueries({ queryKey: ["drive"] });
      if (action === "delete") navigate({ to: "/drive" });
      else toast.success(action === "archive" ? "Arquivado." : "Restaurado.");
    },
    onError: (e: any) => toast.error(e?.message ?? "Erro."),
  });

  const linkMut = useMutation({
    mutationFn: (linkId: string) => removeLink({ data: { linkId } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["drive", "one", id] }),
  });

  if (isLoading) {
    return (
      <AppShell>
        <PageHeader title="Ficheiro" />
        <div className="text-sm text-muted-foreground">A carregar…</div>
      </AppShell>
    );
  }

  const file: any = data?.file;
  if (!file) {
    return (
      <AppShell>
        <PageHeader title="Ficheiro não encontrado" />
        <Link to="/drive" className="text-sm underline">
          Voltar ao {MODULE_NAME.drive}
        </Link>
      </AppShell>
    );
  }

  const isImage = file.mime_type?.startsWith("image/");
  const isPdf = file.mime_type === "application/pdf";
  const signedUrl = data?.signedUrl ?? null;

  return (
    <AppShell>
      <div className="mb-3">
        <Link to="/drive" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ChevronLeft className="h-4 w-4" /> {MODULE_NAME.drive}
        </Link>
      </div>
      <PageHeader
        title={file.original_file_name ?? "Ficheiro"}
        subtitle={
          [
            file.document_type ?? file.classification ?? "Ficheiro",
            file.channel,
            new Date(file.created_at).toLocaleString("pt-PT"),
          ]
            .filter(Boolean)
            .join(" · ")
        }
        action={
          <div className="flex gap-2">
            {signedUrl && (
              <>
                <Button variant="outline" size="sm" asChild>
                  <a href={signedUrl} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="mr-1.5 h-4 w-4" /> Abrir
                  </a>
                </Button>
                <Button variant="outline" size="sm" asChild>
                  <a href={signedUrl} download={file.original_file_name ?? "ficheiro"}>
                    <Download className="mr-1.5 h-4 w-4" /> Descarregar
                  </a>
                </Button>
              </>
            )}
            {file.archived_at ? (
              <Button variant="outline" size="sm" onClick={() => statusMut.mutate("unarchive")}>
                <ArchiveRestore className="mr-1.5 h-4 w-4" /> Restaurar
              </Button>
            ) : (
              <Button variant="outline" size="sm" onClick={() => statusMut.mutate("archive")}>
                <Archive className="mr-1.5 h-4 w-4" /> Arquivar
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                if (confirm("Eliminar este ficheiro?")) statusMut.mutate("delete");
              }}
            >
              <Trash2 className="mr-1.5 h-4 w-4" /> Eliminar
            </Button>
          </div>
        }
      />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <Card>
          <CardContent className="p-3">
            {signedUrl && isImage && (
              <img src={signedUrl} alt={file.original_file_name ?? ""} className="mx-auto max-h-[70vh] rounded" />
            )}
            {signedUrl && isPdf && (
              <iframe
                title={file.original_file_name ?? "PDF"}
                src={signedUrl}
                className="h-[70vh] w-full rounded"
              />
            )}
            {!isImage && !isPdf && (
              <div className="p-4 text-sm text-muted-foreground">
                Pré-visualização não disponível para este formato. Usa Descarregar ou Abrir.
              </div>
            )}
          </CardContent>
        </Card>

        <div className="space-y-4">
          {file.ai_summary && (
            <Card>
              <CardContent className="p-4">
                <div className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Resumo
                </div>
                <p className="text-sm">{file.ai_summary}</p>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardContent className="p-4">
              <div className="mb-2 flex items-center justify-between">
                <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Relações
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-xs">
                    {data?.links.length ?? 0}
                  </Badge>
                  <Button variant="outline" size="sm" onClick={() => setFixOpen(true)}>
                    Corrigir ligação
                  </Button>
                </div>
              </div>
              {(!data?.links || data.links.length === 0) && (
                <p className="text-sm text-muted-foreground">
                  Ainda não está associado a nenhuma ficha. Podes pedir ao assessor para o organizar.
                </p>
              )}
              <ul className="space-y-1.5">
                {data?.links.map((l: any) => {
                  const target = ENTITY_TARGET[l.entity_type]?.(l.entity_id);
                  return (
                    <li key={l.id} className="flex items-center justify-between gap-2 rounded border p-2 text-sm">
                      <div className="min-w-0">
                        <div className="truncate">
                          {target ? (
                            <Link to={target.to} params={target.params} className="hover:underline">
                              {l.entity_name ?? ENTITY_LABEL[l.entity_type]}
                            </Link>
                          ) : (
                            l.entity_name ?? ENTITY_LABEL[l.entity_type]
                          )}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {ENTITY_LABEL[l.entity_type] ?? l.entity_type} · {l.relation_type}
                        </div>
                      </div>
                      <button
                        aria-label="Remover ligação"
                        className="rounded p-1 text-muted-foreground hover:bg-muted"
                        onClick={() => linkMut.mutate(l.id)}
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </li>
                  );
                })}
              </ul>
            </CardContent>
          </Card>

          {file.extracted_text && (
            <Card>
              <CardContent className="p-4">
                <div className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Texto extraído
                </div>
                <pre className="max-h-64 overflow-auto whitespace-pre-wrap text-xs text-muted-foreground">
                  {file.extracted_text}
                </pre>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      <FixLinkDialog
        fileId={id}
        fileName={file.original_file_name}
        open={fixOpen}
        onOpenChange={setFixOpen}
      />
    </AppShell>
  );
}