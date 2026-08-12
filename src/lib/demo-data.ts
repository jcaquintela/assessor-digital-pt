// Demo data for "Afonso" MVP.
// Realistic Portuguese real-estate consultant scenario. EUR, PT-PT.
// INTEGRATION POINTS (future): substituir por dados vindos de Cloud/Supabase.

export type Relacao = "Cliente" | "Potencial" | "Proprietário" | "Referenciador" | "Colega";

export interface Pessoa {
  id: string;
  nome: string;
  telefone: string;
  email: string;
  relacao: Relacao;
  resumo: string;
  proximaAcao?: string;
  proximaAcaoData?: string;
  canal?: string;
  /** Proveniência: quando e por onde entrou. */
  criadoEm?: string;  /** Arquivado (soft-delete reversível). Nada é apagado por conversa. */
  arquivadoEm?: string;
}

export type OportunidadeTipo =
  | "Compra"
  | "Venda"
  | "Potencial Angariação"
  | "Arrendamento"
  | "Investimento"
  | "Recomendação";

export type OportunidadeEstado =
  | "Novo"
  | "Em conversa"
  | "Visita"
  | "Proposta"
  | "CPCV"
  | "Escritura"
  | "Perdida"
  | "Arquivada";

export interface Oportunidade {
  id: string;
  pessoaId: string;
  /** Nome integral do negócio; `tipo` é apenas a sua categoria. */
  titulo?: string;
  tipo: OportunidadeTipo;
  estado: OportunidadeEstado;
  /** Fase canónica que determina se o negócio está em curso ou concluído. */
  fase?: string;
  valor: number;
  probabilidade: "Baixa" | "Média" | "Alta";
  proximaAcao?: string;
  proximaAcaoData?: string;
  notas?: string;
  imovelId?: string;  /** Arquivado (soft-delete reversível). Nada é apagado por conversa. */
  arquivadoEm?: string;
}

export interface Imovel {
  id: string;
  titulo: string;
  tipo: "T1" | "T2" | "T3" | "T4" | "Moradia" | "Terreno" | "Loja";
  localizacao: string;
  valor: number;
  estado: "Angariado" | "Em preparação" | "Vendido" | "Retirado";
  proprietarioId?: string;
  oportunidadeId?: string;
  notas?: string;
  canal?: string;
  criadoEm?: string;  /** Arquivado (soft-delete reversível). Nada é apagado por conversa. */
  arquivadoEm?: string;
}

export type SeguimentoTipo = "Tarefa" | "Evento";
export type SeguimentoEstado = "Pendente" | "Concluído" | "Atrasado";
export type SeguimentoPrioridade = "Alta" | "Média" | "Baixa";

export interface Seguimento {
  id: string;
  tipo: SeguimentoTipo;
  titulo: string;
  data: string; // ISO
  hora?: string; // HH:mm quando evento
  pessoaId?: string;
  oportunidadeId?: string;
  estado: SeguimentoEstado;
  prioridade: SeguimentoPrioridade;
  notas?: string;  /** Arquivado (soft-delete reversível). Nada é apagado por conversa. */
  arquivadoEm?: string;
  /** Imóvel associado (quando existe). */
  imovelId?: string;
  /** Lead de prospeção associado (quando existe). */
  leadProspecaoId?: string;
  /** Classificação do compromisso: "negocio" ou "interno" (override manual). */
  classeEvento?: string;
}

export interface Documento {
  id: string;
  nome: string;
  tipo: string;
  dataUpload: string;
  pessoaId?: string;
  imovelId?: string;
  oportunidadeId?: string;
}

export interface Comissao {
  id: string;
  oportunidadeId: string;
  valor: number;
  data: string;
  estado: "Prevista" | "Faturada" | "Recebida";
  /** Arquivado (soft-delete reversível). */
  arquivadoEm?: string;
}

export interface Despesa {
  id: string;
  descricao: string;
  categoria: "Deslocação" | "Marketing" | "Escritório" | "Formação" | "Outros";
  valor: number;
  data: string;
  /** Arquivado (soft-delete reversível). */
  arquivadoEm?: string;
}

// INTEGRATION POINT: canal de entrada agnóstico (WhatsApp/Voz/Web).
export interface EntradaAssessor {
  id: string;
  canal: "web" | "whatsapp" | "voz";
  conteudoOriginal: string;
  transcricao?: string;
  interpretacao?: string;
  confirmado: boolean;
  data: string;
}

