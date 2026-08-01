// Ações diretas para uma nota em Diversos.
// Cada nota deve poder sair daqui para o sítio certo em 1 clique:
// associar a pessoa, associar a imóvel, criar seguimento ou ignorar.
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { CalendarPlus, Home, User, EyeOff } from "lucide-react";

type Kind = "person" | "property";

export interface MiscActionItem {
  id: string;
  title: string;
  original_content?: string | null;
  related_person_id?: string | null;
  related_property_id?: string | null;
}

function useInvalidate() {
  const qc = useQueryClient();
  return (id: string) => {
    qc.invalidateQueries({ queryKey: ["misc"] });
    qc.invalidateQueries({ queryKey: ["misc", id] });
    qc.invalidateQueries({ queryKey: ["misc-linked"] });
  };
}

function LinkDialog({
  kind,
  item,
  open,
  onOpenChange,
}: {
  kind: Kind;
  item: MiscActionItem;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const [q, setQ] = useState("");
  // Seleção explícita: o consultor escolhe, vê o que escolheu, e só depois grava.
  const [chosen, setChosen] = useState<{ id: string; label: string } | null>(null);
  const invalidate = useInvalidate();

  const results = useQuery({
    queryKey: ["misc-link-targets", kind, q],
    enabled: open,
    queryFn: async () => {
      if (kind === "person") {
        let sel = supabase.from("people").select("id, name").order("name").limit(20);
        if (q.trim()) sel = sel.ilike("name", `%${q.trim()}%`);
        const { data, error } = await sel;
        if (error) throw error;
        return (data ?? []).map((r: any) => ({ id: r.id, label: r.name }));
      }
      let sel = supabase.from("properties").select("id, title, address, location").limit(20);
      if (q.trim()) sel = sel.ilike("title", `%${q.trim()}%`);
      const { data, error } = await sel;
      if (error) throw error;
      return (data ?? []).map((r: any) => ({ id: r.id, label: r.title || r.address || r.location || "Imóvel" }));
    },
  });

  const link = useMutation({
    mutationFn: async (target: { id: string; label: string }) => {
      const targetId = target.id;
      const patch = kind === "person"
        ? { related_person_id: targetId, status: "classified" }
        : { related_property_id: targetId, status: "classified" };
      const { data, error } = await supabase
        .from("miscellaneous_items")
        .update(patch as never)
        .eq("id", item.id)
        .select("id, related_person_id, related_property_id")
        .maybeSingle();
      if (error) throw error;
      const row = data as { related_person_id?: string | null; related_property_id?: string | null } | null;
      if (!row) throw new Error("Não foi possível gravar a associação.");
      // Confirma que ficou gravado exatamente o registo escolhido.
      const saved = kind === "person" ? row.related_person_id : row.related_property_id;
      if (saved !== targetId) throw new Error("A associação gravada não corresponde ao que escolheste.");
      return target;
    },
    onSuccess: (target) => {
      toast.success(`Associado a: ${target.label}`);
      invalidate(item.id);
      setChosen(null);
      setQ("");
      onOpenChange(false);
    },
    onError: (e: any) => toast.error(e?.message ?? "Não foi possível associar."),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{kind === "person" ? "Associar a pessoa" : "Associar a imóvel"}</DialogTitle>
        </DialogHeader>
        <Input
          autoFocus
          value={q}
          onChange={(e) => { setQ(e.target.value); setChosen(null); }}
          placeholder={kind === "person" ? "Procurar pessoa…" : "Procurar imóvel…"}
        />
        <div className="max-h-64 overflow-y-auto rounded-md border">
          {results.isLoading ? (
            <p className="c-muted p-3 text-sm">A procurar…</p>
          ) : (results.data ?? []).length === 0 ? (
            <p className="c-muted p-3 text-sm">Sem resultados.</p>
          ) : (
            (results.data ?? []).map((r) => (
              <button
                key={r.id}
                type="button"
                disabled={link.isPending}
                data-target-id={r.id}
                aria-pressed={chosen?.id === r.id}
                onClick={() => setChosen({ id: r.id, label: r.label })}
                className={
                  "block w-full px-3 py-2 text-left text-sm hover:bg-muted " +
                  (chosen?.id === r.id ? "bg-muted font-semibold" : "")
                }
              >
                {r.label}
              </button>
            ))
          )}
        </div>
        <DialogFooter className="items-center gap-2 sm:justify-between">
          <span className="text-xs text-muted-foreground">
            {chosen ? `Selecionado: ${chosen.label}` : "Escolhe um da lista."}
          </span>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button disabled={!chosen || link.isPending} onClick={() => chosen && link.mutate(chosen)}>
              Associar
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function FollowUpDialog({
  item,
  open,
  onOpenChange,
}: {
  item: MiscActionItem;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const invalidate = useInvalidate();
  const [title, setTitle] = useState(() => displayTitle(item.title, item.title ?? ""));
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));

  const create = useMutation({
    mutationFn: async () => {
      const { data: session } = await supabase.auth.getUser();
      const userId = session.user?.id;
      if (!userId) throw new Error("Sessão expirada.");
      const { error } = await supabase.from("follow_ups").insert({
        user_id: userId,
        title: ensureTitle(title, displayTitle(item.title, "Seguimento")),
        type: "tarefa",
        due_date: new Date(`${date}T09:00:00`).toISOString(),
        status: "pendente",
        priority: "media",
        notes: item.original_content ?? null,
        person_id: item.related_person_id ?? null,
        related_property_id: item.related_property_id ?? null,
        source_channel: "dashboard",
      } as never);
      if (error) throw error;
      const { error: e2 } = await supabase
        .from("miscellaneous_items")
        .update({ status: "classified" } as never)
        .eq("id", item.id);
      if (e2) throw e2;
    },
    onSuccess: () => {
      toast.success("Seguimento criado a partir da nota.");
      invalidate(item.id);
      onOpenChange(false);
    },
    onError: (e: any) => toast.error(e?.message ?? "Não foi possível criar o seguimento."),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Criar seguimento</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3">
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="O que há a fazer" />
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button disabled={create.isPending} onClick={() => create.mutate()}>Criar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function MiscActions({ item, className }: { item: MiscActionItem; className?: string }) {
  const [dialog, setDialog] = useState<null | "person" | "property" | "followup">(null);
  const invalidate = useInvalidate();

  const ignore = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("miscellaneous_items")
        .update({ status: "archived" } as never)
        .eq("id", item.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Nota ignorada e arquivada.");
      invalidate(item.id);
    },
    onError: (e: any) => toast.error(e?.message ?? "Erro ao ignorar."),
  });

  return (
    <>
      <div className={"flex flex-wrap items-center gap-1.5 " + (className ?? "")}>
        <button type="button" className="c-badge" onClick={() => setDialog("person")}>
          <User className="h-3 w-3" /> Associar a pessoa
        </button>
        <button type="button" className="c-badge" onClick={() => setDialog("property")}>
          <Home className="h-3 w-3" /> Associar a imóvel
        </button>
        <button type="button" className="c-badge" onClick={() => setDialog("followup")}>
          <CalendarPlus className="h-3 w-3" /> Criar seguimento
        </button>
        <button type="button" className="c-badge" disabled={ignore.isPending} onClick={() => ignore.mutate()}>
          <EyeOff className="h-3 w-3" /> Ignorar
        </button>
      </div>
      {dialog === "person" || dialog === "property" ? (
        <LinkDialog
          kind={dialog}
          item={item}
          open
          onOpenChange={(v) => setDialog(v ? dialog : null)}
        />
      ) : null}
      {dialog === "followup" ? (
        <FollowUpDialog item={item} open onOpenChange={(v) => setDialog(v ? "followup" : null)} />
      ) : null}
    </>
  );
}
