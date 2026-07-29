import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { AppShell, PageHeader } from "@/components/app-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { getProperty, updatePropertyFields } from "@/lib/assessor/properties.functions";
import { getUploadedFileSignedUrl } from "@/lib/assessor/files.functions";
import { PROPERTY_STATUSES, propertyStatusLabel } from "@/lib/assessor/properties-status";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatEUR } from "@/lib/demo-data";
import { FileText, ChevronLeft, Eye, Download, Archive } from "lucide-react";
import { TierGate } from "@/components/tier-gate";

export const Route = createFileRoute("/_authenticated/imoveis/$id")({
  head: () => ({
    meta: [
      { title: "Ficha do imóvel — Assessor do Consultor" },
      { name: "description", content: "Detalhes, documentos e seguimentos do imóvel." },
      { property: "og:title", content: "Ficha do imóvel — Assessor do Consultor" },
      { property: "og:description", content: "Detalhes, documentos e seguimentos do imóvel." },
    ],
  }),
  component: () => (
    <TierGate min="consultor" title="Imóveis">
      <PropertyDetail />
    </TierGate>
  ),
});

function PropertyDetail() {
  const { id } = Route.useParams();
  const fetchOne = useServerFn(getProperty);
  const update = useServerFn(updatePropertyFields);
  const signUrl = useServerFn(getUploadedFileSignedUrl);
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { data, isLoading } = useQuery({
    queryKey: ["properties", "one", id],
    queryFn: () => fetchOne({ data: { id } }),
    retry: false,
  });
  const mutation = useMutation({
    mutationFn: (patch: Record<string, unknown>) => update({ data: { id, patch } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["properties"] }),
  });

  const p: any = data?.property;
  const [draft, setDraft] = useState<Record<string, any> | null>(null);
  const editing = draft !== null;
  const editValues = draft ?? (p ?? {});

  if (isLoading) {
    return (
      <AppShell>
        <PageHeader title="Imóvel" />
        <div className="text-sm text-muted-foreground">A carregar...</div>
      </AppShell>
    );
  }
  if (!p) {
    return (
      <AppShell>
        <PageHeader title="Imóvel não encontrado" />
        <div className="text-sm text-muted-foreground">
          Este imóvel não existe ou não tens acesso.{" "}
          <Link to="/imoveis" className="underline">Voltar à lista</Link>.
        </div>
      </AppShell>
    );
  }
  const openFile = async (fid: string) => {
    try {
      const { url } = await signUrl({ data: { id: fid } });
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (e: any) {
      alert(e?.message ?? "Não foi possível abrir o ficheiro.");
    }
  };
  const downloadFile = async (fid: string, name: string) => {
    try {
      const { url } = await signUrl({ data: { id: fid } });
      const a = document.createElement("a");
      a.href = url; a.download = name || "ficheiro"; a.rel = "noopener";
      document.body.appendChild(a); a.click(); a.remove();
    } catch (e: any) {
      alert(e?.message ?? "Não foi possível descarregar.");
    }
  };
  const archive = () => {
    if (!confirm("Arquivar este imóvel?")) return;
    mutation.mutate({ status: "arquivado" }, {
      onSuccess: () => navigate({ to: "/imoveis" }),
    });
  };

  const owner = data?.owner;
  const files = data?.files ?? [];
  const followUps = data?.followUps ?? [];

  const startEdit = () => setDraft({ ...p });
  const cancelEdit = () => setDraft(null);
  const save = () => {
    if (!draft) return;
    const patch: Record<string, unknown> = {};
    for (const k of Object.keys(draft)) {
      if (draft[k] !== p[k]) patch[k] = draft[k];
    }
    if (Object.keys(patch).length === 0) return setDraft(null);
    mutation.mutate(patch, { onSuccess: () => setDraft(null) });
  };

  const field = (label: string, key: string, type: "text" | "number" = "text") => (
    <div className="grid gap-1">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {editing ? (
        <Input
          type={type}
          value={editValues[key] ?? ""}
          onChange={(e) => setDraft({ ...(draft as any), [key]: type === "number" ? (e.target.value === "" ? null : Number(e.target.value)) : e.target.value })}
        />
      ) : (
        <div className="text-sm">
          {key === "asking_price" && p[key] != null ? formatEUR(Number(p[key])) : (p[key] ?? <span className="text-muted-foreground">—</span>)}
        </div>
      )}
    </div>
  );

  const statusField = (
    <div className="grid gap-1">
      <Label className="text-xs text-muted-foreground">Estado</Label>
      {editing ? (
        <Select
          value={editValues.status ?? "em_angariacao"}
          onValueChange={(v) => setDraft({ ...(draft as any), status: v })}
        >
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            {PROPERTY_STATUSES.map((s) => (
              <SelectItem key={s} value={s}>{propertyStatusLabel(s)}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : (
        <div className="text-sm">{propertyStatusLabel(p.status)}</div>
      )}
    </div>
  );

  return (
    <AppShell>
      <div className="mb-2">
        <Link to="/imoveis" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ChevronLeft className="h-4 w-4" /> Imóveis
        </Link>
      </div>
      <PageHeader
        title={p.title}
        subtitle={[p.typology, p.city || p.location].filter(Boolean).join(" · ")}
      />
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Badge variant="outline">{propertyStatusLabel(p.status)}</Badge>
        {p.property_type && <Badge variant="secondary">{p.property_type}</Badge>}
        <div className="ml-auto flex gap-2">
          {!editing && <Button size="sm" variant="outline" onClick={startEdit}>Editar</Button>}
          {p.status !== "arquivado" && (
            <Button size="sm" variant="outline" onClick={archive}>
              <Archive className="mr-1 h-4 w-4" /> Arquivar
            </Button>
          )}
        </div>
      </div>

      <div className="grid gap-3">
        <Card>
          <CardContent className="p-4">
            <div className="mb-3 flex items-center justify-between">
              <div className="text-sm font-semibold">Dados principais</div>
              <div className="flex gap-2">
                {!editing && <Button size="sm" variant="outline" onClick={startEdit}>Editar</Button>}
                {editing && <Button size="sm" variant="ghost" onClick={cancelEdit}>Cancelar</Button>}
                {editing && <Button size="sm" onClick={save} disabled={mutation.isPending}>Guardar</Button>}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
              {field("Título", "title")}
              {field("Tipologia", "typology")}
              {field("Tipo", "property_type")}
              {statusField}
              {field("Cidade", "city")}
              {field("Freguesia", "parish")}
              {field("Morada", "address")}
              {field("Cód. postal", "postal_code")}
              {field("Preço pedido (€)", "asking_price", "number")}
              {field("Valor estimado (€)", "estimated_value", "number")}
              {field("Área útil (m²)", "area_useful", "number")}
              {field("Área bruta (m²)", "area_gross", "number")}
              {field("Quartos", "bedrooms", "number")}
              {field("WCs", "bathrooms", "number")}
              {field("Estacionamento", "parking", "number")}
              {field("Certificado energético", "energy_rating")}
            </div>
            <div className="mt-3">
              <Label className="text-xs text-muted-foreground">Notas</Label>
              {editing ? (
                <Textarea
                  value={editValues.notes ?? ""}
                  onChange={(e) => setDraft({ ...(draft as any), notes: e.target.value })}
                  rows={3}
                />
              ) : (
                <div className="whitespace-pre-wrap text-sm">{p.notes ?? <span className="text-muted-foreground">—</span>}</div>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="mb-2 text-sm font-semibold">Proprietário</div>
            {owner ? (
              <div className="text-sm">{owner.name}</div>
            ) : (
              <div className="text-sm text-muted-foreground">Sem proprietário associado.</div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="mb-2 text-sm font-semibold">Documentos ({files.length})</div>
            {files.length === 0 && <div className="text-sm text-muted-foreground">Sem documentos associados.</div>}
            <div className="grid gap-2">
              {files.map((f: any) => (
                <div key={f.id} className="flex items-start gap-2 rounded-md border p-2">
                  <FileText className="mt-0.5 h-4 w-4 text-muted-foreground shrink-0" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm">{f.original_file_name || "ficheiro"}</div>
                    <div className="text-xs text-muted-foreground">
                      {f.document_type ? <Badge variant="secondary" className="mr-1">{f.document_type}</Badge> : <span className="mr-1 text-muted-foreground">Por classificar</span>}
                      {f.user_description && <span>{f.user_description}</span>}
                    </div>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <Button size="sm" variant="ghost" onClick={() => openFile(f.id)} title="Pré-visualizar">
                      <Eye className="h-4 w-4" />
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => downloadFile(f.id, f.original_file_name)} title="Descarregar">
                      <Download className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="mb-2 text-sm font-semibold">Seguimentos ({followUps.length})</div>
            {followUps.length === 0 && <div className="text-sm text-muted-foreground">Sem seguimentos.</div>}
            <div className="grid gap-2">
              {followUps.map((fu: any) => (
                <div key={fu.id} className="flex items-center justify-between rounded-md border p-2 text-sm">
                  <div className="min-w-0">
                    <div className="truncate">{fu.title}</div>
                    <div className="text-xs text-muted-foreground">
                      {fu.due_date}{fu.due_time ? ` · ${String(fu.due_time).slice(0, 5)}` : ""}
                    </div>
                  </div>
                  <Badge variant="outline">{fu.status}</Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}