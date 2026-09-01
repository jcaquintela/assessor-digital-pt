// Assessor v2 — catálogo de ferramentas expostas à IA (function-calling).
//
// Cada entrada define:
//  - nome canónico
//  - descrição curta (a IA lê-a e decide quando invocar)
//  - JSON schema dos argumentos (o gateway valida a estrutura)
//  - schema Zod (o backend valida antes de executar)
//
// O executor real (`domain.server.ts`) é resolvido pelo `tool-registry`.
// Aqui só descrevemos contrato. NUNCA escrever nem ler da BD neste ficheiro.

import { z } from "zod";
import type { GatewayToolSpec } from "./gateway.server";

// ---------- schemas Zod ----------

// O modelo devolve muitas vezes `query: null` quando quer dizer "tudo"
// ("lista os contactos todos que tens meus"). `z.string().default("")` só
// aceita `undefined`, por isso uma leitura perfeitamente correcta era
// rejeitada por validação e acabava em Diversos. Aqui null vira "".
const OptionalQuery = z.preprocess(
  (v) => (v == null ? "" : v),
  z.string(),
).default("");

export const SearchPeopleArgs = z.object({
  // Vazio = listar tudo ("lista os contactos todos que tens meus").
  query: OptionalQuery,
  relationship_type: z.string().optional().nullable(),
});
export type SearchPeopleArgs = z.infer<typeof SearchPeopleArgs>;

export const CreatePersonArgs = z.object({
  name: z.string().min(1),
  phone: z.string().optional().nullable(),
  email: z.string().email().optional().nullable(),
  relationship_type: z.enum([
    "proprietario",
    "comprador",
    "potencial_cliente",
    "parceiro",
    "referencia",
    "outro",
  ]),
  summary: z.string().optional().nullable(),
});
export type CreatePersonArgs = z.infer<typeof CreatePersonArgs>;

export const SearchPropertiesArgs = z.object({
  query: OptionalQuery,
  status: z.string().optional().nullable(),
});
export type SearchPropertiesArgs = z.infer<typeof SearchPropertiesArgs>;

export const SearchFilesArgs = z.object({
  query: OptionalQuery,
  document_type: z.string().optional().nullable(),
});
export type SearchFilesArgs = z.infer<typeof SearchFilesArgs>;

// Email (Gmail ligado por consultor). Só leitura.
export const SearchEmailsArgs = z.object({
  query: z.string().optional().nullable(),
  only_unread: z.boolean().optional().nullable(),
  max: z.number().int().optional().nullable(),
  include_all: z.boolean().optional().nullable(),
});
export type SearchEmailsArgs = z.infer<typeof SearchEmailsArgs>;

export const SummarizeEmailArgs = z.object({
  message_id: z.string().optional().nullable(),
  subject_hint: z.string().optional().nullable(),
});
export type SummarizeEmailArgs = z.infer<typeof SummarizeEmailArgs>;

// Rascunho de resposta a email: PROPÕE apenas. O envio nunca é ferramenta.
// Dormente desde 26/08: o Afonso não lê a caixa de entrada. Fica no ficheiro
// porque a infraestrutura de rascunhos é a mesma do email de saída.
export const DraftEmailReplyArgs = z.object({
  message_id: z.string().optional().nullable(),
  subject_hint: z.string().optional().nullable(),
  instructions: z.string().optional().nullable(),
});
export type DraftEmailReplyArgs = z.infer<typeof DraftEmailReplyArgs>;

// Email de INICIATIVA a um lead/contacto. Também só propõe.
export const ComposeEmailToContactArgs = z.object({
  person_id: z.string().optional().nullable(),
  person_name: z.string().optional().nullable(),
  email: z.string().optional().nullable(),
  subject: z.string().optional().nullable(),
  instructions: z.string().optional().nullable(),
});
export type ComposeEmailToContactArgs = z.infer<typeof ComposeEmailToContactArgs>;



export const CreatePropertyArgs = z.object({
  title: z.string().min(1),
  property_type: z.string().optional().nullable(),
  typology: z.string().optional().nullable(),
  location: z.string().optional().nullable(),
  status: z
    .enum([
      "por_angariar",
      "em_angariacao",
      "angariado",
      "activo",
      "reservado",
      "vendido",
      "arquivado",
    ])
    .optional()
    .nullable(),
  owner_person_id: z.string().uuid().optional().nullable(),
  asking_price: z.number().nonnegative().optional().nullable(),
});
export type CreatePropertyArgs = z.infer<typeof CreatePropertyArgs>;

export const SearchAgendaArgs = z.object({
  period: z.enum(["today", "tomorrow", "week", "next_week"]).optional().nullable(),
  // Dia concreto (calendário de Lisboa). Tem precedência sobre `period`: sem
  // isto, "e no dia 31 apenas?" forçava o modelo a escolher `next_week` e a
  // resposta trazia a semana inteira.
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
}).refine((v) => !!(v.period || v.date), { message: "indica period ou date" });
export type SearchAgendaArgs = z.infer<typeof SearchAgendaArgs>;

// ---- Categorias de imóveis (mesmo mecanismo das categorias do Drive) ----
export const ListPropertyCategoriesArgs = z.object({}).passthrough();
export type ListPropertyCategoriesArgs = z.infer<typeof ListPropertyCategoriesArgs>;

export const ListUncategorizedPropertiesArgs = z.object({
  limit: z.number().int().positive().max(50).optional().nullable(),
});
export type ListUncategorizedPropertiesArgs = z.infer<typeof ListUncategorizedPropertiesArgs>;

// Comparáveis de mercado (pesquisa web dirigida). LEITURA — nunca escreve.
export const SearchSimilarListingsArgs = z.object({
  property_id: z.string().uuid().optional().nullable(),
  property_query: z.string().min(2).optional().nullable(),
  typology: z.string().min(1).max(20).optional().nullable(),
  location: z.string().min(2).max(80).optional().nullable(),
});
export type SearchSimilarListingsArgs = z.infer<typeof SearchSimilarListingsArgs>;

export const SetPropertyCategoryArgs = z.object({
  property_id: z.string().uuid().optional().nullable(),
  // O modelo nem sempre traz o id do search — aceitamos também a morada/título
  // dita na conversa e resolvemos o imóvel a partir daí.
  property_query: z.string().min(2).optional().nullable(),
  category_name: z.string().min(1).max(40).optional().nullable(),
}).refine((v) => !!(v.property_id || v.property_query), {
  message: "indica property_id ou property_query",
});
export type SetPropertyCategoryArgs = z.infer<typeof SetPropertyCategoryArgs>;

const IsoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD");
const HhMm = z.string().regex(/^\d{2}:\d{2}$/, "HH:MM");

