import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Sparkles, Trash2, Plus } from "lucide-react";
import {
  createOrMergePerson,
  createPersonFromNaturalText,
  dedupePerson,
  importVCardText,
} from "@/lib/people/people.functions";
import { ROLE_LABELS_PT, type DetectedRole } from "@/lib/people/detect";

const ALL_ROLES: DetectedRole[] = [
  "owner","potential_owner","buyer","potential_buyer","client",
  "reference","partner","supplier","colleague","other",
];

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCreated?: (id: string) => void;
  defaultText?: string;
}

export function NewPersonDialog({ open, onOpenChange, onCreated, defaultText }: Props) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const natural = useServerFn(createPersonFromNaturalText);
  const manual = useServerFn(createOrMergePerson);
  const vcard = useServerFn(importVCardText);
  const dedupe = useServerFn(dedupePerson);

  const finalize = async (id: string, msg: string) => {
    qc.invalidateQueries({ queryKey: ["people"] });
    toast.success(msg);
    onOpenChange(false);
    if (onCreated) onCreated(id);
    else navigate({ to: "/pessoas/$id", params: { id } });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Nova pessoa</DialogTitle></DialogHeader>
        <Tabs defaultValue="natural" className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="natural">Natural</TabsTrigger>
            <TabsTrigger value="manual">Campos</TabsTrigger>
            <TabsTrigger value="vcard">vCard</TabsTrigger>
          </TabsList>

          <TabsContent value="natural" className="mt-4">
            <NaturalTab
              defaultText={defaultText}
              onSubmit={async (text) => {
                const r = await natural({ data: { text } });
                await finalize(r.id, r.created ? "Pessoa criada." : "Contacto atualizado.");
              }}
            />
          </TabsContent>

          <TabsContent value="manual" className="mt-4">
            <ManualTab
              onDedupe={async (payload) => dedupe({ data: payload })}
              onSubmit={async (person, targetId) => {
                const r = await manual({ data: { person, targetId: targetId ?? null, forceCreate: !targetId } });
                await finalize(r.id, r.created ? "Pessoa criada." : "Contacto atualizado.");
              }}
            />
          </TabsContent>

          <TabsContent value="vcard" className="mt-4">
            <VCardTab
              onSubmit={async (text) => {
                const r = await vcard({ data: { text } });
                await finalize(r.id, r.created ? "Contacto importado." : "Contacto atualizado.");
              }}
            />
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

/* ---------- Aba Natural ---------- */

function NaturalTab({ defaultText, onSubmit }: { defaultText?: string; onSubmit: (text: string) => Promise<void> }) {
  const [text, setText] = useState(defaultText ?? "");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    const t = text.trim();
    if (!t) return;
    setBusy(true);
    try { await onSubmit(t); }
    catch (e) { toast.error((e as Error).message); }
    finally { setBusy(false); }
  };

  return (
    <div className="space-y-3">
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Sparkles className="h-3.5 w-3.5 text-primary" /> Quem queres registar?
      </p>
      <Textarea
        autoFocus
        rows={4}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={"Ex: Regista a Ana Silva, 912 345 678, proprietária de um T2 em Gaia."}
      />
      <DialogFooter>
        <Button onClick={submit} disabled={busy || !text.trim()}>Guardar contacto</Button>
      </DialogFooter>
    </div>
  );
}

/* ---------- Aba Manual ---------- */

interface DedupeResult { match: null | { id: string; name: string; phone: string | null; email: string | null; reason: string } }

