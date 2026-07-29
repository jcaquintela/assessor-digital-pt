import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useRef, useState } from "react";
import { AppShell, PageHeader } from "@/components/app-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Camera, ChevronRight, ImagePlus, Loader2, Sparkles } from "lucide-react";
import {
  analyzeProspectingImage, analyzeProspectingText,
  createProspectingLead, listProspectingLeads,
  LISTING_LABEL, SOURCE_LABEL, STATUS_LABEL, type LeadStatus,
} from "@/lib/prospecting/prospecting.functions";
import { supabase } from "@/integrations/supabase/client";
import { formatData } from "@/lib/demo-data";
import { TierGate } from "@/components/tier-gate";

export const Route = createFileRoute("/_authenticated/oportunidades/prospecao")({
  head: () => ({
    meta: [
      { title: "Prospeção — Placas e leads" },
      { name: "description", content: "Regista placas fotografadas na rua e números captados para contactar mais tarde." },
      { property: "og:title", content: "Prospeção — Assessor do Consultor" },
      { property: "og:description", content: "Placas na rua e leads para contactar." },
    ],
  }),
  component: () => (
    <TierGate min="consultor" title="Prospeção">
      <ProspecaoPage />
    </TierGate>
  ),
});

const GROUPS: LeadStatus[] = ["to_contact", "contact_attempted", "contacted", "opportunity", "converted", "no_interest", "archived"];

function ProspecaoPage() {
  const listFn = useServerFn(listProspectingLeads);
  const { data: leads = [], isLoading } = useQuery({
    queryKey: ["prospecting", "list"],
    queryFn: () => listFn(),
  });
  const [open, setOpen] = useState(false);

  const grouped = useMemo(() => {
    const g: Record<LeadStatus, any[]> = {
      to_contact: [], contact_attempted: [], contacted: [], no_interest: [],
      opportunity: [], converted: [], archived: [],
    };
    for (const l of leads) g[(l.status as LeadStatus) ?? "to_contact"].push(l);
    return g;
  }, [leads]);

  return (
    <AppShell>
      <PageHeader
        title="Prospeção"
        subtitle={`${leads.length} placa${leads.length === 1 ? "" : "s"} e leads`}
        action={<Button onClick={() => setOpen(true)}><Camera className="mr-1 h-4 w-4" /> Nova placa</Button>}
      />
      {isLoading && <p className="text-sm text-muted-foreground">A carregar…</p>}
      {!isLoading && leads.length === 0 && (
        <Card className="border-dashed">
          <CardContent className="p-6 text-center text-sm text-muted-foreground">
            Ainda não registaste nenhuma placa. Envia uma foto ou escreve o número.
            <div className="mt-3">
              <Button size="sm" onClick={() => setOpen(true)}><Camera className="mr-1 h-4 w-4" /> Registar primeira</Button>
            </div>
          </CardContent>
        </Card>
      )}
      {GROUPS.map((s) => {
        const arr = grouped[s];
        if (!arr.length) return null;
        return (
          <section key={s} className="mb-6">
            <h2 className="mb-2 text-sm font-medium text-muted-foreground">{STATUS_LABEL[s]} · {arr.length}</h2>
            <div className="grid gap-3 md:grid-cols-2">
              {arr.map((l) => <LeadCard key={l.id} lead={l} />)}
            </div>
          </section>
        );
      })}
      <NewLeadDialog open={open} onOpenChange={setOpen} />
    </AppShell>
  );
}

function LeadCard({ lead }: { lead: any }) {
  return (
    <Link to="/oportunidades/prospecao/$id" params={{ id: lead.id }} className="block">
      <Card className="transition-colors hover:border-primary/40">
        <CardContent className="p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="text-xs uppercase tracking-wide text-muted-foreground">
                {SOURCE_LABEL[lead.source_type] ?? "Prospeção"}
              </div>
              <div className="truncate text-sm font-semibold">{lead.title}</div>
              <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                {lead.phone && <span>📞 {lead.phone}</span>}
                {lead.location && <span>📍 {lead.location}</span>}
                {lead.agency_name && <span>🏷 {lead.agency_name}</span>}
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                <Badge variant="outline">{STATUS_LABEL[lead.status as LeadStatus] ?? lead.status}</Badge>
                {lead.listing_type && lead.listing_type !== "unknown" && (
                  <Badge variant="secondary">{LISTING_LABEL[lead.listing_type]}</Badge>
                )}
                {lead.next_follow_up_at && (
                  <span className="text-xs text-muted-foreground">Lembrete {formatData(lead.next_follow_up_at)}</span>
                )}
              </div>
            </div>
            <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
          </div>
          <div className="mt-2 text-xs text-muted-foreground">Registado {formatData(lead.created_at)}</div>
        </CardContent>
      </Card>
    </Link>
  );
}