const FollowUpType = z.preprocess((value) => {
  if (typeof value !== "string") return value;
  const normalized = value.trim().toLowerCase();
  const aliases: Record<string, string> = {
    call: "chamada",
    phone: "chamada",
    phone_call: "chamada",
    chamada: "chamada",
    email: "email",
    e_mail: "email",
    message: "mensagem",
    mensagem: "mensagem",
    sms: "mensagem",
    whatsapp: "mensagem",
    task: "tarefa",
    todo: "tarefa",
    tarefa: "tarefa",
    other: "outro",
    outro: "outro",
  };
  return aliases[normalized] ?? normalized;
}, z.enum(["chamada", "email", "mensagem", "tarefa", "outro"]));

const FollowUpPriority = z.preprocess((value) => {
  if (typeof value !== "string") return value;
  const normalized = value.trim().toLowerCase();
  const aliases: Record<string, string> = {
    low: "baixa",
    baixa: "baixa",
    normal: "media",
    medium: "media",
    média: "media",
    media: "media",
    high: "alta",
    alta: "alta",
  };
  return aliases[normalized] ?? normalized;
}, z.enum(["baixa", "media", "alta"]));

// O modelo inventa por vezes tipos de evento fora da lista ("prospeccao",
// "bloco", "call"...). Isso não pode fazer a criação falhar: normalizamos
// aliases conhecidos e tudo o resto cai em "outro".
const EventType = z.preprocess((value) => {
  if (typeof value !== "string") return value === undefined || value === null ? "visita" : value;
  const normalized = value.trim().toLowerCase();
  const aliases: Record<string, string> = {
    visita: "visita",
    visit: "visita",
    viewing: "visita",
    reuniao_angariacao: "reuniao_angariacao",
    reuniao: "reuniao_angariacao",
    meeting: "reuniao_angariacao",
    angariacao: "reuniao_angariacao",
    chamada: "chamada",
    call: "chamada",
    phone_call: "chamada",
    chamadas: "chamada",
  };
  return aliases[normalized] ?? "outro";
}, z.enum(["visita", "reuniao_angariacao", "chamada", "outro"]));

export const CreateEventArgs = z.object({
  title: z.string().min(1),
  event_type: EventType.default("visita"),
  date: IsoDate,
  start_time: HhMm,
  duration_minutes: z.number().int().positive().max(600).optional().nullable(),
  location: z.string().optional().nullable(),
  person_id: z.string().uuid().optional().nullable(),
  property_id: z.string().uuid().optional().nullable(),
  reminder_minutes: z.number().int().nonnegative().max(1440).optional().nullable(),
  notes: z.string().optional().nullable(),
});
export type CreateEventArgs = z.infer<typeof CreateEventArgs>;

export const CreateFollowUpArgs = z.object({
  title: z.string().min(1),
  type: FollowUpType.default("tarefa"),
  due_date: IsoDate,
  due_time: HhMm.optional().nullable(),
  priority: FollowUpPriority.default("media"),
  person_id: z.string().uuid().optional().nullable(),
  property_id: z.string().uuid().optional().nullable(),
  notes: z.string().optional().nullable(),
});
export type CreateFollowUpArgs = z.infer<typeof CreateFollowUpArgs>;


export const SaveInteractionArgs = z.object({
  summary: z.string().min(1),
  person_id: z.string().uuid().optional().nullable(),
  property_id: z.string().uuid().optional().nullable(),
  interaction_type: z.string().optional().nullable(),
  occurred_at: z.string().optional().nullable(),
  // Nota confidencial: fica no histórico do consultor, mas nunca pode entrar
  // em texto destinado a terceiros (ver `culture/confidential.ts`).
  is_confidential: z.boolean().optional().nullable(),
});
export type SaveInteractionArgs = z.infer<typeof SaveInteractionArgs>;

// Lembrete recorrente ("todos os dias às 9:45", "todas as segundas às 10h").
// Sem esta ferramenta o pedido de recorrência perdia-se em silêncio.
export const RoutineKind = z.enum(["follow_up", "digest"]);

export const CreateRoutineArgs = z.object({
  title: z.string().min(1),
  frequency: z.enum(["daily", "weekly", "monthly"]).default("daily"),
  time_of_day: HhMm,
  interval_n: z.number().int().positive().max(52).optional().nullable(),
  weekday: z.number().int().min(0).max(6).optional().nullable(),
  day_of_month: z.number().int().min(1).max(31).optional().nullable(),
  priority: FollowUpPriority.optional().nullable(),
  person_id: z.string().uuid().optional().nullable(),
  notes: z.string().optional().nullable(),
  kind: RoutineKind.optional().nullable(),
  /** O que resumir/ler no disparo (só kind=digest). */
  digest_query: z.string().optional().nullable(),
});
export type CreateRoutineArgs = z.infer<typeof CreateRoutineArgs>;

// Ligar/desligar uma rotina existente. Usado quando o consultor responde à
// pergunta "isto repete-se — queres que continue a repetir?".
export const SetRoutineActiveArgs = z.object({
  routine_id: z.string().uuid(),
  active: z.boolean(),
});
export type SetRoutineActiveArgs = z.infer<typeof SetRoutineActiveArgs>;

export const ListRoutinesArgs = z.object({
  only_active: z.boolean().optional().nullable(),
});
export type ListRoutinesArgs = z.infer<typeof ListRoutinesArgs>;

export const UpdateRoutineArgs = z.object({
  routine_id: z.string().uuid().optional().nullable(),
  /** Título aproximado quando o consultor não dá identificador. */
  subject_hint: z.string().optional().nullable(),
  title: z.string().min(1).optional().nullable(),
  frequency: z.enum(["daily", "weekly", "monthly"]).optional().nullable(),
  time_of_day: HhMm.optional().nullable(),
  interval_n: z.number().int().positive().max(52).optional().nullable(),
  weekday: z.number().int().min(0).max(6).optional().nullable(),
  day_of_month: z.number().int().min(1).max(31).optional().nullable(),
  kind: RoutineKind.optional().nullable(),
  digest_query: z.string().optional().nullable(),
  active: z.boolean().optional().nullable(),
});
export type UpdateRoutineArgs = z.infer<typeof UpdateRoutineArgs>;

export const ReadSettingsArgs = z.object({});
export type ReadSettingsArgs = z.infer<typeof ReadSettingsArgs>;

// Escrita de definições por conversa. A lista branca vive em
// settings-conversa.ts — aqui o schema é deliberadamente aberto para o
// Afonso poder passar a forma natural ("resumo", "plano") e receber a
// explicação certa em vez de um erro de validação.
export const UpdateSettingArgs = z.object({
  setting: z.string().min(1),
  value: z.unknown().optional(),
  confirmed: z.boolean().optional().nullable(),
});
export type UpdateSettingArgs = z.infer<typeof UpdateSettingArgs>;

