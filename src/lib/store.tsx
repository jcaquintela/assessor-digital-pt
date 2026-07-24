import { createContext, useCallback, useContext, useMemo, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  type Comissao,
  type Despesa,
  type Documento,
  type EntradaAssessor,
  type Imovel,
  type Oportunidade,
  type Pessoa,
  type Seguimento,
} from "./demo-data";

/* ---------- DB row → domain mappers ---------- */

type Row = Record<string, any>;

const toPessoa = (r: Row): Pessoa => ({
  id: r.id,
  nome: r.name ?? "",
  telefone: r.phone ?? "",
  email: r.email ?? "",
  relacao: (r.relationship_type ?? "Potencial") as Pessoa["relacao"],
  resumo: r.summary ?? "",
  proximaAcao: r.next_action ?? undefined,
  proximaAcaoData: r.next_action_date ?? undefined,
});

const toOportunidade = (r: Row): Oportunidade => ({
  id: r.id,
  pessoaId: r.person_id ?? "",
  tipo: (r.type ?? "Compra") as Oportunidade["tipo"],
  estado: (r.status ?? "Novo") as Oportunidade["estado"],
  valor: Number(r.value ?? 0),
  probabilidade: (r.probability ?? "Média") as Oportunidade["probabilidade"],
  proximaAcao: r.next_action ?? undefined,
  proximaAcaoData: r.next_action_date ?? undefined,
  notas: r.notes ?? undefined,
  imovelId: r.property_id ?? undefined,
});

const toImovel = (r: Row): Imovel => ({
  id: r.id,
  titulo: r.title,
  tipo: (r.property_type ?? "T2") as Imovel["tipo"],
  localizacao: r.location ?? "",
  valor: Number(r.value ?? 0),
  estado: (r.status ?? "Angariado") as Imovel["estado"],
  proprietarioId: r.owner_person_id ?? undefined,
  notas: r.notes ?? undefined,
});

const toSeguimento = (r: Row): Seguimento => ({
  id: r.id,
  tipo: (r.type === "Evento" ? "Evento" : "Tarefa") as Seguimento["tipo"],
  titulo: r.title,
  data: r.due_date,
  hora: r.due_time ?? undefined,
  pessoaId: r.person_id ?? undefined,
  oportunidadeId: r.opportunity_id ?? undefined,
  estado: (r.status ?? "Pendente") as Seguimento["estado"],
  prioridade: (r.priority ?? "Média") as Seguimento["prioridade"],
  notas: r.notes ?? undefined,
});

const toDespesa = (r: Row): Despesa => ({
  id: r.id,
  descricao: r.description,
  categoria: (r.category ?? "Outros") as Despesa["categoria"],
  valor: Number(r.amount ?? 0),
  data: r.movement_date,
});

const toComissao = (r: Row): Comissao => ({
  id: r.id,
  oportunidadeId: r.opportunity_id ?? "",
  valor: Number(r.amount ?? 0),
  data: r.movement_date,
  estado: (r.status ?? "Prevista") as Comissao["estado"],
});

/* ---------- Store contract ---------- */

interface AppStore {
  loading: boolean;
  pessoas: Pessoa[];
  oportunidades: Oportunidade[];
  imoveis: Imovel[];
  seguimentos: Seguimento[];
  documentos: Documento[];
  comissoes: Comissao[];
  despesas: Despesa[];
  entradas: EntradaAssessor[];
  addSeguimento: (s: Omit<Seguimento, "id">) => Promise<void>;
  addSeguimentoReturning: (s: Omit<Seguimento, "id">) => Promise<Seguimento | null>;
  concluirSeguimento: (id: string) => Promise<void>;
  reagendarSeguimento: (id: string, novaData: string) => Promise<void>;
  atualizarSeguimento: (id: string, patch: Partial<Omit<Seguimento, "id">>) => Promise<void>;
  eliminarSeguimento: (id: string) => Promise<void>;
  addDespesa: (d: Omit<Despesa, "id">) => Promise<void>;
  addDespesaReturning: (d: Omit<Despesa, "id"> & { oportunidadeId?: string; imovelId?: string }) => Promise<{ id: string } | null>;
  atualizarMovimento: (id: string, patch: Record<string, unknown>) => Promise<void>;
  eliminarMovimento: (id: string) => Promise<void>;
  addComissao: (c: Omit<Comissao, "id">) => Promise<void>;
  addComissaoReturning: (c: Omit<Comissao, "id"> & { descricao?: string }) => Promise<{ id: string } | null>;
  addEntrada: (e: Omit<EntradaAssessor, "id">) => Promise<void>;
  addInteracao: (i: { pessoaId?: string; oportunidadeId?: string; conteudoOriginal: string; resumo?: string; proximaAcao?: string }) => Promise<void>;
  addPessoa: (p: Omit<Pessoa, "id">) => Promise<Pessoa | null>;
  updatePessoa: (id: string, patch: Partial<Omit<Pessoa, "id">>) => Promise<void>;
  deletePessoa: (id: string) => Promise<void>;
  refresh: () => void;
}

