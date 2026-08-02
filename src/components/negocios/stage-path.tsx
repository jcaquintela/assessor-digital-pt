// Percurso do negócio: barra de fases + botões. Componente visual único,
// usado na ficha do Negócio e na ficha do Imóvel (a lógica vive no negócio).
import { DEAL_STAGES, STAGE_LABEL, stageIndex, type DealStage } from "@/lib/deals/stages";

export function StagePath({
  stage,
  onChange,
  disabled,
  className,
}: {
  stage: DealStage | string;
  onChange?: (s: DealStage) => void;
  disabled?: boolean;
  className?: string;
}) {
  const atual = stageIndex(stage);
  return (
    <div className={className}>
      <div className="mb-3 flex gap-1">
        {DEAL_STAGES.map((s, i) => (
          <span
            key={s}
            className={`h-1.5 flex-1 rounded-full ${
              i < atual ? "bg-primary/70" : i === atual ? "bg-primary" : "bg-muted"
            }`}
          />
        ))}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {DEAL_STAGES.map((s, i) => {
          const passou = i <= atual;
          const ativo = s === stage;
          const clickable = Boolean(onChange);
          return (
            <button
              key={s}
              type="button"
              onClick={() => onChange?.(s)}
              disabled={!clickable || disabled || ativo}
              className={`tap-44 rounded-full border px-3 py-1 text-xs transition-colors ${
                ativo
                  ? "border-primary bg-primary text-primary-foreground"
                  : passou
                    ? "border-primary/30 bg-primary/10 text-foreground"
                    : "border-border text-muted-foreground"
              } ${clickable && !ativo ? "hover:border-primary/40" : ""}`}
            >
              {STAGE_LABEL[s]}
            </button>
          );
        })}
      </div>
    </div>
  );
}
