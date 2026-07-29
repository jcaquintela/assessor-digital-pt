import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Plus, User, Building2, CalendarPlus, ListChecks, Receipt, Coins, StickyNote, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { NewPersonDialog } from "@/components/pessoas/new-person-dialog";

const OPTIONS = [
  { label: "Pessoa", icon: User, action: "person" as const },
  { label: "Imóvel", icon: Building2, to: "/imoveis" as const },
  { label: "Compromisso", icon: CalendarPlus, to: "/calendario" as const },
  { label: "Seguimento", icon: ListChecks, to: "/seguimentos" as const },
  { label: "Despesa", icon: Receipt, to: "/negocio/despesas" as const },
  { label: "Comissão", icon: Coins, to: "/negocio/comissoes" as const },
  { label: "Nota", icon: StickyNote, to: "/diversos" as const },
];

export function QuickAdd() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [personOpen, setPersonOpen] = useState(false);

  const submitNatural = () => {
    const t = text.trim();
    if (!t) return;
    try { sessionStorage.setItem("assessor:prefill", t); } catch { /* noop */ }
    setOpen(false);
    setText("");
    navigate({ to: "/assessor" });
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button size="sm" className="gap-1.5"><Plus className="h-4 w-4" /> Adicionar</Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-3">
        <div className="mb-3">
          <div className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <Sparkles className="h-3.5 w-3.5 text-primary" /> O que queres registar?
          </div>
          <form onSubmit={(e) => { e.preventDefault(); submitNatural(); }} className="flex gap-1.5">
            <Input
              autoFocus
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Ex: visita ao T3 amanhã às 15h"
              className="h-9"
            />
            <Button type="submit" size="sm" variant="secondary" disabled={!text.trim()}>Falar</Button>
          </form>
        </div>
        <div className="mb-1.5 text-xs font-medium text-muted-foreground">Ou escolhe um tipo</div>
        <div className="grid grid-cols-2 gap-1">
          {OPTIONS.map((o) => (
            <button
              key={o.label}
              type="button"
              onClick={() => {
                setOpen(false);
                if ("action" in o && o.action === "person") setPersonOpen(true);
                else if ("to" in o && o.to) navigate({ to: o.to });
              }}
              className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted"
            >
              <o.icon className="h-4 w-4 text-muted-foreground" />
              <span>{o.label}</span>
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
    </>
  );
}