function ManualTab({
  onDedupe,
  onSubmit,
}: {
  onDedupe: (p: { name?: string; phone?: string; email?: string }) => Promise<DedupeResult>;
  onSubmit: (person: {
    name: string;
    roles: DetectedRole[];
    phones: { raw: string; isPrimary?: boolean }[];
    email: string | null;
    company: string | null;
    notes: string | null;
    sourceChannel: string;
  }, targetId: string | null) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [phones, setPhones] = useState<string[]>([""]);
  const [email, setEmail] = useState("");
  const [company, setCompany] = useState("");
  const [notes, setNotes] = useState("");
  const [roles, setRoles] = useState<DetectedRole[]>([]);
  const [busy, setBusy] = useState(false);
  const [match, setMatch] = useState<DedupeResult["match"] | null>(null);

  const toggleRole = (r: DetectedRole) =>
    setRoles((cur) => (cur.includes(r) ? cur.filter((x) => x !== r) : [...cur, r]));

  const submit = async (forceMerge: boolean) => {
    if (!name.trim()) { toast.error("O nome é obrigatório."); return; }
    const cleanPhones = phones.map((p) => p.trim()).filter(Boolean);
    setBusy(true);
    try {
      // dedupe primeiro (se ainda não pesquisou)
      let target: string | null = forceMerge && match ? match.id : null;
      if (!forceMerge && !match) {
        const d = await onDedupe({ name: name.trim(), phone: cleanPhones[0], email });
        if (d.match) { setMatch(d.match); setBusy(false); return; }
      }
      await onSubmit({
        name: name.trim(),
        roles: roles.length ? roles : ["other"],
        phones: cleanPhones.map((raw, i) => ({ raw, isPrimary: i === 0 })),
        email: email.trim() || null,
        company: company.trim() || null,
        notes: notes.trim() || null,
        sourceChannel: "web",
      }, target);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label>Nome *</Label>
        <Input value={name} onChange={(e) => { setName(e.target.value); setMatch(null); }} />
      </div>

      <div className="space-y-1.5">
        <Label>Telefones</Label>
        {phones.map((p, i) => (
          <div key={i} className="flex gap-1.5">
            <Input
              value={p}
              onChange={(e) => { const arr = [...phones]; arr[i] = e.target.value; setPhones(arr); setMatch(null); }}
              placeholder={i === 0 ? "Principal — ex: 912 345 678" : "Adicional"}
            />
            {phones.length > 1 && (
              <Button type="button" variant="ghost" size="icon" onClick={() => setPhones(phones.filter((_, j) => j !== i))}>
                <Trash2 className="h-4 w-4" />
              </Button>
            )}
          </div>
        ))}
        <Button type="button" variant="ghost" size="sm" className="text-xs" onClick={() => setPhones([...phones, ""])}>
          <Plus className="mr-1 h-3.5 w-3.5" /> Adicionar telefone
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5"><Label>Email</Label><Input type="email" value={email} onChange={(e) => { setEmail(e.target.value); setMatch(null); }} /></div>
        <div className="space-y-1.5"><Label>Empresa</Label><Input value={company} onChange={(e) => setCompany(e.target.value)} /></div>
      </div>

      <div className="space-y-1.5">
        <Label>Papéis</Label>
        <div className="flex flex-wrap gap-1.5">
          {ALL_ROLES.map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => toggleRole(r)}
              className={`rounded-full border px-2.5 py-1 text-xs transition ${roles.includes(r) ? "border-primary bg-primary text-primary-foreground" : "border-border hover:bg-muted"}`}
            >
              {ROLE_LABELS_PT[r]}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-1.5"><Label>Notas</Label><Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} /></div>

      {match && (
        <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
          Já tens <strong>{match.name}</strong> {match.phone ? `(${match.phone})` : ""} nos contactos.
          <div className="mt-2 flex gap-2">
            <Button size="sm" variant="secondary" onClick={() => submit(true)} disabled={busy}>Atualizar existente</Button>
            <Button size="sm" variant="ghost" onClick={() => { setMatch(null); }}>Ignorar e criar novo</Button>
          </div>
        </div>
      )}

      {!match && roles.length === 0 && <p className="text-xs text-muted-foreground">Sem papel selecionado será registado como <Badge variant="secondary">outro</Badge>.</p>}

      <DialogFooter>
        <Button onClick={() => submit(false)} disabled={busy || !name.trim()}>
          Guardar contacto
        </Button>
      </DialogFooter>
    </div>
  );
}

/* ---------- Aba vCard ---------- */

function VCardTab({ onSubmit }: { onSubmit: (text: string) => Promise<void> }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    setBusy(true);
    try { await onSubmit(text); } catch (e) { toast.error((e as Error).message); }
    finally { setBusy(false); }
  };
  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">Cola o conteúdo de um cartão de contacto (.vcf).</p>
      <Textarea rows={8} value={text} onChange={(e) => setText(e.target.value)} placeholder="BEGIN:VCARD..." className="font-mono text-xs" />
      <DialogFooter>
        <Button onClick={submit} disabled={busy || !text.includes("BEGIN:VCARD")}>Importar</Button>
      </DialogFooter>
    </div>
  );
}