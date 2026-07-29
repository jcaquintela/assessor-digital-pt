import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AppShell, PageHeader } from "@/components/app-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Archive, Bell, Building2, Loader2, Phone, Sparkles, User } from "lucide-react";
import {
  addContactAttempt, archiveProspectingLead, convertProspectingLead,
  createProspectingReminder, getProspectingLead, updateProspectingLead,
  LISTING_LABEL, SOURCE_LABEL, STATUS_LABEL, type LeadStatus,
} from "@/lib/prospecting/prospecting.functions";
import { supabase } from "@/integrations/supabase/client";
import { formatData, formatDataHora } from "@/lib/demo-data";
import { TierGate } from "@/components/tier-gate";

export const Route = createFileRoute("/_authenticated/oportunidades/prospecao/$id")({
  head: () => ({
    meta: [
      { title: "Ficha de prospeção" },
      { name: "description", content: "Detalhe da placa e ações de acompanhamento." },
    ],
  }),
  component: () => (
    <TierGate min="consultor" title="Prospeção">
      <LeadDetailPage />
    </TierGate>
  ),
});

function LeadDetailPage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const getFn = useServerFn(getProspectingLead);
  const updateFn = useServerFn(updateProspectingLead);
  const attemptFn = useServerFn(addContactAttempt);
  const archiveFn = useServerFn(archiveProspectingLead);
  const reminderFn = useServerFn(createProspectingReminder);
  const convertFn = useServerFn(convertProspectingLead);

  const { data, isLoading } = useQuery({
    queryKey: ["prospecting", "lead", id],
    queryFn: () => getFn({ data: { id } }),
    retry: false,
  });

  const [imageUrl, setImageUrl] = useState<string | null>(null);
  useEffect(() => {
    const fid = (data as any)?.lead?.image_file_id;
    if (!fid) { setImageUrl(null); return; }
    (async () => {
      const { data: file } = await supabase.from("uploaded_files").select("storage_path").eq("id", fid).maybeSingle();
      const path = (file as any)?.storage_path;
      if (!path) return;
      const { data: signed } = await supabase.storage.from("assessor-files").createSignedUrl(path, 600);
      setImageUrl(signed?.signedUrl ?? null);
    })();
  }, [data]);

  const [reminderOpen, setReminderOpen] = useState(false);
  const [convertOpen, setConvertOpen] = useState(false);
  const [attemptOpen, setAttemptOpen] = useState<"contacted" | "no_interest" | "contact_attempted" | null>(null);

  const invalidate = () => qc.invalidateQueries({ queryKey: ["prospecting"] });

  const update = useMutation({
    mutationFn: (patch: Record<string, unknown>) => updateFn({ data: { id, ...patch } as any }),
    onSuccess: () => { invalidate(); toast.success("Atualizado."); },
    onError: (e: Error) => toast.error(e.message),
  });
  const archive = useMutation({
    mutationFn: () => archiveFn({ data: { id } }),
    onSuccess: () => { invalidate(); toast.success("Arquivado."); navigate({ to: "/oportunidades/prospecao" }); },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading || !data) {
    return <AppShell><p className="text-sm text-muted-foreground">A carregar…</p></AppShell>;
  }
  const lead = (data as any).lead as any;
  const reminders = ((data as any).reminders ?? []) as any[];

  return (
    <AppShell>
      <PageHeader
        title={lead.title}
        subtitle={`${SOURCE_LABEL[lead.source_type] ?? "Prospeção"} · Registado ${formatData(lead.created_at)}`}
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          {imageUrl && (
            <Card>
              <CardContent className="p-3">
                <img src={imageUrl} alt="Placa" className="max-h-80 w-full rounded-lg object-contain" />
              </CardContent>
            </Card>
          )}

          <Card>
            <CardContent className="space-y-3 p-4">
              <div className="flex flex-wrap items-center gap-2">
                <Badge>{STATUS_LABEL[lead.status as LeadStatus] ?? lead.status}</Badge>
                <Badge variant="secondary">{LISTING_LABEL[lead.listing_type]}</Badge>
                {lead.extraction_confidence != null && (
                  <span className="text-xs text-muted-foreground">Confiança {Math.round(Number(lead.extraction_confidence) * 100)}%</span>
                )}
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Telefone">
                  <Input defaultValue={lead.phone ?? ""} onBlur={(e) => e.target.value !== (lead.phone ?? "") && update.mutate({ phone: e.target.value || null })} />
                </Field>
                <Field label="Localização">
                  <Input defaultValue={lead.location ?? ""} onBlur={(e) => e.target.value !== (lead.location ?? "") && update.mutate({ location: e.target.value || null })} />
                </Field>
                <Field label="Morada">
                  <Input defaultValue={lead.address ?? ""} onBlur={(e) => e.target.value !== (lead.address ?? "") && update.mutate({ address: e.target.value || null })} />
                </Field>
                <Field label="Agência">
                  <Input defaultValue={lead.agency_name ?? ""} onBlur={(e) => e.target.value !== (lead.agency_name ?? "") && update.mutate({ agency_name: e.target.value || null })} />
                </Field>
                <Field label="Tipo de imóvel">
                  <Input defaultValue={lead.property_type ?? ""} placeholder="Apartamento, moradia…" onBlur={(e) => e.target.value !== (lead.property_type ?? "") && update.mutate({ property_type: e.target.value || null })} />
                </Field>
                <Field label="Tipologia">
                  <Input defaultValue={lead.typology ?? ""} placeholder="T2, T3…" onBlur={(e) => e.target.value !== (lead.typology ?? "") && update.mutate({ typology: e.target.value || null })} />
                </Field>
                <Field label="Estado">
                  <Select value={lead.status} onValueChange={(v) => update.mutate({ status: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {(["to_contact","contact_attempted","contacted","no_interest","opportunity","converted","archived"] as LeadStatus[]).map((s) => (
                        <SelectItem key={s} value={s}>{STATUS_LABEL[s]}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Preço pedido (€)">
                  <Input type="number" defaultValue={lead.asking_price ?? ""} onBlur={(e) => {
                    const n = e.target.value ? Number(e.target.value) : null;
                    if (n !== (lead.asking_price ?? null)) update.mutate({ asking_price: n });
                  }} />
                </Field>
              </div>
              <Field label="Notas e histórico">
                <Textarea rows={6} defaultValue={lead.notes ?? ""} onBlur={(e) => e.target.value !== (lead.notes ?? "") && update.mutate({ notes: e.target.value || null })} />
              </Field>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="mb-2 text-sm font-medium">Seguimentos</div>
              {reminders.length === 0 && <p className="text-sm text-muted-foreground">Sem lembretes agendados.</p>}
              <ul className="space-y-1.5">
                {reminders.map((r) => (
                  <li key={r.id} className="flex items-center justify-between rounded-md border border-border px-3 py-2 text-sm">
                    <span className="truncate">{r.title}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {formatDataHora(r.due_date)}{r.due_time ? ` · ${r.due_time}` : ""}
                    </span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-3">
          <Card>
            <CardContent className="space-y-2 p-4">
              {lead.phone && (
                <Button asChild className="w-full"><a href={`tel:${lead.phone}`}><Phone className="mr-1 h-4 w-4" /> Ligar {lead.phone}</a></Button>
              )}
              <Button variant="outline" className="w-full" onClick={() => setReminderOpen(true)}>
                <Bell className="mr-1 h-4 w-4" /> Criar lembrete
              </Button>
              <Button variant="outline" className="w-full" onClick={() => setAttemptOpen("contact_attempted")}>Tentativa de contacto</Button>
              <Button variant="outline" className="w-full" onClick={() => setAttemptOpen("contacted")}>Marcar como contactado</Button>
              <Button variant="outline" className="w-full" onClick={() => setAttemptOpen("no_interest")}>Sem interesse</Button>
              <Button variant="secondary" className="w-full" onClick={() => setConvertOpen(true)}>
                <Sparkles className="mr-1 h-4 w-4" /> Transformar em imóvel
              </Button>
              <Button variant="ghost" className="w-full" onClick={() => archive.mutate()}>
                <Archive className="mr-1 h-4 w-4" /> Arquivar
              </Button>
            </CardContent>
          </Card>

          {(lead.related_person_id || lead.related_property_id) && (
            <Card>
              <CardContent className="space-y-2 p-4">
                <div className="text-sm font-medium">Ligações</div>
                {lead.related_person_id && (
                  <Button asChild variant="ghost" className="w-full justify-start">
                    <Link to="/pessoas/$id" params={{ id: lead.related_person_id }}>
                      <User className="mr-1 h-4 w-4" /> Pessoa associada
                    </Link>
                  </Button>
                )}
                {lead.related_property_id && (
                  <Button asChild variant="ghost" className="w-full justify-start">
                    <Link to="/imoveis/$id" params={{ id: lead.related_property_id }}>
                      <Building2 className="mr-1 h-4 w-4" /> Imóvel associado
                    </Link>
                  </Button>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      <ReminderDialog
        open={reminderOpen}
        onOpenChange={setReminderOpen}
        onConfirm={(due_date, due_time) => {
          reminderFn({ data: { id, due_date, due_time, title: null } })
            .then(() => { invalidate(); qc.invalidateQueries({ queryKey: ["prospecting", "lead", id] }); toast.success("Lembrete criado."); setReminderOpen(false); })
            .catch((e) => toast.error(e.message));
        }}
      />

      <AttemptDialog
        outcome={attemptOpen}
        onClose={() => setAttemptOpen(null)}
        onConfirm={(notes) => {
          if (!attemptOpen) return;
          attemptFn({ data: { id, outcome: attemptOpen, notes } })
            .then(() => { invalidate(); qc.invalidateQueries({ queryKey: ["prospecting", "lead", id] }); toast.success("Registado."); setAttemptOpen(null); })
            .catch((e) => toast.error(e.message));
        }}
      />

      <ConvertDialog
        open={convertOpen}
        onOpenChange={setConvertOpen}
        onConfirm={(payload) => {
          convertFn({ data: { id, ...payload } as any })
            .then((r: any) => {
              invalidate();
              toast.success("Convertido em imóvel.");
              setConvertOpen(false);
              if (r?.property_id) navigate({ to: "/imoveis/$id", params: { id: r.property_id } });
            })
            .catch((e) => toast.error(e.message));
        }}
      />
    </AppShell>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-1"><Label className="text-xs text-muted-foreground">{label}</Label>{children}</div>;
}

function ReminderDialog({
  open, onOpenChange, onConfirm,
}: { open: boolean; onOpenChange: (v: boolean) => void; onConfirm: (date: string, time: string | null) => void }) {
  const tomorrow = new Date(Date.now() + 864e5).toISOString().slice(0, 10);
  const [date, setDate] = useState(tomorrow);
  const [time, setTime] = useState("10:00");
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>Criar lembrete</DialogTitle></DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Data"><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
          <Field label="Hora"><Input type="time" value={time} onChange={(e) => setTime(e.target.value)} /></Field>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={() => onConfirm(date, time || null)}>Guardar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AttemptDialog({
  outcome, onClose, onConfirm,
}: { outcome: "contacted" | "no_interest" | "contact_attempted" | null; onClose: () => void; onConfirm: (notes: string | null) => void }) {
  const [notes, setNotes] = useState("");
  const label = outcome === "contacted" ? "Contactado" : outcome === "no_interest" ? "Sem interesse" : "Tentativa de contacto";
  return (
    <Dialog open={!!outcome} onOpenChange={(v) => { if (!v) { onClose(); setNotes(""); } }}>
      <DialogContent>
        <DialogHeader><DialogTitle>{label}</DialogTitle></DialogHeader>
        <Textarea rows={4} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="O que aconteceu? (opcional)" />
        <DialogFooter>
          <Button variant="ghost" onClick={() => { onClose(); setNotes(""); }}>Cancelar</Button>
          <Button onClick={() => { onConfirm(notes.trim() || null); setNotes(""); }}>Registar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ConvertDialog({
  open, onOpenChange, onConfirm,
}: { open: boolean; onOpenChange: (v: boolean) => void; onConfirm: (p: { person_name: string | null; property_title: string | null; asking_price: number | null; typology: string | null }) => void }) {
  const [personName, setPersonName] = useState("");
  const [propertyTitle, setPropertyTitle] = useState("");
  const [askingPrice, setAskingPrice] = useState("");
  const [typology, setTypology] = useState("");
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>Transformar em imóvel</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <Field label="Nome do proprietário (opcional)"><Input value={personName} onChange={(e) => setPersonName(e.target.value)} placeholder="Deixa em branco se ainda não sabes" /></Field>
          <Field label="Título do imóvel (opcional)"><Input value={propertyTitle} onChange={(e) => setPropertyTitle(e.target.value)} /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Tipologia"><Input value={typology} onChange={(e) => setTypology(e.target.value)} placeholder="T2, T3…" /></Field>
            <Field label="Preço pedido (€)"><Input type="number" value={askingPrice} onChange={(e) => setAskingPrice(e.target.value)} /></Field>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={() => onConfirm({
            person_name: personName.trim() || null,
            property_title: propertyTitle.trim() || null,
            asking_price: askingPrice ? Number(askingPrice) : null,
            typology: typology.trim() || null,
          })}>Converter</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}