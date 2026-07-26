import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Download, Trash2, FileText, Image as ImageIcon, Mic, File as FileIcon } from "lucide-react";
import {
  listUploadedFiles,
  getUploadedFileSignedUrl,
  deleteUploadedFile,
} from "@/lib/assessor/files.functions";

function iconFor(mime: string) {
  if (mime.startsWith("audio/")) return <Mic className="h-4 w-4" />;
  if (mime.startsWith("image/")) return <ImageIcon className="h-4 w-4" />;
  if (mime === "application/pdf" || mime.includes("wordprocessingml"))
    return <FileText className="h-4 w-4" />;
  return <FileIcon className="h-4 w-4" />;
}

function formatSize(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} kB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export function UploadedFilesList() {
  const qc = useQueryClient();
  const list = useServerFn(listUploadedFiles);
  const sign = useServerFn(getUploadedFileSignedUrl);
  const del = useServerFn(deleteUploadedFile);

  const files = useQuery({
    queryKey: ["uploaded-files"],
    queryFn: () => list(),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => del({ data: { id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["uploaded-files"] }),
    onError: (e: any) => toast.error(e?.message ?? "Erro ao eliminar."),
  });

  async function open(id: string) {
    try {
      const r = await sign({ data: { id } });
      window.open(r.url, "_blank", "noopener,noreferrer");
    } catch (e: any) {
      toast.error(e?.message ?? "Erro ao abrir ficheiro.");
    }
  }

  if (files.isLoading) return <p className="text-sm text-muted-foreground">A carregar ficheiros…</p>;
  const rows = (files.data ?? []) as any[];
  if (rows.length === 0) {
    return (
      <Card>
        <CardContent className="p-6 text-sm text-muted-foreground">
          Nenhum ficheiro recebido. Envia uma foto, PDF ou mensagem de voz pelo WhatsApp para o
          teu Assessor.
        </CardContent>
      </Card>
    );
  }
  return (
    <div className="grid gap-2">
      {rows.map((r) => (
        <Card key={r.id}>
          <CardContent className="flex flex-wrap items-center gap-3 p-3">
            <div className="rounded-md bg-muted p-2">{iconFor(r.mime_type)}</div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{r.original_file_name || "(sem nome)"}</p>
              <p className="text-xs text-muted-foreground">
                {r.mime_type} · {formatSize(Number(r.size_bytes ?? 0))} ·{" "}
                {new Date(r.created_at).toLocaleString("pt-PT", {
                  day: "2-digit",
                  month: "short",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </p>
              {r.error_message ? (
                <p className="mt-1 text-xs text-destructive">{r.error_message}</p>
              ) : null}
            </div>
            <Badge variant="outline" className="text-[10px] uppercase">{r.channel}</Badge>
            <Badge
              variant={r.processing_status === "failed" ? "destructive" : "secondary"}
              className="text-[10px]"
            >
              {r.processing_status}
            </Badge>
            {r.classification ? <Badge className="text-[10px]">{r.classification}</Badge> : null}
            {r.storage_path ? (
              <Button size="sm" variant="outline" onClick={() => open(r.id)}>
                <Download className="mr-1 h-3.5 w-3.5" /> Abrir
              </Button>
            ) : null}
            <Button
              size="sm"
              variant="ghost"
              className="text-destructive"
              onClick={() => remove.mutate(r.id)}
            >
              <Trash2 className="mr-1 h-3.5 w-3.5" /> Eliminar
            </Button>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}