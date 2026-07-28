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

export const SearchPeopleArgs = z.object({
  query: z.string().min(1),
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
  query: z.string().min(1),
  status: z.string().optional().nullable(),
});
export type SearchPropertiesArgs = z.infer<typeof SearchPropertiesArgs>;

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
  period: z.enum(["today", "tomorrow", "week", "next_week"]),
});
export type SearchAgendaArgs = z.infer<typeof SearchAgendaArgs>;

const IsoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD");
const HhMm = z.string().regex(/^\d{2}:\d{2}$/, "HH:MM");

export const CreateEventArgs = z.object({
  title: z.string().min(1),
  event_type: z.enum(["visita", "reuniao_angariacao", "chamada", "outro"]).default("visita"),
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
  type: z.enum(["chamada", "email", "mensagem", "tarefa", "outro"]).default("tarefa"),
  due_date: IsoDate,
  due_time: HhMm.optional().nullable(),
  priority: z.enum(["baixa", "media", "alta"]).default("media"),
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
});
export type SaveInteractionArgs = z.infer<typeof SaveInteractionArgs>;

export const SaveMiscellaneousArgs = z.object({
  title: z.string().min(1),
  summary: z.string().optional().nullable(),
  category: z.string().optional().nullable(),
  tags: z.array(z.string()).optional().nullable(),
});
export type SaveMiscellaneousArgs = z.infer<typeof SaveMiscellaneousArgs>;

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
        "Devolve os compromissos e seguimentos do consultor num período (hoje, amanhã, esta semana, próxima semana), agrupados por dia.",
      parameters: {
        type: "object",
        properties: {
          period: {
            type: "string",
            enum: ["today", "tomorrow", "week", "next_week"],
          },
        },
        required: ["period"],
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
];

// ---------- registo Zod (nome → schema) ----------

export const ZOD_BY_TOOL: Record<string, z.ZodTypeAny> = {
  search_people: SearchPeopleArgs,
  create_person: CreatePersonArgs,
  search_properties: SearchPropertiesArgs,
  create_property: CreatePropertyArgs,
  search_agenda: SearchAgendaArgs,
  create_event: CreateEventArgs,
  create_follow_up: CreateFollowUpArgs,
  save_interaction: SaveInteractionArgs,
  save_miscellaneous: SaveMiscellaneousArgs,
};

export const TOOL_NAMES = Object.keys(ZOD_BY_TOOL);
