import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { updatePropertyFields } from "@/lib/assessor/properties.functions";
import { PROPERTY_STATUSES, propertyStatusLabel } from "@/lib/assessor/properties-status";

// Correção rápida de um imóvel existente (morada, tipo, preço, estado).
export function EditPropertyDialog({
  property,
  open,
  onOpenChange,
}: {
  property: any | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const qc = useQueryClient();
  const update = useServerFn(updatePropertyFields);
  const [address, setAddress] = useState("");
  const [tipo, setTipo] = useState("");
  const [preco, setPreco] = useState("");
  const [status, setStatus] = useState("por_angariar");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!property || !open) return;
    setAddress(property.address ?? property.location ?? "");
    setTipo(property.typology ?? property.property_type ?? "");
    setPreco(property.asking_price != null ? String(property.asking_price) : "");
    setStatus(property.status ?? "por_angariar");
  }, [property, open]);

  async function guardar() {
    if (!property) return;
    setBusy(true);
    try {
      const precoNum = preco.trim() ? Number(preco.replace(/\s/g, "").replace(",", ".")) : null;
      if (precoNum != null && Number.isNaN(precoNum)) throw new Error("Preço inválido.");
      await update({
        data: {
          id: property.id,
          patch: {
            address: address.trim(),
            typology: tipo.trim(),
            asking_price: precoNum,
            status,
          },
        },
      });
      await qc.invalidateQueries({ queryKey: ["properties"] });
      toast.success("Imóvel corrigido.");
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e?.message ?? "Não foi possível guardar.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Editar imóvel</DialogTitle>
          <DialogDescription>Corrige o que já existe. Para criar, usa "+ Adicionar".</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div><Label>Morada</Label><Input value={address} onChange={(e) => setAddress(e.target.value)} /></div>
          <div><Label>Tipo</Label><Input value={tipo} onChange={(e) => setTipo(e.target.value)} placeholder="T2, Moradia…" /></div>
          <div><Label>Preço (€)</Label><Input inputMode="decimal" value={preco} onChange={(e) => setPreco(e.target.value)} /></div>
          <div>
            <Label>Estado</Label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {PROPERTY_STATUSES.map((s) => (
                  <SelectItem key={s} value={s}>{propertyStatusLabel(s)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={guardar} disabled={busy}>Guardar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}