export const DeleteRoutineArgs = z.object({
  routine_id: z.string().uuid().optional().nullable(),
  subject_hint: z.string().optional().nullable(),
});
export type DeleteRoutineArgs = z.infer<typeof DeleteRoutineArgs>;


export const SaveMiscellaneousArgs = z.object({
  title: z.string().min(1),
  summary: z.string().optional().nullable(),
  category: z.string().optional().nullable(),
  tags: z.array(z.string()).optional().nullable(),
});
export type SaveMiscellaneousArgs = z.infer<typeof SaveMiscellaneousArgs>;

const FinancialMovementType = z.preprocess((value) => {
  if (typeof value !== "string") return value;
  const normalized = value.trim().toLowerCase();
  const aliases: Record<string, string> = {
    commission: "commission",
    comissao: "commission",
    comissão: "commission",
    comissoes: "commission",
    comissões: "commission",
    expense: "expense",
    despesa: "expense",
    despesas: "expense",
  };
  return aliases[normalized] ?? normalized;
}, z.enum(["commission", "expense"]));

const FinancialStatus = z.preprocess((value) => {
  if (typeof value !== "string") return value;
  const normalized = value.trim().toLowerCase();
  const aliases: Record<string, string> = {
    prevista: "Prevista",
    previsto: "Prevista",
    garantida: "Prevista",
    garantido: "Prevista",
    faturada: "Faturada",
    facturada: "Faturada",
    recebida: "Recebida",
    recebido: "Recebida",
    paid: "Recebida",
    invoiced: "Faturada",
    expected: "Prevista",
  };
  return aliases[normalized] ?? value;
}, z.string().default("Prevista"));

export const CreateFinancialMovementArgs = z.object({
  type: FinancialMovementType,
  amount: z.number().nonnegative(),
  description: z.string().min(1),
  status: FinancialStatus.optional(),
  movement_date: IsoDate.optional().nullable(),
  category: z.string().optional().nullable(),
  vat_amount: z.number().nonnegative().optional().nullable(),
  opportunity_id: z.string().uuid().optional().nullable(),
  property_id: z.string().uuid().optional().nullable(),
  deal_value: z.number().nonnegative().optional().nullable(),
  production_amount: z.number().nonnegative().optional().nullable(),
  property_reference: z.string().optional().nullable(),
  opportunity_title: z.string().optional().nullable(),
});
export type CreateFinancialMovementArgs = z.infer<typeof CreateFinancialMovementArgs>;


// ---------- Negócio (deal) ----------
// O Afonso nunca cria um negócio sozinho: propõe e só executa depois de
// confirmação explícita do consultor.
export const CreateDealArgs = z.object({
  title: z.string().min(3).max(200),
  kind: z.string().optional().nullable(),
  stage: z.string().optional().nullable(),
  person_id: z.string().uuid().optional().nullable(),
  property_id: z.string().uuid().optional().nullable(),
  value: z.number().nonnegative().optional().nullable(),
  notes: z.string().optional().nullable(),
  link_movement_ids: z.array(z.string().uuid()).optional().nullable(),
  // Imóvel descrito por palavras quando ainda não existe ficha ("terreno de
  // Canelas"). Só depois do "sim" é que vira registo.
  property_hint: z.string().min(2).max(120).optional().nullable(),
});
export type CreateDealArgs = z.infer<typeof CreateDealArgs>;

export const SearchDealsArgs = z.object({
  query: z.string().optional().nullable(),
  person_id: z.string().uuid().optional().nullable(),
  property_id: z.string().uuid().optional().nullable(),
});
export type SearchDealsArgs = z.infer<typeof SearchDealsArgs>;

// ---------- Lembretes (reminders) ----------

const ReminderResource = z.enum(["follow_up", "event", "prospecting_lead", "other"]);

export const RescheduleReminderArgs = z.object({
  reminder_id: z.string().uuid().optional().nullable(),
  related_resource_type: ReminderResource.optional().nullable(),
  related_resource_id: z.string().uuid().optional().nullable(),
  subject_hint: z.string().min(2).max(120).optional().nullable(),
  new_date: IsoDate,
  new_time: HhMm,
  timezone: z.string().default("Europe/Lisbon"),
  reason: z.string().optional().nullable(),
});
export type RescheduleReminderArgs = z.infer<typeof RescheduleReminderArgs>;

export const SearchActiveRemindersArgs = z.object({
  query: z.string().optional().nullable(),
  related_resource_type: ReminderResource.optional().nullable(),
  related_resource_id: z.string().uuid().optional().nullable(),
});
export type SearchActiveRemindersArgs = z.infer<typeof SearchActiveRemindersArgs>;

export const CancelReminderArgs = z.object({
  reminder_id: z.string().uuid(),
});
export type CancelReminderArgs = z.infer<typeof CancelReminderArgs>;

// Desmarcar compromissos/seguimentos reais (tabela `follow_ups`).
// `cancel_reminder` só mexe em avisos; sem isto não havia forma nenhuma de
// cumprir "limpa a agenda de hoje" ou "desmarca tudo".
export const CancelFollowUpArgs = z.object({
  follow_up_ids: z.array(z.string().uuid()).max(50).optional().nullable(),
  subject_hint: z.string().min(2).max(160).optional().nullable(),
  period: z.enum(["today", "tomorrow", "week", "next_week"]).optional().nullable(),
  all_in_period: z.boolean().optional().nullable(),
  reason: z.string().max(300).optional().nullable(),
});
export type CancelFollowUpArgs = z.infer<typeof CancelFollowUpArgs>;


// ---- Prazos de negócio ------------------------------------------------
export const AddDealDeadlineArgs = z.object({
  opportunity_id: z.string().uuid().optional().nullable(),
  deal_hint: z.string().max(200).optional().nullable(),
  label: z.string().min(2).max(120),
  due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  notice_days: z.number().int().min(0).max(180).optional().nullable(),
  notes: z.string().max(300).optional().nullable(),
});
export type AddDealDeadlineArgs = z.infer<typeof AddDealDeadlineArgs>;

export const ListDealDeadlinesArgs = z.object({
  opportunity_id: z.string().uuid().optional().nullable(),
  include_closed: z.boolean().optional().nullable(),
});
export type ListDealDeadlinesArgs = z.infer<typeof ListDealDeadlinesArgs>;

export const CompleteDealDeadlineArgs = z.object({
  deadline_id: z.string().uuid(),
});
export type CompleteDealDeadlineArgs = z.infer<typeof CompleteDealDeadlineArgs>;

