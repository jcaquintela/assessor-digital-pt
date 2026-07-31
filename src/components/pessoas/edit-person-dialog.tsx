import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { useStore } from "@/lib/store";
import type { Pessoa, Relacao } from "@/lib/demo-data";

const RELACOES: Relacao[] = ["Cliente", "Potencial", "Proprietário", "Referenciador", "Colega"];

// Correção de um registo já existente. A criação também é possível no dashboard
// (NewPersonDialog) além do WhatsApp/Telegram.
export function EditPersonDialog({
  pessoa,
  open,
  onOpenChange,
}: {
  pessoa: Pessoa | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const { updatePessoa } = useStore();
  const [nome, setNome] = useState("");
  const [telefone, setTelefone] = useState("");
  const [relacao, setRelacao] = useState<Relacao>("Potencial");
  const [resumo, setResumo] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!pessoa || !open) return;
    setNome(pessoa.nome ?? "");
    setTelefone(pessoa.telefone ?? "");
    setRelacao((pessoa.relacao as Relacao) ?? "Potencial");
    setResumo(pessoa.resumo ?? "");
  }, [pessoa, open]);

  async function guardar() {
    if (!pessoa) return;
    if (!nome.trim()) { toast.error("O nome é obrigatório."); return; }
    setBusy(true);
    try {
      await updatePessoa(pessoa.id, {
        nome: nome.trim(),
        telefone: telefone.trim(),
        relacao,
        resumo: resumo.trim(),
      });
      toast.success("Contacto corrigido.");
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
          <DialogTitle>Editar contacto</DialogTitle>
          <DialogDescription>Corrige o que já existe. Para criar, usa "+ Adicionar".</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div><Label>Nome</Label><Input value={nome} onChange={(e) => setNome(e.target.value)} /></div>
          <div><Label>Telefone</Label><Input inputMode="tel" value={telefone} onChange={(e) => setTelefone(e.target.value)} /></div>
          <div>
            <Label>Interesse</Label>
            <Select value={relacao} onValueChange={(v) => setRelacao(v as Relacao)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{RELACOES.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div><Label>Notas</Label><Textarea rows={3} value={resumo} onChange={(e) => setResumo(e.target.value)} /></div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={guardar} disabled={busy}>Guardar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}