const Ctx = createContext<AppStore | null>(null);

/* ---------- Provider ---------- */

async function currentUserId(): Promise<string> {
  const { data } = await supabase.auth.getUser();
  if (!data.user) throw new Error("Sessão expirada.");
  return data.user.id;
}

export function AppStoreProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();

  const people = useQuery({
    queryKey: ["people"],
    queryFn: async () => {
      const { data, error } = await supabase.from("people").select("*").order("name");
      if (error) throw error;
      return (data ?? []).map(toPessoa);
    },
  });
  const opps = useQuery({
    queryKey: ["opportunities"],
    queryFn: async () => {
      const { data, error } = await supabase.from("opportunities").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []).map(toOportunidade);
    },
  });
  const props = useQuery({
    queryKey: ["properties"],
    queryFn: async () => {
      const { data, error } = await supabase.from("properties").select("*").order("title");
      if (error) throw error;
      return (data ?? []).map(toImovel);
    },
  });
  const followups = useQuery({
    queryKey: ["follow_ups"],
    queryFn: async () => {
      const { data, error } = await supabase.from("follow_ups").select("*").order("due_date");
      if (error) throw error;
      return (data ?? []).map(toSeguimento);
    },
  });
  const movements = useQuery({
    queryKey: ["financial_movements"],
    queryFn: async () => {
      const { data, error } = await supabase.from("financial_movements").select("*").order("movement_date", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const invalidate = (key: string) => qc.invalidateQueries({ queryKey: [key] });

  const addSeguimento = useCallback(async (s: Omit<Seguimento, "id">) => {
    const uid = await currentUserId();
    const { error } = await supabase.from("follow_ups").insert({
      user_id: uid,
      type: s.tipo,
      title: s.titulo,
      due_date: s.data,
      due_time: s.hora ?? null,
      person_id: s.pessoaId ?? null,
      opportunity_id: s.oportunidadeId ?? null,
      status: s.estado ?? "Pendente",
      priority: s.prioridade ?? "Média",
      notes: s.notas ?? null,
    });
    if (error) throw error;
    invalidate("follow_ups");
  }, [qc]);

  const concluirSeguimento = useCallback(async (id: string) => {
    const { error } = await supabase.from("follow_ups").update({ status: "Concluído" }).eq("id", id);
    if (error) throw error;
    invalidate("follow_ups");
  }, [qc]);

  const reagendarSeguimento = useCallback(async (id: string, novaData: string) => {
    const { error } = await supabase.from("follow_ups").update({ due_date: novaData, status: "Pendente" }).eq("id", id);
    if (error) throw error;
    invalidate("follow_ups");
  }, [qc]);

  const addDespesa = useCallback(async (d: Omit<Despesa, "id">) => {
    const uid = await currentUserId();
    const { error } = await supabase.from("financial_movements").insert({
      user_id: uid,
      type: "expense",
      description: d.descricao,
      category: d.categoria,
      amount: d.valor,
      status: "Recebida",
      movement_date: d.data,
    });
    if (error) throw error;
    invalidate("financial_movements");
  }, [qc]);

  const addComissao = useCallback(async (c: Omit<Comissao, "id">) => {
    const uid = await currentUserId();
    const { error } = await supabase.from("financial_movements").insert({
      user_id: uid,
      type: "commission",
      description: "Comissão",
      amount: c.valor,
      status: c.estado,
      movement_date: c.data,
      opportunity_id: c.oportunidadeId || null,
    });
    if (error) throw error;
    invalidate("financial_movements");
  }, [qc]);

  const addEntrada = useCallback(async (e: Omit<EntradaAssessor, "id">) => {
    const uid = await currentUserId();
    const { error } = await supabase.from("interactions").insert({
      user_id: uid,
      source_channel: e.canal,
      original_content: e.conteudoOriginal,
      summary: e.transcricao ?? null,
      interaction_type: e.interpretacao ?? null,
      occurred_at: e.data,
    });
    if (error) console.error(error);
  }, []);

  const addPessoa = useCallback(async (p: Omit<Pessoa, "id">) => {
    const uid = await currentUserId();
    const { data, error } = await supabase.from("people").insert({
      user_id: uid,
      name: p.nome,
      phone: p.telefone || null,
      email: p.email || null,
      relationship_type: p.relacao,
      summary: p.resumo || null,
      next_action: p.proximaAcao ?? null,
      next_action_date: p.proximaAcaoData ?? null,
    }).select("*").single();
    if (error) throw error;
    invalidate("people");
    return data ? toPessoa(data) : null;
  }, [qc]);

  const updatePessoa = useCallback(async (id: string, patch: Partial<Omit<Pessoa, "id">>) => {
    const dbPatch: Record<string, string | null> = {};
    if (patch.nome !== undefined) dbPatch.name = patch.nome;
    if (patch.telefone !== undefined) dbPatch.phone = patch.telefone;
    if (patch.email !== undefined) dbPatch.email = patch.email;
    if (patch.relacao !== undefined) dbPatch.relationship_type = patch.relacao;
    if (patch.resumo !== undefined) dbPatch.summary = patch.resumo;
    if (patch.proximaAcao !== undefined) dbPatch.next_action = patch.proximaAcao;
    if (patch.proximaAcaoData !== undefined) dbPatch.next_action_date = patch.proximaAcaoData;
    const { error } = await supabase.from("people").update(dbPatch as never).eq("id", id);
    if (error) throw error;
    invalidate("people");
  }, [qc]);

  const deletePessoa = useCallback(async (id: string) => {
    const { error } = await supabase.from("people").delete().eq("id", id);
    if (error) throw error;
    invalidate("people");
  }, [qc]);

  const refresh = useCallback(() => {
    ["people", "opportunities", "properties", "follow_ups", "financial_movements"].forEach(invalidate);
  }, [qc]);

  const value = useMemo<AppStore>(() => {
    const movs = movements.data ?? [];
    const comissoes = movs.filter((m: Row) => m.type === "commission").map(toComissao);
    const despesas = movs.filter((m: Row) => m.type === "expense").map(toDespesa);
    return {
      loading: people.isLoading || opps.isLoading || props.isLoading || followups.isLoading || movements.isLoading,
      pessoas: people.data ?? [],
      oportunidades: opps.data ?? [],
      imoveis: props.data ?? [],
      seguimentos: followups.data ?? [],
      documentos: [],
      comissoes,
      despesas,
      entradas: [],
      addSeguimento,
      concluirSeguimento,
      reagendarSeguimento,
      addDespesa,
      addComissao,
      addEntrada,
      addPessoa,
      updatePessoa,
      deletePessoa,
      refresh,
    };
  }, [people.data, opps.data, props.data, followups.data, movements.data, people.isLoading, opps.isLoading, props.isLoading, followups.isLoading, movements.isLoading, addSeguimento, concluirSeguimento, reagendarSeguimento, addDespesa, addComissao, addEntrada, addPessoa, updatePessoa, deletePessoa, refresh]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStore(): AppStore {
  const s = useContext(Ctx);
  if (!s) throw new Error("useStore must be used within AppStoreProvider");
  return s;
}