export const CancelDealDeadlineArgs = z.object({
  deadline_id: z.string().uuid(),
  reason: z.string().max(300).optional().nullable(),
});
export type CancelDealDeadlineArgs = z.infer<typeof CancelDealDeadlineArgs>;

export const CompleteFollowUpArgs = z.object({
  follow_up_ids: z.array(z.string().uuid()).max(50).optional().nullable(),
  subject_hint: z.string().min(2).max(160).optional().nullable(),
  notes: z.string().max(300).optional().nullable(),
});
export type CompleteFollowUpArgs = z.infer<typeof CompleteFollowUpArgs>;

export const SendReminderNowArgs = z.object({
  reminder_id: z.string().uuid().optional().nullable(),
  subject_hint: z.string().min(2).max(120).optional().nullable(),
  override_text: z.string().optional().nullable(),
});
export type SendReminderNowArgs = z.infer<typeof SendReminderNowArgs>;

// ---------- Prospeção imobiliária ----------

const SourceType = z.enum([
  "street_sign",
  "online_listing",
  "referral",
  "direct_observation",
  "other",
]);
const ListingType = z.enum(["owner_sale", "other_agency", "own_agency", "unknown"]);
const LeadStatus = z.enum([
  "to_contact",
  "contact_attempted",
  "contacted",
  "no_interest",
  "opportunity",
  "converted",
  "archived",
]);

export const CreateProspectingLeadArgs = z.object({
  title: z.string().optional().nullable(),
  phone: z.string().optional().nullable(),
  location: z.string().optional().nullable(),
  address_hint: z.string().optional().nullable(),
  property_type: z.string().optional().nullable(),
  typology: z.string().optional().nullable(),
  source_type: SourceType.default("street_sign"),
  listing_type: ListingType.default("unknown"),
  agency_name: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});
export type CreateProspectingLeadArgs = z.infer<typeof CreateProspectingLeadArgs>;

export const SearchProspectingLeadsArgs = z.object({
  query: z.string().optional().nullable(),
  phone: z.string().optional().nullable(),
  location: z.string().optional().nullable(),
  status: LeadStatus.optional().nullable(),
});
export type SearchProspectingLeadsArgs = z.infer<typeof SearchProspectingLeadsArgs>;

export const UpdateProspectingLeadArgs = z.object({
  id: z.string().uuid(),
  title: z.string().optional().nullable(),
  phone: z.string().optional().nullable(),
  location: z.string().optional().nullable(),
  address_hint: z.string().optional().nullable(),
  agency_name: z.string().optional().nullable(),
  property_type: z.string().optional().nullable(),
  typology: z.string().optional().nullable(),
  listing_type: ListingType.optional().nullable(),
  source_type: SourceType.optional().nullable(),
  status: LeadStatus.optional().nullable(),
  notes: z.string().optional().nullable(),
});
export type UpdateProspectingLeadArgs = z.infer<typeof UpdateProspectingLeadArgs>;

// Editar é execução directa: o consultor pede, o Assessor altera e mostra o
// antes/depois. Não há pergunta de confirmação por conversa.
export const UpdatePersonArgs = z.object({
  id: z.string().uuid(),
  name: z.string().optional().nullable(),
  phone: z.string().optional().nullable(),
  email: z.string().optional().nullable(),
  relationship_type: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  // Estado do lead — usado pelo registo de visitas, não exposto ao modelo.
  summary: z.string().optional().nullable(),
  next_action: z.string().optional().nullable(),
  next_action_date: z.string().optional().nullable(),
});
export type UpdatePersonArgs = z.infer<typeof UpdatePersonArgs>;

export const UpdatePropertyArgs = z.object({
  id: z.string().uuid(),
  title: z.string().optional().nullable(),
  address: z.string().optional().nullable(),
  typology: z.string().optional().nullable(),
  asking_price: z.number().optional().nullable(),
  status: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  /** Proprietário já identificado (id validado). */
  owner_person_id: z.string().uuid().optional().nullable(),
  /** Proprietário dito por nome — resolvido antes de escrever. */
  owner_name: z.string().optional().nullable(),
});
export type UpdatePropertyArgs = z.infer<typeof UpdatePropertyArgs>;

// Não existe ferramenta de apagar: por conversa só se arquiva, e é reversível.
export const ArchiveRecordArgs = z.object({
  entity: z.enum(["person", "property", "deal", "follow_up", "movement", "interaction"]),
  id: z.string().uuid(),
  undo: z.boolean().optional().nullable(),
});
export type ArchiveRecordArgs = z.infer<typeof ArchiveRecordArgs>;

// ---------- specs OpenAI/Gateway (function-calling) ----------