// ─── Diálogo: nova placa (texto ou fotografia) ──────────────────────────────

function NewLeadDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const qc = useQueryClient();
  const analyzeText = useServerFn(analyzeProspectingText);
  const analyzeImg = useServerFn(analyzeProspectingImage);
  const createFn = useServerFn(createProspectingLead);
  const fileRef = useRef<HTMLInputElement>(null);
  const [text, setText] = useState("");
  const [analyzing, setAnalyzing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [imageFileId, setImageFileId] = useState<string | null>(null);
  const [preview, setPreview] = useState<{
    phone: string | null; location: string | null; agency_name: string | null;
    source_type: string; listing_type: string; confidence: number; reasons: string[];
    notes?: string; raw_text?: string;
  } | null>(null);

  const reset = () => {
    setText(""); setPreview(null); setImageFileId(null);
    setAnalyzing(false); setUploading(false);
  };

  const analyzeFromText = async () => {
    if (!text.trim()) return;
    setAnalyzing(true);
    try {
      const r = await analyzeText({ data: { text } });
      setPreview({
        phone: r.phone, location: r.location, agency_name: r.agency_name,
        source_type: r.source_type, listing_type: r.listing_type,
        confidence: r.confidence, reasons: r.reasons, notes: text,
      });
      if (!r.matched && !r.phone) {
        toast.warning("Não detetei um número claro. Podes preencher manualmente.");
      }
    } catch (e) { toast.error((e as Error).message); }
    finally { setAnalyzing(false); }
  };

  const handleFile = async (file: File) => {
    setUploading(true);
    try {
      const { data: userRes } = await supabase.auth.getUser();
      const uid = userRes.user?.id;
      if (!uid) throw new Error("Sem sessão.");
      const ext = file.name.split(".").pop() ?? "jpg";
      const path = `${uid}/prospecting/${crypto.randomUUID()}.${ext}`;
      const { error: upErr } = await supabase.storage.from("assessor-files")
        .upload(path, file, { contentType: file.type, upsert: false });
      if (upErr) throw new Error(upErr.message);
      const { data: fileRow, error: insErr } = await supabase
        .from("uploaded_files")
        .insert({
          user_id: uid,
          channel: "web",
          original_file_name: file.name,
          internal_file_name: path.split("/").pop()!,
          mime_type: file.type || "image/jpeg",
          size_bytes: file.size,
          storage_path: path,
          processing_status: "uploaded",
          classification: "prospecting_sign",
          user_description: "Placa de prospeção",
        } as never)
        .select("id").single();
      if (insErr) throw new Error(insErr.message);
      const fid = (fileRow as any).id as string;
      setImageFileId(fid);
      setAnalyzing(true);
      const r = await analyzeImg({ data: { file_id: fid } });
      setPreview({
        phone: r.phone, location: null, agency_name: r.agency_name,
        source_type: "street_sign", listing_type: r.listing_type,
        confidence: r.confidence,
        reasons: [
          r.phone ? "número lido da placa" : "número não legível",
          r.agency_name ? `agência: ${r.agency_name}` : "",
          r.listing_type === "owner_sale" ? "indícios de venda pelo próprio" : "",
        ].filter(Boolean),
        raw_text: r.raw_text,
      });
    } catch (e) { toast.error((e as Error).message); }
    finally { setUploading(false); setAnalyzing(false); }
  };

  const create = useMutation({
    mutationFn: async () => {
      if (!preview) throw new Error("Nada para registar.");
      return createFn({
        data: {
          title: null,
          phone: preview.phone,
          location: preview.location,
          source_type: preview.source_type,
          listing_type: preview.listing_type,
          agency_name: preview.agency_name,
          notes: preview.notes ?? (preview.raw_text ? `Placa lida: ${preview.raw_text}` : null),
          source_channel: "web",
          image_file_id: imageFileId,
          extraction_confidence: preview.confidence,
          extraction_raw: preview as any,
        } as any,
      });
    },
    onSuccess: (r: any) => {
      qc.invalidateQueries({ queryKey: ["prospecting"] });
      if (r.duplicate) {
        toast.warning(`Já tinhas uma placa registada com este número${r.existing?.location ? ` em ${r.existing.location}` : ""}. Abre para conferir.`);
      } else {
        toast.success("Placa registada.");
      }
      onOpenChange(false); reset();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) reset(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Nova placa de prospeção</DialogTitle>
          <DialogDescription>Envia a fotografia ou escreve o que viste. Reviso contigo antes de guardar.</DialogDescription>
        </DialogHeader>

        {!preview && (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Fotografia da placa</Label>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
              />
              <Button
                variant="outline"
                className="w-full"
                onClick={() => fileRef.current?.click()}
                disabled={uploading || analyzing}
              >
                {uploading || analyzing
                  ? <><Loader2 className="mr-1 h-4 w-4 animate-spin" /> A analisar…</>
                  : <><ImagePlus className="mr-1 h-4 w-4" /> Escolher foto</>}
              </Button>
            </div>
            <div className="relative py-1 text-center text-xs uppercase tracking-wide text-muted-foreground">
              <span className="bg-background px-2">ou descreve por texto</span>
              <div className="absolute inset-x-0 top-1/2 -z-10 h-px bg-border" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="text">O que viste na placa</Label>
              <Textarea
                id="text"
                rows={3}
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="Ex: Placa de venda em Canelas, 926 123 456."
              />
              <Button onClick={analyzeFromText} disabled={!text.trim() || analyzing}>
                {analyzing ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Sparkles className="mr-1 h-4 w-4" />}
                Analisar
              </Button>
            </div>
          </div>
        )}

        {preview && (
          <PreviewForm
            preview={preview}
            setPreview={setPreview}
            confirming={create.isPending}
            onConfirm={() => create.mutate()}
            onCancel={reset}
          />
        )}

        <DialogFooter />
      </DialogContent>
    </Dialog>
  );
}

function PreviewForm({
  preview, setPreview, confirming, onConfirm, onCancel,
}: {
  preview: NonNullable<React.ComponentProps<typeof NewLeadDialog>>[never] extends never ? any : any;
  setPreview: (v: any) => void;
  confirming: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const p = preview;
  const naturalMsg = p.listing_type === "owner_sale"
    ? `Parece ser uma venda pelo próprio${p.location ? ` em ${p.location}` : ""}${p.phone ? ` — ${p.phone}` : ""}. Registo como oportunidade de prospeção?`
    : p.listing_type === "other_agency"
      ? `Parece uma placa da ${p.agency_name ?? "agência"}${p.location ? ` em ${p.location}` : ""}. Registo o imóvel para acompanhamento?`
      : p.phone
        ? `Encontrei o número ${p.phone}${p.location ? ` em ${p.location}` : ""}. Registo para contactares?`
        : "Não consegui identificar tudo. Confirma ou completa antes de guardar.";

  return (
    <div className="space-y-4">
      <div className="rounded-lg bg-primary/5 p-3 text-sm">{naturalMsg}</div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Telefone">
          <Input value={p.phone ?? ""} onChange={(e) => setPreview({ ...p, phone: e.target.value || null })} placeholder="9XX XXX XXX" />
        </Field>
        <Field label="Localização">
          <Input value={p.location ?? ""} onChange={(e) => setPreview({ ...p, location: e.target.value || null })} placeholder="Canelas" />
        </Field>
        <Field label="Agência (se aplicável)">
          <Input value={p.agency_name ?? ""} onChange={(e) => setPreview({ ...p, agency_name: e.target.value || null })} />
        </Field>
        <Field label="Tipo de venda">
          <Select value={p.listing_type} onValueChange={(v) => setPreview({ ...p, listing_type: v })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="owner_sale">Venda pelo proprietário</SelectItem>
              <SelectItem value="other_agency">Outra agência</SelectItem>
              <SelectItem value="own_agency">Angariação própria</SelectItem>
              <SelectItem value="unknown">Por confirmar</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <Field label="Origem">
          <Select value={p.source_type} onValueChange={(v) => setPreview({ ...p, source_type: v })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="street_sign">Placa na rua</SelectItem>
              <SelectItem value="referral">Referência</SelectItem>
              <SelectItem value="online_listing">Anúncio online</SelectItem>
              <SelectItem value="direct_observation">Observação direta</SelectItem>
              <SelectItem value="other">Outra</SelectItem>
            </SelectContent>
          </Select>
        </Field>
      </div>
      {p.reasons?.length > 0 && (
        <div className="text-xs text-muted-foreground">Notas: {p.reasons.join(" · ")}</div>
      )}
      <div className="flex gap-2">
        <Button variant="ghost" onClick={onCancel} disabled={confirming}>Recomeçar</Button>
        <Button className="flex-1" onClick={onConfirm} disabled={confirming}>
          {confirming ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
          Confirmar e registar
        </Button>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}