const today = new Date();
const iso = (offsetDays: number, h?: number, m?: number) => {
  const d = new Date(today);
  d.setDate(d.getDate() + offsetDays);
  if (h != null) d.setHours(h, m ?? 0, 0, 0);
  else d.setHours(0, 0, 0, 0);
  return d.toISOString();
};

export const pessoasSeed: Pessoa[] = [
  {
    id: "p1",
    nome: "Ana Silva",
    telefone: "+351 912 345 678",
    email: "ana.silva@email.pt",
    relacao: "Cliente",
    resumo: "Procura T2 em Alvalade até 320k. Financiamento pré-aprovado.",
    proximaAcao: "Marcar visita ao apartamento na Rua João Saraiva",
    proximaAcaoData: iso(0, 10, 30),
  },
  {
    id: "p2",
    nome: "Miguel Costa",
    telefone: "+351 933 221 100",
    email: "miguel.costa@email.pt",
    relacao: "Proprietário",
    resumo: "Proprietário do T3 em Campo de Ourique. Aberto a propostas acima de 480k.",
    proximaAcao: "Enviar relatório de visitas da semana",
    proximaAcaoData: iso(1),
  },
  {
    id: "p3",
    nome: "Rita Fernandes",
    telefone: "+351 964 112 998",
    email: "rita.fernandes@email.pt",
    relacao: "Potencial",
    resumo: "Indicada pela Ana. Investidora em arrendamento estudantil.",
    proximaAcao: "Ligar para apresentar carteira",
    proximaAcaoData: iso(-1),
  },
  {
    id: "p4",
    nome: "João Marques",
    telefone: "+351 917 004 553",
    email: "joao.marques@email.pt",
    relacao: "Cliente",
    resumo: "Vendeu moradia em Cascais em Março. Boa fonte de recomendações.",
  },
  {
    id: "p5",
    nome: "Sofia Almeida",
    telefone: "+351 936 887 210",
    email: "sofia.almeida@email.pt",
    relacao: "Referenciador",
    resumo: "Advogada — envia clientes com necessidades de compra em Lisboa.",
  },
];

export const imoveisSeed: Imovel[] = [
  {
    id: "i1",
    titulo: "T2 Rua João Saraiva",
    tipo: "T2",
    localizacao: "Alvalade, Lisboa",
    valor: 315000,
    estado: "Em preparação",
    proprietarioId: "p2",
    notas: "Cozinha renovada em 2023. Certificado energético B.",
  },
  {
    id: "i2",
    titulo: "T3 Campo de Ourique",
    tipo: "T3",
    localizacao: "Campo de Ourique, Lisboa",
    valor: 485000,
    estado: "Angariado",
    proprietarioId: "p2",
    notas: "Andar alto, com varanda. 4 visitas agendadas esta semana.",
  },
  {
    id: "i3",
    titulo: "Moradia Birre",
    tipo: "Moradia",
    localizacao: "Cascais",
    valor: 890000,
    estado: "Vendido",
    proprietarioId: "p4",
  },
];

export const oportunidadesSeed: Oportunidade[] = [
  {
    id: "o1",
    pessoaId: "p1",
    tipo: "Compra",
    estado: "Visita",
    valor: 315000,
    probabilidade: "Alta",
    proximaAcao: "Confirmar visita de hoje 10:30",
    proximaAcaoData: iso(0, 10, 30),
    imovelId: "i1",
    notas: "Preferência por andar alto. Sensível a ruído da rua.",
  },
  {
    id: "o2",
    pessoaId: "p2",
    tipo: "Venda",
    estado: "Em conversa",
    valor: 485000,
    probabilidade: "Média",
    proximaAcao: "Enviar relatório semanal",
    proximaAcaoData: iso(1),
    imovelId: "i2",
  },
  {
    id: "o3",
    pessoaId: "p3",
    tipo: "Investimento",
    estado: "Novo",
    valor: 220000,
    probabilidade: "Baixa",
    notas: "Investidora — precisa de identificar zona-alvo.",
  },
  {
    id: "o4",
    pessoaId: "p5",
    tipo: "Recomendação",
    estado: "Novo",
    valor: 0,
    probabilidade: "Média",
    proximaAcao: "Café mensal para atualização de referências",
    proximaAcaoData: iso(3, 15),
  },
];

