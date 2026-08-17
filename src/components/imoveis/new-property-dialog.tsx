import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { createProperty, listProperties } from "@/lib/assessor/properties.functions";
import { PROPERTY_STATUSES, propertyStatusLabel } from "@/lib/assessor/properties-status";
import { findAddressDuplicates } from "@/lib/imoveis/address-match";
import { Link } from "@tanstack/react-router";
import { AlertTriangle } from "lucide-react";

// Criação direta de imóvel a partir do dashboard.
export function NewPropertyDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const qc = useQueryClient();
  const create = useServerFn(createProperty);
  const fetchList = useServerFn(listProperties);
  const [address, setAddress] = useState("");
  const [tipo, setTipo] = useState("");
  const [preco, setPreco] = useState("");
  const [status, setStatus] = useState("por_angariar");
  const [busy, setBusy] = useState(false);
  // Duplicado assinalado e ainda por decidir: obriga a escolher antes de criar.
  const [confirmarDuplicado, setConfirmarDuplicado] = useState(false);

  const carteira = useQuery({
    queryKey: ["properties", "list"],
    queryFn: () => fetchList(),
    enabled: open,
  });

  const duplicados = useMemo(
    () => findAddressDuplicates(address, (carteira.data ?? []) as any[]).slice(0, 3),
    [address, carteira.data],
  );
  const exacto = duplicados.some((d) => d.quality === "igual");

  async function guardar() {
    // Nunca criar em silêncio por cima de um imóvel que já existe.
    if (duplicados.length && !confirmarDuplicado) {
      setConfirmarDuplicado(true);
      return;
    }
    setBusy(true);
    try {
      const precoNum = preco.trim() ? Number(preco.replace(/\s/g, "").replace(",", ".")) : null;
      if (precoNum != null && Number.isNaN(precoNum)) throw new Error("Preço inválido.");
      await create({ data: { address: address.trim(), typology: tipo.trim(), asking_price: precoNum, status } });
      await qc.invalidateQueries({ queryKey: ["properties"] });
      toast.success("Imóvel criado.");
      setAddress(""); setTipo(""); setPreco(""); setStatus("por_angariar");
      setConfirmarDuplicado(false);
      onOpenChange(false);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Novo imóvel</DialogTitle>
          <DialogDescription>Cria já aqui — também podes continuar a criar por conversa.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Morada *</Label>
            <Input
              autoFocus
              value={address}
              onChange={(e) => { setAddress(e.target.value); setConfirmarDuplicado(false); }}
              placeholder="Rua…, Porto"
            />
          </div>
          {duplicados.length ? (
            <div className="rounded-lg border p-3 text-[13px]" style={{ borderColor: "var(--line)", background: "var(--surface, #fff)" }}>
              <div className="mb-1 flex items-center gap-1.5 font-semibold" style={{ color: "var(--ink)" }}>
                <AlertTriangle className="h-4 w-4" />
                {exacto ? "Já tens este imóvel" : "Já tens um imóvel parecido"}
              </div>
              <ul className="space-y-1">
                {duplicados.map((d) => (
                  <li key={d.item.id} className="flex items-center justify-between gap-2">
                    <span className="truncate" style={{ color: "var(--ink-soft)" }}>
                      {d.item.title || d.item.address}
                      {d.quality === "provavel" ? " · mesma rua" : ""}
                    </span>
                    <Link
                      to="/imoveis/$id"
                      params={{ id: d.item.id }}
                      className="shrink-0 font-semibold"
                      style={{ color: "var(--ink-soft)" }}
                      onClick={() => onOpenChange(false)}
                    >
                      Abrir
                    </Link>
                  </li>
                ))}
              </ul>
              {confirmarDuplicado ? (
                <p className="mt-2 text-xs" style={{ color: "var(--muted)" }}>
                  Abre o que já existe, ou carrega outra vez em "Criar mesmo assim" para avançar.
                </p>
              ) : null}
            </div>
          ) : null}
          <div><Label>Tipo</Label><Input value={tipo} onChange={(e) => setTipo(e.target.value)} placeholder="T2, Moradia…" /></div>
          <div><Label>Preço (€)</Label><Input inputMode="decimal" value={preco} onChange={(e) => setPreco(e.target.value)} /></div>
          <div>
            <Label>Estado</Label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {PROPERTY_STATUSES.map((s) => <SelectItem key={s} value={s}>{propertyStatusLabel(s)}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={guardar} disabled={busy || !address.trim()}>
            {duplicados.length ? (confirmarDuplicado ? "Criar mesmo assim" : "Criar imóvel") : "Criar imóvel"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}