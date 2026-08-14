import { CalendarOff } from "lucide-react";

const MENSAGENS = [
  "Sem compromissos neste dia.",
  "Dia livre para focares noutras tarefas.",
  "Nada agendado — podes descansar ou prospectar.",
  "Nenhum compromisso. Aproveita para organizares o Drive.",
];

export function EmptyDay({ label }: { label?: string }) {
  const texto = label ?? MENSAGENS[new Date().getDate() % MENSAGENS.length];
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-6 text-center text-muted-foreground">
      <CalendarOff className="h-5 w-5 opacity-40" />
      <p className="max-w-[16rem] text-[13px] leading-relaxed">{texto}</p>
    </div>
  );
}