export const seguimentosSeed: Seguimento[] = [
  {
    id: "s1",
    tipo: "Evento",
    titulo: "Visita — Ana Silva (T2 Alvalade)",
    data: iso(0, 10, 30),
    hora: "10:30",
    pessoaId: "p1",
    oportunidadeId: "o1",
    estado: "Pendente",
    prioridade: "Alta",
  },
  {
    id: "s2",
    tipo: "Tarefa",
    titulo: "Enviar relatório de visitas ao Miguel",
    data: iso(0),
    pessoaId: "p2",
    oportunidadeId: "o2",
    estado: "Pendente",
    prioridade: "Média",
  },
  {
    id: "s3",
    tipo: "Tarefa",
    titulo: "Ligar à Rita Fernandes",
    data: iso(-1),
    pessoaId: "p3",
    oportunidadeId: "o3",
    estado: "Atrasado",
    prioridade: "Alta",
  },
  {
    id: "s4",
    tipo: "Evento",
    titulo: "Reunião de equipa",
    data: iso(0, 16),
    hora: "16:00",
    estado: "Pendente",
    prioridade: "Baixa",
  },
  {
    id: "s5",
    tipo: "Tarefa",
    titulo: "Preparar dossier CPCV — João Marques",
    data: iso(2),
    pessoaId: "p4",
    estado: "Pendente",
    prioridade: "Média",
  },
  {
    id: "s6",
    tipo: "Tarefa",
    titulo: "Confirmar recepção de comissão Cascais",
    data: iso(-3),
    estado: "Concluído",
    prioridade: "Média",
  },
];

export const documentosSeed: Documento[] = [
  {
    id: "d1",
    nome: "Caderneta predial — T2 Alvalade.pdf",
    tipo: "PDF",
    dataUpload: iso(-5),
    imovelId: "i1",
  },
  {
    id: "d2",
    nome: "CPCV Moradia Birre.pdf",
    tipo: "PDF",
    dataUpload: iso(-40),
    imovelId: "i3",
    pessoaId: "p4",
  },
  {
    id: "d3",
    nome: "Pré-aprovação Ana Silva.pdf",
    tipo: "PDF",
    dataUpload: iso(-10),
    pessoaId: "p1",
  },
];

export const comissoesSeed: Comissao[] = [
  { id: "c1", oportunidadeId: "o1", valor: 9450, data: iso(20), estado: "Prevista" },
  { id: "c2", oportunidadeId: "o2", valor: 14550, data: iso(45), estado: "Prevista" },
  { id: "cB", oportunidadeId: "o1", valor: 22250, data: iso(-30), estado: "Recebida" },
  { id: "cC", oportunidadeId: "o2", valor: 8900, data: iso(-15), estado: "Faturada" },
];

export const despesasSeed: Despesa[] = [
  { id: "e1", descricao: "Combustível — visitas Cascais", categoria: "Deslocação", valor: 78.4, data: iso(-3) },
  { id: "e2", descricao: "Anúncios Idealista", categoria: "Marketing", valor: 240, data: iso(-10) },
  { id: "e3", descricao: "Formação IMI 2026", categoria: "Formação", valor: 150, data: iso(-25) },
  { id: "e4", descricao: "Portagens", categoria: "Deslocação", valor: 34.2, data: iso(-6) },
];

export const entradasSeed: EntradaAssessor[] = [];

export const formatEUR = (v: number) =>
  new Intl.NumberFormat("pt-PT", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(v);

// Datas só-dia ("2026-08-01") são interpretadas como UTC pelo Date; fixamos ao
// meio-dia para nunca saltar de dia por causa do fuso.
const parseData = (isoStr: string) =>
  /^\d{4}-\d{2}-\d{2}$/.test(isoStr) ? new Date(`${isoStr}T12:00:00`) : new Date(isoStr);

export const formatData = (isoStr: string) =>
  new Intl.DateTimeFormat("pt-PT", { day: "2-digit", month: "short" }).format(parseData(isoStr));

export const formatDataHora = (isoStr: string) =>
  new Intl.DateTimeFormat("pt-PT", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(isoStr));