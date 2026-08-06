import { useCallback, useRef, useState } from "react";
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
import { readSupportMode } from "@/lib/admin/support-mode";
import { logSupportAction } from "@/lib/admin/support-mode.functions";

// Confirmação reforçada para ações destrutivas feitas em modo suporte.
// Fora do modo suporte o comportamento é o de sempre (confirmação simples),
// para não pôr o consultor a escrever palavras a cada arquivo.

export type DestructiveEffect = "arquivo" | "reciclagem" | "permanente";

export type DestructiveRequest = {
  /** Ação em palavras simples, ex.: "Arquivar pessoa". */
  acao: string;
  /** Nome do registo afetado, ex.: "Maria Silva". */
  alvo: string;
  /** Resumo do que muda, uma linha por consequência. */
  resumo: string[];
  efeito: DestructiveEffect;
  onConfirm: () => void | Promise<void>;
};

const EFEITO_TEXTO: Record<DestructiveEffect, string> = {
  arquivo: "Sai das listas. Pode ser reposto na ficha a qualquer momento.",
  reciclagem: "Fica na Reciclagem 24 horas. Passado esse prazo desaparece de vez.",
  permanente: "Não há forma de recuperar depois de confirmares.",
};

const PALAVRA = "CONFIRMO";

export function useDestructiveConfirm() {
  const [req, setReq] = useState<DestructiveRequest | null>(null);
  const [texto, setTexto] = useState("");
  const [aExecutar, setAExecutar] = useState(false);
  const pending = useRef<DestructiveRequest | null>(null);

  const pedir = useCallback((r: DestructiveRequest) => {
    const suporte = readSupportMode();
    if (!suporte) {
      const linhas = [`${r.acao}: ${r.alvo}`, "", ...r.resumo, "", EFEITO_TEXTO[r.efeito]];
      if (!window.confirm(linhas.join("\n"))) return;
      void r.onConfirm();
      return;
    }
    pending.current = r;
    setTexto("");
    setReq(r);
  }, []);

  const fechar = () => {
    pending.current = null;
    setReq(null);
    setTexto("");
  };

  const confirmar = async () => {
    const r = pending.current;
    if (!r) return;
    const suporte = readSupportMode();
    setAExecutar(true);
    try {
      await r.onConfirm();
      if (suporte) {
        void logSupportAction({
          data: {
            session_id: suporte.sessionId,
            action: `destrutiva.${r.acao} — ${r.alvo}`.slice(0, 200),
            route: window.location.pathname,
          },
        }).catch(() => null);
      }
      fechar();
    } finally {
      setAExecutar(false);
    }
  };

  const dialog = (
    <AlertDialog open={!!req} onOpenChange={(v) => (!v ? fechar() : null)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="h-4.5 w-4.5" />
            {req?.acao} em nome de {readSupportMode()?.targetName ?? "outro utilizador"}
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-3 text-left">
              <p>
                Estás em modo suporte. Esta ação é destrutiva e vai ficar registada como{" "}
                <strong>admin agiu em nome de {readSupportMode()?.targetName}</strong>.
              </p>
              <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3">
                <p className="text-[13px] font-medium text-foreground">O que vai ser alterado</p>
                <p className="mt-0.5 text-[13px] text-foreground/90">{req?.alvo}</p>
                <ul className="mt-2 list-disc space-y-1 pl-4 text-[12.5px]">
                  {(req?.resumo ?? []).map((l) => (
                    <li key={l}>{l}</li>
                  ))}
                </ul>
                <p className="mt-2 text-[12.5px] font-medium text-destructive">
                  {req ? EFEITO_TEXTO[req.efeito] : ""}
                </p>
              </div>
              <div className="space-y-1.5">
                <label htmlFor="confirmo" className="text-[12.5px] text-foreground">
                  Escreve <strong>{PALAVRA}</strong> para avançar.
                </label>
                <Input
                  id="confirmo"
                  autoComplete="off"
                  value={texto}
                  onChange={(e) => setTexto(e.target.value)}
                  placeholder={PALAVRA}
                />
              </div>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={aExecutar}>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            disabled={texto.trim().toUpperCase() !== PALAVRA || aExecutar}
            onClick={(e) => {
              e.preventDefault();
              void confirmar();
            }}
          >
            {aExecutar ? "A aplicar…" : req?.acao}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );

  return { pedir, dialog };
}