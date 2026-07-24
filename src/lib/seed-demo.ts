import { supabase } from "@/integrations/supabase/client";

const iso = (offset: number, h?: number, m?: number) => {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  if (h != null) d.setHours(h, m ?? 0, 0, 0);
  else d.setHours(0, 0, 0, 0);
  return d.toISOString();
};

export async function seedDemoData(userId: string) {
  const people = [
    { user_id: userId, name: "Ana Silva", phone: "+351 912 345 678", email: "ana.silva@email.pt", relationship_type: "Cliente",
      summary: "Procura T2 em Alvalade até 320k. Financiamento pré-aprovado.",
      next_action: "Marcar visita ao apartamento na Rua João Saraiva", next_action_date: iso(0, 10, 30) },
    { user_id: userId, name: "Miguel Costa", phone: "+351 933 221 100", email: "miguel.costa@email.pt", relationship_type: "Proprietário",
      summary: "Proprietário do T3 em Campo de Ourique. Aberto a propostas acima de 480k.",
      next_action: "Enviar relatório de visitas da semana", next_action_date: iso(1) },
    { user_id: userId, name: "Rita Fernandes", phone: "+351 964 112 998", email: "rita.fernandes@email.pt", relationship_type: "Potencial",
      summary: "Indicada pela Ana. Investidora em arrendamento estudantil.",
      next_action: "Ligar para apresentar carteira", next_action_date: iso(-1) },
  ];
  const { data: peopleRows, error: pErr } = await supabase.from("people").insert(people).select("*");
  if (pErr) throw pErr;
  const ana = peopleRows?.find((p) => p.name === "Ana Silva");
  const miguel = peopleRows?.find((p) => p.name === "Miguel Costa");

  const { data: propRows } = await supabase.from("properties").insert([
    { user_id: userId, title: "T2 Rua João Saraiva", property_type: "T2", location: "Alvalade, Lisboa",
      value: 315000, status: "Em preparação", owner_person_id: miguel?.id, notes: "Cozinha renovada em 2023." },
    { user_id: userId, title: "T3 Campo de Ourique", property_type: "T3", location: "Campo de Ourique, Lisboa",
      value: 485000, status: "Angariado", owner_person_id: miguel?.id, notes: "Andar alto, com varanda." },
  ]).select("*");
  const t2 = propRows?.find((p) => p.title.includes("Alvalade"));

  await supabase.from("opportunities").insert([
    { user_id: userId, person_id: ana?.id, property_id: t2?.id, type: "Compra", status: "Visita",
      value: 315000, probability: "Alta", next_action: "Confirmar visita de hoje 10:30", next_action_date: iso(0, 10, 30) },
  ]);

  await supabase.from("follow_ups").insert([
    { user_id: userId, type: "Evento", title: "Visita — Ana Silva (T2 Alvalade)", due_date: iso(0, 10, 30),
      due_time: "10:30", person_id: ana?.id, status: "Pendente", priority: "Alta" },
    { user_id: userId, type: "Tarefa", title: "Enviar relatório de visitas ao Miguel", due_date: iso(0),
      person_id: miguel?.id, status: "Pendente", priority: "Média" },
    { user_id: userId, type: "Tarefa", title: "Ligar à Rita Fernandes", due_date: iso(-1),
      status: "Pendente", priority: "Alta" },
  ]);

  await supabase.from("financial_movements").insert([
    { user_id: userId, type: "commission", description: "Comissão prevista T2", amount: 9450, status: "Prevista", movement_date: iso(20) },
    { user_id: userId, type: "expense", description: "Combustível — visitas", category: "Deslocação", amount: 78.4, status: "Recebida", movement_date: iso(-3) },
  ]);
}

export async function resetAccount(userId: string) {
  await supabase.from("assessor_messages").delete().eq("user_id", userId);
  await supabase.from("interactions").delete().eq("user_id", userId);
  await supabase.from("financial_movements").delete().eq("user_id", userId);
  await supabase.from("follow_ups").delete().eq("user_id", userId);
  await supabase.from("opportunities").delete().eq("user_id", userId);
  await supabase.from("properties").delete().eq("user_id", userId);
  await supabase.from("people").delete().eq("user_id", userId);
}