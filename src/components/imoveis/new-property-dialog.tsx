import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { createProperty } from "@/lib/assessor/properties.functions";
import { PROPERTY_STATUSES, propertyStatusLabel } from "@/lib/assessor/properties-status";

// Criação direta de imóvel a partir do dashboard.
export function NewPropertyDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const qc = useQueryClient();
  const create = useServerFn(createProperty);
  const [address, setAddress] = useState("");
  const [tipo, setTipo] = useState("");
  const [preco, setPreco] = useState("");
  const [status, setStatus] = useState("por_angariar");
  const [busy, setBusy] = useState(false);

  async function guardar() {
    setBusy(true);
    try {
      const precoNum = preco.trim() ? Number(preco.replace(/\s/g, "").replace(",", ".")) : null;
      if (precoNum != null && Number.isNaN(precoNum)) throw new Error("Preço inválido.");
      await create({ data: { address: address.trim(), typology: tipo.trim(), asking_price: precoNum, status } });
      await qc.invalidateQueries({ queryKey: ["properties"] });
      toast.success("Imóvel criado.");
      setAddress(""); setTipo(""); setPreco(""); setStatus("por_angariar");
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
          <div><Label>Morada *</Label><Input autoFocus value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Rua…, Porto" /></div>
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
          <Button onClick={guardar} disabled={busy || !address.trim()}>Criar imóvel</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}