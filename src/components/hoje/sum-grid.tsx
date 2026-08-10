// Grelha de resumo de /hoje: 6 rubricas, contagens simples, cada uma clicável.
// Componente puramente de apresentação — a ordem dos cartões é a contratada com o consultor.
import { Link } from "@tanstack/react-router";
import { Briefcase, Home, Users, Layers, CalendarDays, Euro } from "lucide-react";
import { formatEUR } from "@/lib/demo-data";

export interface SumGridSummary {
  deals: { count: number; value: number };
  properties: { count: number; toAcquire: number };
  people: { count: number; contactedWeek: number };
  misc: { pending: number };
  agenda: {
    today: number;
    nextLabel: string | null;
    nextTime: string | null;
    /** Subtítulo já calculado pelo seletor central; se ausente, deriva-se aqui. */
    meta?: string;
  };
  billing: { forecast: number; open: number };
}

export type SumTone = "negocios" | "imoveis" | "pessoas" | "diversos" | "neutro";

export interface SumCardItem {
  key: string;
  tone: SumTone;
  icon: any;
  to: string;
  stat: string;
  statMono?: boolean;
  label: string;
  meta: string;
}

/** Ordem fixa das rubricas: Negócios, Imóveis, Pessoas, Diversos, Agenda, Faturação. */
export function buildSumCards(resumo: SumGridSummary): SumCardItem[] {
  return [
    {
      key: "negocios", tone: "negocios", icon: Briefcase, to: "/negocios",
      stat: String(resumo.deals.count), label: "Negócios em curso",
      meta: `${formatEUR(resumo.deals.value)} em jogo`,
    },
    {
      key: "imoveis", tone: "imoveis", icon: Home, to: "/imoveis",
      stat: String(resumo.properties.count), label: "Imóveis em carteira",
      meta: `${resumo.properties.toAcquire} por angariar`,
    },
    {
      key: "pessoas", tone: "pessoas", icon: Users, to: "/pessoas",
      stat: String(resumo.people.count), label: "Pessoas",
      meta: `${resumo.people.contactedWeek} contactadas esta semana`,
    },
    {
      key: "diversos", tone: "diversos", icon: Layers, to: "/diversos",
      stat: String(resumo.misc.pending), label: "Por tratar", meta: "em Diversos",
    },
    {
      key: "agenda", tone: "neutro", icon: CalendarDays, to: "/calendario",
      stat: String(resumo.agenda.today),
      label: `Compromisso${resumo.agenda.today === 1 ? "" : "s"} hoje`,
      meta:
        resumo.agenda.meta ??
        (resumo.agenda.nextLabel
          ? `${resumo.agenda.nextTime ? `${resumo.agenda.nextTime} — ` : ""}${resumo.agenda.nextLabel}`
          : resumo.agenda.today > 0
            ? "Todos concluídos"
            : "nada marcado"),
    },
    {
      key: "faturacao", tone: "neutro", icon: Euro, to: "/negocio",
      stat: formatEUR(resumo.billing.forecast), statMono: true,
      label: "Comissões previstas", meta: `${resumo.billing.open} por fechar`,
    },
  ];
}

// Cartão de resumo: uma contagem e o detalhe mais relevante. Sem gráficos.
export function SumCard({ tone, icon: Icon, to, stat, label, meta, statMono }: Omit<SumCardItem, "key">) {
  return (
    <Link to={to as any} className={`c-sumcard ${tone}`} aria-label={label} data-sumcard={tone}>
      <Icon className="mb-2 h-[17px] w-[17px]" />
      <div className={`c-sum-stat${statMono ? " c-mono" : ""}`} style={statMono ? { fontSize: 19 } : undefined}>{stat}</div>
      <div className="c-sum-label">{label}</div>
      <div className="c-sum-meta truncate">{meta}</div>
    </Link>
  );
}

export function HojeSumGrid({ resumo }: { resumo: SumGridSummary }) {
  return (
    <section className="mb-6">
      <div className="c-eyebrow mb-2.5">Resumo geral</div>
      <div className="c-sumgrid" data-testid="sumgrid">
        {buildSumCards(resumo).map(({ key, ...card }) => (
          <SumCard key={key} {...card} />
        ))}
      </div>
    </section>
  );
}
