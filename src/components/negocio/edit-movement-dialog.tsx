import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { useStore } from "@/lib/store";

const CATEGORIAS_DESPESA = ["Deslocação", "Marketing", "Escritório", "Formação", "Outros"];
const CATEGORIAS_COMISSAO = ["Venda", "Arrendamento", "Partilha", "Outros"];

// Correção de um movimento financeiro existente: valor, categoria e estado.
export function EditMovementDialog({
  movement,
  open,
  onOpenChange,
}: {
  movement: { id: string; type: string; amount: number; category: string | null; status: string } | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const { atualizarMovimento } = useStore();
  const [valor, setValor] = useState("");
  const [categoria, setCategoria] = useState("Outros");
  const [estado, setEstado] = useState<"Prevista" | "Recebida">("Prevista");
  const [busy, setBusy] = useState(false);

  const isExpense = movement?.type === "expense";
  const categorias = isExpense ? CATEGORIAS_DESPESA : CATEGORIAS_COMISSAO;

  useEffect(() => {
    if (!movement || !open) return;
    setValor(String(movement.amount ?? ""));
    setCategoria(movement.category ?? "Outros");
    const s = (movement.status ?? "").toLowerCase();
    setEstado(["recebida", "received", "paga", "paid"].includes(s) ? "Recebida" : "Prevista");
  }, [movement, open]);

  async function guardar() {
    if (!movement) return;
    const amount = Number(String(valor).replace(/\s/g, "").replace(",", "."));
    if (Number.isNaN(amount)) { toast.error("Valor inválido."); return; }
    setBusy(true);
    try {
      await atualizarMovimento(movement.id, { amount, category: categoria, status: estado });
      toast.success("Movimento corrigido.");
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
          <DialogTitle>Editar {isExpense ? "despesa" : "comissão"}</DialogTitle>
          <DialogDescription>Corrige o que já existe. Novos movimentos entram por conversa.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div><Label>Valor (€)</Label><Input inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value)} /></div>
          <div>
            <Label>Categoria</Label>
            <Select value={categoria} onValueChange={setCategoria}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {(categorias.includes(categoria) ? categorias : [categoria, ...categorias]).map((c) => (
                  <SelectItem key={c} value={c}>{c}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Estado</Label>
            <Select value={estado} onValueChange={(v) => setEstado(v as "Prevista" | "Recebida")}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="Prevista">Previsto</SelectItem>
                <SelectItem value="Recebida">Recebido</SelectItem>
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