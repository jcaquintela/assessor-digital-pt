import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Radar, BellOff, ArrowRight } from "lucide-react";
import {
  listOpportunityAlerts, muteOpportunityAlert,
} from "@/lib/opportunities/opportunities.functions";
import type { AlertEngine, OpportunityAlert } from "@/lib/opportunities/detector";

const ENGINE_LABEL: Record<AlertEngine, string> = {
  imovel_parado: "Imóvel parado",
  match_lead_imovel: "Match com lead",
  negocio_arrefecer: "Negócio a arrefecer",
};

function MuteButton({ alert, onDone }: { alert: OpportunityAlert; onDone: () => void }) {
  const [dias, setDias] = useState("7");
  const [aberto, setAberto] = useState(false);
  const muteFn = useServerFn(muteOpportunityAlert);
  const mutar = useMutation({
    mutationFn: (d: number) => muteFn({ data: { alertKey: alert.key, days: d } }),
    onSuccess: (_r, d) => {
      setAberto(false);
      toast.success(`Silenciado durante ${d} ${d === 1 ? "dia" : "dias"}.`);
      onDone();
    },
    onError: (e: any) => toast.error(e?.message ?? "Não consegui silenciar."),
  });

  return (
    <Popover open={aberto} onOpenChange={setAberto}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm" className="gap-1 text-muted-foreground">
          <BellOff className="h-3.5 w-3.5" /> Silenciar
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 space-y-3" align="end">
        <p className="text-sm">Durante quantos dias queres deixar de ver este alerta?</p>
        <div className="flex items-center gap-2">
          <Input
            type="number" min={1} max={365} value={dias}
            onChange={(e) => setDias(e.target.value)} className="h-9"
          />
          <Button
            size="sm"
            disabled={mutar.isPending}
            onClick={() => {
              const n = Math.floor(Number(dias));
              if (!Number.isFinite(n) || n < 1 || n > 365) {
                toast.error("Escolhe entre 1 e 365 dias.");
                return;
              }
              mutar.mutate(n);
            }}
          >
            Silenciar
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

/** Resumo diário das oportunidades detetadas. Cada alerta traz ação sugerida. */
export function OpportunityAlertsCard() {
  const listFn = useServerFn(listOpportunityAlerts);
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ["oportunidades-detetadas"],
    queryFn: () => listFn(),
    staleTime: 5 * 60_000,
  });
  const alerts = data?.alerts ?? [];
  if (!alerts.length) return null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Radar className="h-4 w-4" /> Oportunidades detetadas
          <Badge variant="secondary">{alerts.length}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {alerts.map((a) => (
          <div key={a.key} className="rounded-lg border p-3">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={a.urgency === "alta" ? "destructive" : "secondary"}>
                {ENGINE_LABEL[a.engine]}
              </Badge>
              <span className="font-medium">{a.title}</span>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">{a.detail}</p>
            <p className="mt-1 text-sm">{a.action}</p>
            <div className="mt-2 flex items-center justify-between">
              <Button asChild variant="ghost" size="sm" className="gap-1 px-2">
                <Link to={a.to as string}>
                  Abrir <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </Button>
              <MuteButton
                alert={a}
                onDone={() => void qc.invalidateQueries({ queryKey: ["oportunidades-detetadas"] })}
              />
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}