import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { AlertTriangle } from "lucide-react";

interface QuotaUpgradeDialogProps {
  used: number;
  limit: number;
  label: string;
  hint: string | null;
  preview: boolean;
  children?: React.ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function QuotaUpgradeDialog({
  used,
  limit,
  label,
  hint,
  preview,
  children,
  open,
  onOpenChange,
}: QuotaUpgradeDialogProps) {
  const remaining = Math.max(0, limit - used);
  const pct = Math.min(100, (used / limit) * 100);
  const roundedPct = Math.round(pct);
  const isFull = used >= limit;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {children !== null && (
      <DialogTrigger asChild>
        {children ?? (
          <Button size="sm" className="w-full sm:w-auto">
            Fazer upgrade do plano
          </Button>
        )}
      </DialogTrigger>
      )}
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-500" />
            {isFull ? "Limite mensal atingido" : "Resumo de consumo do Drive"}
          </DialogTitle>
          <DialogDescription>
            {isFull
              ? `Já usaste os ${limit} ficheiros deste mês. O upload fica bloqueado até dia 1 ou até fazeres upgrade.`
              : `Estás a usar ${used} de ${limit} ficheiros este mês (${roundedPct}%).`}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-sm font-medium">Ficheiros este mês</div>
              <div className="text-xs text-muted-foreground">
                Plano {label}
                {preview && (
                  <span className="ml-1.5 inline-flex items-center rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                    a simular
                  </span>
                )}
                <span className="ml-1.5">· reset no dia 1</span>
              </div>
            </div>
            <div className="text-right">
              <div className="text-sm font-semibold">
                {used} de {limit}
              </div>
              <div className="text-xs text-muted-foreground">
                {remaining} restantes
              </div>
            </div>
          </div>

          <div className="h-2.5 w-full overflow-hidden rounded-full bg-primary/20">
            <div
              className="h-full rounded-full bg-primary transition-all"
              style={{ width: `${pct}%` }}
            />
          </div>

          <div className="rounded-lg border bg-muted/40 p-3">
            <div className="text-sm font-medium">Percentagem usada</div>
            <div className="text-2xl font-bold tracking-tight">
              {roundedPct}%
            </div>
            <div className="text-xs text-muted-foreground">
              {isFull
                ? "Atingiste o limite mensal. Faz upgrade para continuar a carregar ficheiros."
                : `Faltam ${remaining} ficheiros até ao limite do plano ${label}.`}
            </div>
          </div>

          {hint && (
            <div className="text-xs text-amber-600 dark:text-amber-400">
              {hint}
            </div>
          )}
        </div>

        <DialogFooter className="gap-2">
          <DialogTrigger asChild>
            <Button variant="outline">Fechar</Button>
          </DialogTrigger>
          <Button asChild className="w-full sm:w-auto">
            <Link to="/subscricao">Fazer upgrade do plano</Link>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
