import { CalendarOff, CalendarPlus, Phone, StickyNote, MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useNavigate } from "@tanstack/react-router";

interface EmptyWeekProps {
  onAddEvent?: () => void;
}

const SUGESTOES = [
  {
    label: "Registar uma visita",
    icon: CalendarPlus,
    onClick: (navigate: ReturnType<typeof useNavigate>, onAddEvent?: () => void) => {
      if (onAddEvent) onAddEvent();
      else navigate({ to: "/calendario" });
    },
  },
  {
    label: "Marcar chamada de seguimento",
    icon: Phone,
    onClick: (navigate: ReturnType<typeof useNavigate>) => navigate({ to: "/seguimentos" }),
  },
  {
    label: "Adicionar uma nota",
    icon: StickyNote,
    onClick: (navigate: ReturnType<typeof useNavigate>) => navigate({ to: "/diversos" }),
  },
  {
    label: "Falar com o Afonso",
    icon: MessageCircle,
    onClick: (navigate: ReturnType<typeof useNavigate>) => navigate({ to: "/assessor" }),
  },
];

export function EmptyWeek({ onAddEvent }: EmptyWeekProps) {
  const navigate = useNavigate();

  return (
    <div className="rounded-lg border border-dashed border-border bg-muted/20 p-6 text-center">
      <div className="mb-3 flex justify-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
          <CalendarOff className="h-6 w-6 text-muted-foreground opacity-60" />
        </div>
      </div>
      <h3 className="mb-1 text-[15px] font-semibold">Sem compromissos esta semana</h3>
      <p className="mb-4 max-w-md text-[13px] text-muted-foreground">
        A semana está livre. Aproveita para organizares o que vem a seguir ou deixa o Afonso
        ajudar-te a planear.
      </p>
      <div className="flex flex-wrap items-center justify-center gap-2">
        {SUGESTOES.map((s) => (
          <Button
            key={s.label}
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={() => s.onClick(navigate, onAddEvent)}
          >
            <s.icon className="h-4 w-4" />
            {s.label}
          </Button>
        ))}
      </div>
    </div>
  );
}
