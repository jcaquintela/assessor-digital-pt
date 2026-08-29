// Painel "Prazos" da ficha do negócio: datas com consequência, à vista.
// O Afonso avisa a tempo — aqui o consultor vê, acrescenta e fecha.
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Check, Plus, X } from "lucide-react";
import {
  addDealDeadline, listDealDeadlines, setDealDeadlineStatus,
} from "@/lib/deals/deadlines.functions";
import { daysUntilDeadline, deadlineWhen } from "@/lib/deals/deadlines";
import { lisbonYmd } from "@/lib/assessor/lisbon-day";

export function DeadlinesCard({ dealId }: { dealId: string }) {
  const qc = useQueryClient();
  const listFn = useServerFn(listDealDeadlines);
  const addFn = useServerFn(addDealDeadline);
  const statusFn = useServerFn(setDealDeadlineStatus);

  const [label, setLabel] = useState("");
  const [data, setData] = useState("");

  const q = useQuery({
    queryKey: ["deal-deadlines", dealId],
    queryFn: () => listFn({ data: { opportunityId: dealId } }),
  });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["deal-deadlines", dealId] });
    qc.invalidateQueries({ queryKey: ["deal", dealId] });
  };

  const criar = useMutation({
    mutationFn: () => addFn({ data: { opportunityId: dealId, label: label.trim(), dueDate: data } }),
    onSuccess: () => { setLabel(""); setData(""); refresh(); toast.success("Prazo registado."); },
    onError: (e: Error) => toast.error(e.message),
  });

  const mudarEstado = useMutation({
    mutationFn: (v: { id: string; status: "cumprido" | "cancelado" }) => statusFn({ data: v }),
    onSuccess: () => { refresh(); toast.success("Feito."); },
    onError: (e: Error) => toast.error(e.message),
  });

  const hoje = lisbonYmd(new Date());
  const rows = q.data ?? [];

  return (
    <Card>
      <CardContent className="p-4">
        <h3 className="mb-3 text-sm font-semibold">Prazos ({rows.filter((r) => (r.status ?? "aberto") === "aberto").length})</h3>

        <div className="space-y-2">
          {rows.length === 0 && (
            <p className="text-sm text-muted-foreground">
              Sem prazos registados. Diz-me na conversa (“escritura dia 15”) ou acrescenta aqui.
            </p>
          )}
          {rows.map((r) => {
            const aberto = (r.status ?? "aberto") === "aberto";
            const dias = daysUntilDeadline(String(r.due_date).slice(0, 10), hoje);
            return (
              <div key={r.id} className="flex items-center gap-2 rounded-lg border border-border p-3 text-sm">
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">{r.label}</div>
                  <div className="text-xs text-muted-foreground">
                    {String(r.due_date).slice(0, 10)}
                    {aberto ? ` · ${deadlineWhen(dias)}` : ""}
                  </div>
                </div>
                {!aberto && <Badge variant="secondary">{r.status === "cumprido" ? "Cumprido" : "Cancelado"}</Badge>}
                {aberto && dias < 0 && <Badge variant="destructive">Passou</Badge>}
                {aberto && (
                  <>
                    <Button
                      variant="ghost" size="icon" aria-label={`Marcar ${r.label} como cumprido`}
                      onClick={() => mudarEstado.mutate({ id: r.id, status: "cumprido" })}
                    >
                      <Check className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost" size="icon" aria-label={`Cancelar ${r.label}`}
                      onClick={() => mudarEstado.mutate({ id: r.id, status: "cancelado" })}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </>
                )}
              </div>
            );
          })}
        </div>

        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
          <Input
            aria-label="Nome do prazo"
            placeholder="Escritura, financiamento…"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
          />
          <Input
            aria-label="Data do prazo"
            type="date"
            value={data}
            onChange={(e) => setData(e.target.value)}
            className="sm:w-44"
          />
          <Button
            onClick={() => criar.mutate()}
            disabled={!label.trim() || !data || criar.isPending}
          >
            <Plus className="mr-1 h-4 w-4" /> Adicionar
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
