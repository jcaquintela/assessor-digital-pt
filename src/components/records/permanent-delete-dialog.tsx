// Confirmação reforçada para eliminação permanente.
// Padrão a reaproveitar nas fases seguintes: aviso de irreversibilidade,
// motivo obrigatório, checkbox de compreensão e botão que só desperta 3s depois.
import { useEffect, useState } from "react";
import { AlertTriangle } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import {
  canConfirmPermanentDelete,
  PERMANENT_DELETE_DELAY_MS,
} from "@/lib/records/permanent-delete";

export function PermanentDeleteDialog({
  open,
  onOpenChange,
  alvo,
  detalhes,
  aExecutar,
  modo = "eliminar",
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** Nome do registo, ex.: "Visita com Sr. Almeida". */
  alvo: string;
  /** O que mais desaparece com ele. */
  detalhes?: string[];
  aExecutar?: boolean;
  /** "anonimizar" troca a linguagem: os dados pessoais saem, o histórico fica. */
  modo?: "eliminar" | "anonimizar";
  onConfirm: (reason: string) => void | Promise<void>;
}) {
  const anon = modo === "anonimizar";
  const [ack, setAck] = useState(false);
  const [reason, setReason] = useState("");
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!open) {
      setAck(false);
      setReason("");
      setElapsed(0);
      return;
    }
    const start = Date.now();
    setElapsed(0);
    const t = setInterval(() => setElapsed(Date.now() - start), 250);
    return () => clearInterval(t);
  }, [open]);

  const espera = Math.max(0, Math.ceil((PERMANENT_DELETE_DELAY_MS - elapsed) / 1000));
  const pronto =
    canConfirmPermanentDelete({ acknowledged: ack, elapsedMs: elapsed }) &&
    reason.trim().length >= 3 &&
    !aExecutar;

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="h-4.5 w-4.5" />
            {anon ? "Anonimizar para sempre" : "Eliminar para sempre"}
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-3 text-left">
              <p>
                {anon ? (
                  <>
                    Vais anonimizar <strong>{alvo}</strong>. O nome, telefone e email desaparecem
                    para sempre; o histórico de negócio e as comissões ficam, como a lei obriga.
                  </>
                ) : (
                  <>
                    Vais eliminar <strong>{alvo}</strong>. Isto não vai para a Reciclagem e não há
                    forma de recuperar depois de confirmares.
                  </>
                )}
              </p>
              {detalhes?.length ? (
                <ul className="list-disc space-y-1 rounded-lg border border-destructive/30 bg-destructive/5 p-3 pl-6 text-[12.5px]">
                  {detalhes.map((d) => (
                    <li key={d}>{d}</li>
                  ))}
                </ul>
              ) : null}
              <div className="space-y-1.5">
                <label htmlFor="motivo-eliminar" className="text-[12.5px] text-foreground">
                  Motivo (fica no histórico)
                </label>
                <Input
                  id="motivo-eliminar"
                  value={reason}
                  autoComplete="off"
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Ex.: registo criado por engano"
                />
              </div>
              <label className="flex items-start gap-2 text-[12.5px] text-foreground">
                <input
                  type="checkbox"
                  aria-label="Compreendo que não é recuperável"
                  checked={ack}
                  onChange={(e) => setAck(e.target.checked)}
                  className="mt-0.5"
                />
                Compreendo que não é recuperável.
              </label>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={aExecutar}>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            disabled={!pronto}
            onClick={(e) => {
              e.preventDefault();
              if (!pronto) return;
              void onConfirm(reason.trim());
            }}
          >
            {aExecutar
              ? anon ? "A anonimizar…" : "A eliminar…"
              : espera > 0
                ? `${anon ? "Anonimizar" : "Eliminar"} (${espera}s)`
                : anon ? "Anonimizar para sempre" : "Eliminar para sempre"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