export const TOOL_SPECS: GatewayToolSpec[] = [
  {
    type: "function",
    function: {
      name: "search_people",
      description:
        "Procura pessoas do consultor por nome parcial (case-insensitive). Devolve uma lista curta com id, nome, telefone e papel. Usa antes de criar uma pessoa nova.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Nome ou parte do nome." },
          relationship_type: {
            type: ["string", "null"],
            description: "Filtro opcional pelo papel (proprietário, comprador, etc.).",
          },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_person",
      description:
        "Cria uma pessoa no directório do consultor. Só invoca se search_people não devolveu ninguém com o mesmo nome.",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string" },
          phone: { type: ["string", "null"] },
          email: { type: ["string", "null"] },
          relationship_type: {
            type: "string",
            enum: [
              "proprietario",
              "comprador",
              "potencial_cliente",
              "parceiro",
              "referencia",
              "outro",
            ],
          },
          summary: { type: ["string", "null"] },
        },
        required: ["name", "relationship_type"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "search_properties",
      description:
        "Procura imóveis do consultor por título/morada/localidade parciais. Devolve id, título, tipologia, localidade, estado. Usa antes de criar um imóvel.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string" },
          status: { type: ["string", "null"] },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "search_files",
      description:
        "Lista ficheiros/documentos guardados no Drive Inteligente do consultor. Sem query devolve todos os mais recentes — usa sempre esta ferramenta quando o consultor pede a lista de ficheiros ou documentos, nunca peças para afunilar antes de mostrar.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Texto livre no nome, resumo ou tipo. Vazio = todos." },
          document_type: { type: ["string", "null"] },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_property",
      description:
        "Cria uma ficha de imóvel. Preenche o que sabes; o consultor pode enriquecer depois.",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string", description: "Nome curto (ex.: 'T3 Espinho', 'Moradia Boavista')." },
          property_type: { type: ["string", "null"] },
          typology: { type: ["string", "null"], description: "Ex.: T3, V4." },
          location: { type: ["string", "null"] },
          status: {
            type: ["string", "null"],
            enum: [
              "por_angariar",
              "em_angariacao",
              "angariado",
              "activo",
              "reservado",
              "vendido",
              "arquivado",
              null,
            ],
          },
          owner_person_id: { type: ["string", "null"], format: "uuid" },
          asking_price: { type: ["number", "null"] },
        },
        required: ["title"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "search_agenda",
      description:
        "Devolve os compromissos e seguimentos do consultor. Usa `date` (YYYY-MM-DD) sempre que ele indica um dia concreto ('dia 31', '31 de agosto', 'na segunda dia 31'); só usa `period` quando ele fala de hoje, amanhã, esta semana ou a próxima. Nunca respondas a um dia concreto com um período.",
      parameters: {
        type: "object",
        properties: {
          period: {
            type: ["string", "null"],
            enum: ["today", "tomorrow", "week", "next_week", null],
          },
          date: { type: ["string", "null"], description: "Dia concreto YYYY-MM-DD" },
        },
        required: [],
      },
    },
  },
  // Email: o Afonso NÃO lê a caixa de entrada (decisão de 26/08). As
  // ferramentas de leitura (search_emails, summarize_email, draft_email_reply)
  // continuam no código mas fora desta lista, para o modelo não as oferecer.
  {
    type: "function",
    function: {
      name: "compose_email_to_contact",
      description:
        "Prepara um RASCUNHO de email de INICIATIVA para uma pessoa da lista do consultor ('manda um email à Ana sobre o apartamento', 'escreve ao Nuno a dar seguimento'). Nunca envia: o rascunho é sempre mostrado e o envio depende de o consultor dizer 'enviar'. Passa person_id quando o tens de search_people, senão person_name com o nome que ele disse. Em instructions põe o que ele quer dizer. Se ele te der um endereço de email, passa-o em email.",
      parameters: {
        type: "object",
        properties: {
          person_id: { type: ["string", "null"], format: "uuid" },
          person_name: { type: ["string", "null"] },
          email: { type: ["string", "null"], description: "Endereço, só quando o consultor o der." },
          subject: { type: ["string", "null"], description: "Assunto, só se ele o disser." },
          instructions: { type: ["string", "null"] },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_event",
      description:
        "Cria um evento (visita, reunião de angariação, chamada) na agenda do consultor. Data em YYYY-MM-DD e hora em HH:MM (Europe/Lisbon). Associa person_id e property_id quando já os tens (obtém-nos de search_people/search_properties). Se reminder_minutes for definido, será criado o lembrete.",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string" },
          event_type: { type: "string", enum: ["visita", "reuniao_angariacao", "chamada", "outro"] },
          date: { type: "string", description: "YYYY-MM-DD" },
          start_time: { type: "string", description: "HH:MM (24h)" },
          duration_minutes: { type: ["integer", "null"] },
          location: { type: ["string", "null"] },
          person_id: { type: ["string", "null"], format: "uuid" },
          property_id: { type: ["string", "null"], format: "uuid" },
          reminder_minutes: { type: ["integer", "null"], description: "Minutos antes para lembrar." },
          notes: { type: ["string", "null"] },
        },
        required: ["title", "date", "start_time"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_follow_up",
      description:
        "Cria um seguimento/lembrete simples. Usa quando o consultor pede 'lembra-me de X'.",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string" },
          type: { type: "string", enum: ["chamada", "email", "mensagem", "tarefa", "outro"] },
          due_date: { type: "string", description: "YYYY-MM-DD" },
          due_time: { type: ["string", "null"], description: "HH:MM opcional." },
          priority: { type: "string", enum: ["baixa", "media", "alta"] },
          person_id: { type: ["string", "null"], format: "uuid" },
          property_id: { type: ["string", "null"], format: "uuid" },
          notes: { type: ["string", "null"] },
        },
        required: ["title", "due_date"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "save_interaction",
      description:
        "Regista uma interacção informada pelo consultor (falei, reuni, telefonei). Requer resumo. Não pede confirmação — é registo passivo.",
      parameters: {
        type: "object",
        properties: {
          summary: { type: "string" },
          person_id: { type: ["string", "null"], format: "uuid" },
          property_id: { type: ["string", "null"], format: "uuid" },
          interaction_type: { type: ["string", "null"] },
          occurred_at: { type: ["string", "null"] },
        },
        required: ["summary"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_routine",
      description:
        "Cria um lembrete RECORRENTE ('todos os dias às 9:45', 'todas as segundas às 10h', 'no dia 1 de cada mês'). Usa sempre que o pedido se repete no tempo — create_follow_up é só para uma vez. Dois tipos: kind='follow_up' (cria um seguimento a fazer) e kind='digest' (o Afonso faz a leitura na hora e envia o resumo, ex.: 'resume-me os leads sem resposta às 18h' → kind='digest', digest_query='leads sem resposta').",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string" },
          frequency: { type: "string", enum: ["daily", "weekly", "monthly"] },
          time_of_day: { type: "string", description: "HH:MM" },
          interval_n: { type: ["integer", "null"], description: "De quantos em quantos períodos (1 por defeito)." },
          weekday: { type: ["integer", "null"], description: "0=Domingo .. 6=Sábado (só frequency=weekly)." },
          day_of_month: { type: ["integer", "null"], description: "1-31 (só frequency=monthly)." },
          priority: { type: ["string", "null"], enum: ["baixa", "media", "alta", null] },
          person_id: { type: ["string", "null"], format: "uuid" },
          notes: { type: ["string", "null"] },
          kind: { type: ["string", "null"], enum: ["follow_up", "digest", null] },
          digest_query: { type: ["string", "null"], description: "O que resumir (só kind=digest)." },
        },
        required: ["title", "frequency", "time_of_day"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "read_settings",
      description:
        "Lê as definições do consultor (plano, briefing, resumo de fim de dia, check-in, avisos, silêncio, lembretes, autonomia, canais). Usa para 'que plano tenho?', 'como está o meu briefing/resumo configurado?'.",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  {
    type: "function",
    function: {
      name: "update_setting",
      description:
        "Altera uma definição reversível (hora/dias do briefing, hora e detalhe do resumo, hora do check-in, teto de avisos, horas de silêncio, antecedência dos lembretes, autonomia). Plano, pagamentos, ligações de contas e fusão de contas NÃO se mudam por aqui. Chama primeiro sem confirmed para propor, e só com confirmed=true depois do consultor confirmar.",
      parameters: {
        type: "object",
        properties: {
          setting: { type: "string", description: "Definição a mudar (chave técnica ou como o consultor a disse)." },
          value: { description: "Novo valor (hora HH:MM, número, 'curto'|'normal'|'detalhado', nível de autonomia, dias)." },
          confirmed: { type: ["boolean", "null"], description: "true só depois de o consultor confirmar." },
        },
        required: ["setting"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_routines",
      description: "Lista as rotinas do consultor (recorrências). Usa quando ele pergunta 'que rotinas tenho?'.",
      parameters: {
        type: "object",
        properties: { only_active: { type: ["boolean", "null"] } },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "update_routine",
      description: "Altera uma rotina existente (hora, frequência, tipo, título, activa/inactiva). Nunca cria uma nova.",
      parameters: {
        type: "object",
        properties: {
          routine_id: { type: ["string", "null"], format: "uuid" },
          subject_hint: { type: ["string", "null"], description: "Título aproximado quando não há identificador." },
          title: { type: ["string", "null"] },
          frequency: { type: ["string", "null"], enum: ["daily", "weekly", "monthly", null] },
          time_of_day: { type: ["string", "null"], description: "HH:MM" },
          interval_n: { type: ["integer", "null"] },
          weekday: { type: ["integer", "null"] },
          day_of_month: { type: ["integer", "null"] },
          kind: { type: ["string", "null"], enum: ["follow_up", "digest", null] },
          digest_query: { type: ["string", "null"] },
          active: { type: ["boolean", "null"] },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "delete_routine",
      description: "Apaga definitivamente uma rotina — deixa de disparar. Usa quando o consultor diz 'apaga a rotina X'.",
      parameters: {
        type: "object",
        properties: {
          routine_id: { type: ["string", "null"], format: "uuid" },
          subject_hint: { type: ["string", "null"] },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "save_miscellaneous",
      description:
        "Guarda uma nota profissional em Diversos quando não encaixa em nenhum outro módulo. Não pede confirmação.",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string" },
          summary: { type: ["string", "null"] },
          category: { type: ["string", "null"] },
          tags: { type: ["array", "null"], items: { type: "string" } },
        },
        required: ["title"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_financial_movement",
      description:
        "Regista movimentos financeiros do consultor: comissões e despesas. Usa para frases como 'comissão 5.000€', 'produção 10.000€+IVA', 'fechei negócio por 200.000€', ou despesas pagas. Se houver valor do negócio/produção, cria ou associa uma oportunidade e guarda esses valores nas notas da oportunidade; a comissão/despesa fica em financial_movements.",
      parameters: {
        type: "object",
        properties: {
          type: { type: "string", enum: ["commission", "expense"] },
          amount: { type: "number", description: "Valor da comissão ou despesa em euros." },
          description: { type: "string" },
          status: { type: "string", enum: ["Prevista", "Faturada", "Recebida"] },
          movement_date: { type: ["string", "null"], description: "YYYY-MM-DD; se faltar, o backend usa hoje." },
          category: { type: ["string", "null"] },
          vat_amount: { type: ["number", "null"] },
          opportunity_id: { type: ["string", "null"], format: "uuid" },
          property_id: { type: ["string", "null"], format: "uuid" },
          deal_value: { type: ["number", "null"], description: "Valor total do negócio, ex.: 200000." },
          production_amount: { type: ["number", "null"], description: "Produção/faturação antes de IVA, se explícita." },
          property_reference: { type: ["string", "null"], description: "Imóvel referido, ex.: terreno, T3, moradia." },
          opportunity_title: { type: ["string", "null"] },
        },
        required: ["type", "amount", "description"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_prospecting_lead",
      description:
        "Regista uma oportunidade de prospeção (placa na rua, número visto de longe, referência, anúncio). Usa quando o consultor descreve um imóvel à venda que ainda NÃO angariou: 'placa', 'vende-se', 'vi um apartamento à venda', 'número na placa', 'regista para ligar', 'particular', 'outra agência'. NÃO uses create_person nem create_property nestes casos — o proprietário e o imóvel ainda são desconhecidos. Deixa em branco tudo o que não estiver explícito (nome, morada exacta, preço, tipologia). Antes de invocar, procura duplicados com search_prospecting_leads se tiveres o telefone.",
      parameters: {
        type: "object",
        properties: {
          title: {
            type: ["string", "null"],
            description:
              "Título natural, ex.: 'Apartamento junto ao Castelo — Santa Maria da Feira'. Se null, é gerado automaticamente.",
          },
          phone: { type: ["string", "null"], description: "Telefone visto na placa/anúncio, se legível." },
          location: { type: ["string", "null"], description: "Localidade principal (cidade, freguesia)." },
          address_hint: {
            type: ["string", "null"],
            description: "Referência local (rua, ponto de referência, ex.: 'junto ao Castelo').",
          },
          property_type: { type: ["string", "null"], description: "Ex.: apartamento, moradia, terreno." },
          typology: { type: ["string", "null"], description: "T2, T3, V4… apenas se explícito." },
          source_type: {
            type: "string",
            enum: ["street_sign", "online_listing", "referral", "direct_observation", "other"],
          },
          listing_type: {
            type: "string",
            enum: ["owner_sale", "other_agency", "own_agency", "unknown"],
            description: "unknown por defeito. Só usar owner_sale se aparecer 'particular', 'próprio', 'vende-se por particular'.",
          },
          agency_name: { type: ["string", "null"], description: "Nome da agência (ex.: ERA, Remax) se visível." },
          notes: { type: ["string", "null"] },
        },
        required: ["source_type"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "search_prospecting_leads",
      description:
        "Procura placas/leads de prospeção do consultor. Usa para detectar duplicados antes de criar (por telefone) ou para responder a perguntas tipo 'que placas registei em Canelas?'.",
      parameters: {
        type: "object",
        properties: {
          query: { type: ["string", "null"], description: "Texto livre a procurar no título/notas." },
          phone: { type: ["string", "null"] },
          location: { type: ["string", "null"] },
          status: {
            type: ["string", "null"],
            enum: [
              "to_contact",
              "contact_attempted",
              "contacted",
              "no_interest",
              "opportunity",
              "converted",
              "archived",
              null,
            ],
          },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "update_prospecting_lead",
      description:
        "Actualiza uma placa/lead existente (marcar contactado, sem interesse, converter em oportunidade, corrigir localização, adicionar notas). Requer id obtido de search_prospecting_leads.",
      parameters: {
        type: "object",
        properties: {
          id: { type: "string", format: "uuid" },
          title: { type: ["string", "null"] },
          phone: { type: ["string", "null"] },
          location: { type: ["string", "null"] },
          address_hint: { type: ["string", "null"] },
          agency_name: { type: ["string", "null"] },
          property_type: { type: ["string", "null"] },
          typology: { type: ["string", "null"] },
          listing_type: {
            type: ["string", "null"],
            enum: ["owner_sale", "other_agency", "own_agency", "unknown", null],
          },
          source_type: {
            type: ["string", "null"],
            enum: ["street_sign", "online_listing", "referral", "direct_observation", "other", null],
          },
          status: {
            type: ["string", "null"],
            enum: [
              "to_contact",
              "contact_attempted",
              "contacted",
              "no_interest",
              "opportunity",
              "converted",
              "archived",
              null,
            ],
          },
          notes: { type: ["string", "null"] },
        },
        required: ["id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "update_person",
      description:
        "Altera dados de uma pessoa já existente (nome, telefone, email, relação, notas). Execução directa: não perguntes confirmação, altera e diz o que estava antes e o que ficou. Requer id obtido de search_people.",
      parameters: {
        type: "object",
        properties: {
          id: { type: "string", format: "uuid" },
          name: { type: ["string", "null"] },
          phone: { type: ["string", "null"] },
          email: { type: ["string", "null"] },
          relationship_type: { type: ["string", "null"] },
          notes: { type: ["string", "null"] },
        },
        required: ["id"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "update_property",
      description:
        "Altera dados de um imóvel já existente (título, morada, tipologia, preço, estado, notas) e permite associar o proprietário (owner_person_id, ou owner_name quando só sabes o nome). Execução directa, com recibo do antes/depois. Requer id obtido de search_properties.",
      parameters: {
        type: "object",
        properties: {
          id: { type: "string", format: "uuid" },
          title: { type: ["string", "null"] },
          address: { type: ["string", "null"] },
          typology: { type: ["string", "null"] },
          asking_price: { type: ["number", "null"] },
          status: { type: ["string", "null"] },
          notes: { type: ["string", "null"] },
          owner_person_id: { type: ["string", "null"] },
          owner_name: { type: ["string", "null"] },
        },
        required: ["id"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "archive_record",
      description:
        "Arquiva um registo (sai das listas, continua na ficha e pode ser reposto). Usa isto sempre que o consultor pedir para apagar, eliminar ou remover — nunca apagas nada definitivamente. Com undo=true, repõe o registo.",
      parameters: {
        type: "object",
        properties: {
          entity: { type: "string", enum: ["person", "property", "deal", "follow_up", "movement", "interaction"] },
          id: { type: "string", format: "uuid" },
          undo: { type: ["boolean", "null"] },
        },
        required: ["entity", "id"],
        additionalProperties: false,
      },
    },
  },
];

// Ferramentas de lembretes (reminders) — SEMPRE que o consultor pedir
// para reagendar, cancelar, ver ou enviar-lhe já um aviso.
TOOL_SPECS.push(
  {
    type: "function",
    function: {
      name: "reschedule_reminder",
      description:
        "Reagenda um lembrete activo do consultor. Usa sempre que o consultor pedir 'passa para X', 'adia para Y', 'muda o aviso para Z'. Podes identificar o lembrete por reminder_id (se souberes), por (related_resource_type, related_resource_id), ou por subject_hint (texto livre com o assunto do seguimento, ex.: 'ligar ao Paulo'). Se houver ambiguidade, o sistema devolve candidatos e responde pedindo desambiguação — não crias novo aviso.",
      parameters: {
        type: "object",
        properties: {
          reminder_id: { type: ["string", "null"], format: "uuid" },
          related_resource_type: {
            type: ["string", "null"],
            enum: ["follow_up", "event", "prospecting_lead", "other", null],
          },
          related_resource_id: { type: ["string", "null"], format: "uuid" },
          subject_hint: {
            type: ["string", "null"],
            description: "Assunto do aviso em linguagem natural, ex.: 'ligar ao Paulo'.",
          },
          new_date: { type: "string", description: "YYYY-MM-DD (Europe/Lisbon)" },
          new_time: { type: "string", description: "HH:MM (24h, Europe/Lisbon)" },
          timezone: { type: "string", enum: ["Europe/Lisbon"] },
          reason: { type: ["string", "null"] },
        },
        required: ["new_date", "new_time", "timezone"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "search_active_reminders",
      description:
        "Procura lembretes activos do consultor (agendados ou falhados). Usa antes de reagendar quando não sabes o id, ou quando o consultor pergunta 'que avisos tenho?'. Devolve id, assunto, data/hora agendada e estado.",
      parameters: {
        type: "object",
        properties: {
          query: { type: ["string", "null"], description: "Texto livre no assunto." },
          related_resource_type: {
            type: ["string", "null"],
            enum: ["follow_up", "event", "prospecting_lead", "other", null],
          },
          related_resource_id: { type: ["string", "null"], format: "uuid" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "cancel_reminder",
      description:
        "Cancela um lembrete activo. Usa quando o consultor pede 'esquece o aviso', 'cancela o lembrete'.",
      parameters: {
        type: "object",
        properties: {
          reminder_id: { type: "string", format: "uuid" },
        },
        required: ["reminder_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "send_reminder_now",
      description:
        "Envia um lembrete imediatamente pelo WhatsApp do consultor. Usa quando o consultor diz 'avisa-me já', 'manda agora' ou quando um lembrete falhou e o consultor pede para ser avisado agora.",
      parameters: {
        type: "object",
        properties: {
          reminder_id: { type: ["string", "null"], format: "uuid" },
          subject_hint: { type: ["string", "null"] },
          override_text: { type: ["string", "null"] },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_property_categories",
      description:
        "Devolve as categorias de imóveis do consultor (nome e cor). Usa antes de sugerir uma categoria, para propores sempre nomes que já existem.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "list_uncategorized_properties",
      description:
        "Devolve os imóveis do consultor que ainda não têm categoria, com título, tipo, localização, origem e notas. Usa SÓ quando o consultor pede explicitamente para organizar os imóveis por categoria.",
      parameters: {
        type: "object",
        properties: { limit: { type: ["number", "null"] } },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "set_property_category",
      description:
        "Atribui a categoria a um imóvel. Só podes usar DEPOIS de o consultor confirmar a categoria proposta. category_name vazio ou null tira a categoria.",
      parameters: {
        type: "object",
        properties: {
          property_id: { type: "string", format: "uuid" },
          property_query: { type: ["string", "null"] },
          category_name: { type: ["string", "null"] },
        },
        required: [],
      },
    },
  },
);

// ---------- registo Zod (nome → schema) ----------


// Negócio: o fio que une pessoa, imóvel e dinheiro. Proposto pelo Afonso,
// criado só com o "sim" do consultor.
TOOL_SPECS.push(
  {
    type: "function",
    function: {
      name: "search_deals",
      description:
        "Procura negócios do consultor (em curso e arquivados). Usa ANTES de propor criar um negócio, para não repetir um que já existe, e quando o consultor pergunta 'que negócios tenho?'.",
      parameters: {
        type: "object",
        properties: {
          query: { type: ["string", "null"], description: "Texto livre no título." },
          person_id: { type: ["string", "null"], format: "uuid" },
          property_id: { type: ["string", "null"], format: "uuid" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_deal",
      description:
        "Cria o negócio que une pessoa + imóvel + dinheiro de um processo comercial real (angariação ganha, sequência de visitas ao mesmo imóvel, comissão registada sem negócio). NUNCA invoques esta ferramenta sem o consultor ter confirmado explicitamente nesta conversa: para propor, usa o memory_write propose_deal. Exige pessoa (ou imóvel) e um objetivo claro no título.",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string", description: "Ex.: 'Venda da moradia em Canelas'." },
          kind: { type: ["string", "null"], enum: ["venda", "compra", "arrendamento", "angariacao", "investimento", "outro", null] },
          stage: { type: ["string", "null"], description: "Fase inicial; por omissão 'preparacao' (A começar)." },
          person_id: { type: ["string", "null"], format: "uuid" },
          property_id: { type: ["string", "null"], format: "uuid" },
          value: { type: ["number", "null"] },
          notes: { type: ["string", "null"] },
          link_movement_ids: { type: ["array", "null"], items: { type: "string", format: "uuid" } },
        },
        required: ["title"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "add_deal_deadline",
      description:
        "Regista um PRAZO com consequência dentro de um negócio ('escritura dia 15 de outubro', 'prazo de financiamento até 20 de setembro', 'fim do período de exclusividade'). Não é compromisso de agenda nem tarefa: é um marco que o Afonso passa a antecipar. Passa opportunity_id se o souberes; senão deal_hint com o que o consultor disse (pessoa, imóvel ou nome do negócio). Só depois de o consultor confirmar.",
      parameters: {
        type: "object",
        properties: {
          opportunity_id: { type: ["string", "null"], format: "uuid" },
          deal_hint: { type: ["string", "null"], description: "O que o consultor disse para identificar o negócio." },
          label: { type: "string", description: "Nome livre do prazo: 'Escritura', 'Financiamento', 'Exclusividade'." },
          due_date: { type: "string", description: "YYYY-MM-DD." },
          notice_days: { type: ["number", "null"], description: "Antecedência pedida, em dias ('avisa-me com duas semanas' = 14)." },
          notes: { type: ["string", "null"] },
        },
        required: ["label", "due_date"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_deal_deadlines",
      description: "Mostra os prazos registados — de um negócio (opportunity_id) ou de todos ('que prazos tenho?').",
      parameters: {
        type: "object",
        properties: {
          opportunity_id: { type: ["string", "null"], format: "uuid" },
          include_closed: { type: ["boolean", "null"] },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "complete_deal_deadline",
      description: "Marca um prazo de negócio como cumprido ('a escritura já foi feita'). Exige o deadline_id vindo de list_deal_deadlines.",
      parameters: { type: "object", properties: { deadline_id: { type: "string", format: "uuid" } }, required: ["deadline_id"] },
    },
  },
  {
    type: "function",
    function: {
      name: "cancel_deal_deadline",
      description: "Cancela um prazo de negócio que deixou de fazer sentido. Exige o deadline_id vindo de list_deal_deadlines.",
      parameters: {
        type: "object",
        properties: { deadline_id: { type: "string", format: "uuid" }, reason: { type: ["string", "null"] } },
        required: ["deadline_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "search_similar_listings",
      description:
        "Procura na web anúncios de imóveis SEMELHANTES a um imóvel do consultor ('imóveis parecidos ao T3 de Gaia', 'o que há no mercado como este', 'comparáveis'). Só a pedido explícito. NÃO é avaliação nem estimativa de valor: devolve anúncios publicados como referência rápida. Passa property_id se o tiveres do search_properties, senão property_query com a morada/título dito.",
      parameters: {
        type: "object",
        properties: {
          property_id: { type: ["string", "null"], format: "uuid" },
          property_query: { type: ["string", "null"], description: "Morada ou título dito pelo consultor." },
          typology: { type: ["string", "null"], description: "T2, T3, moradia… se o consultor disser." },
          location: { type: ["string", "null"], description: "Zona, se o consultor disser." },
        },
      },
    },
  },
);

export const ZOD_BY_TOOL: Record<string, z.ZodTypeAny> = {
  search_people: SearchPeopleArgs,
  create_person: CreatePersonArgs,
  search_properties: SearchPropertiesArgs,
  search_files: SearchFilesArgs,
  search_emails: SearchEmailsArgs,
  summarize_email: SummarizeEmailArgs,
  draft_email_reply: DraftEmailReplyArgs,
  compose_email_to_contact: ComposeEmailToContactArgs,
  create_property: CreatePropertyArgs,
  search_agenda: SearchAgendaArgs,
  create_event: CreateEventArgs,
  create_follow_up: CreateFollowUpArgs,
  save_interaction: SaveInteractionArgs,
  create_routine: CreateRoutineArgs,
  set_routine_active: SetRoutineActiveArgs,
  list_routines: ListRoutinesArgs,
  read_settings: ReadSettingsArgs,
  update_setting: UpdateSettingArgs,
  update_routine: UpdateRoutineArgs,
  delete_routine: DeleteRoutineArgs,
  save_miscellaneous: SaveMiscellaneousArgs,
  create_financial_movement: CreateFinancialMovementArgs,
  create_deal: CreateDealArgs,
  search_deals: SearchDealsArgs,
  create_prospecting_lead: CreateProspectingLeadArgs,
  search_prospecting_leads: SearchProspectingLeadsArgs,
  update_prospecting_lead: UpdateProspectingLeadArgs,
  update_person: UpdatePersonArgs,
  update_property: UpdatePropertyArgs,
  archive_record: ArchiveRecordArgs,
  reschedule_reminder: RescheduleReminderArgs,
  search_active_reminders: SearchActiveRemindersArgs,
  cancel_reminder: CancelReminderArgs,
  cancel_follow_up: CancelFollowUpArgs,
  complete_follow_up: CompleteFollowUpArgs,
  send_reminder_now: SendReminderNowArgs,
  list_property_categories: ListPropertyCategoriesArgs,
  list_uncategorized_properties: ListUncategorizedPropertiesArgs,
  set_property_category: SetPropertyCategoryArgs,
  search_similar_listings: SearchSimilarListingsArgs,
  add_deal_deadline: AddDealDeadlineArgs,
  list_deal_deadlines: ListDealDeadlinesArgs,
  complete_deal_deadline: CompleteDealDeadlineArgs,
  cancel_deal_deadline: CancelDealDeadlineArgs,
};

export const TOOL_NAMES = Object.keys(ZOD_BY_TOOL);
