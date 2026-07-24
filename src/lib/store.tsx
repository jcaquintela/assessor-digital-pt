import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import {
  comissoesSeed,
  despesasSeed,
  documentosSeed,
  entradasSeed,
  imoveisSeed,
  oportunidadesSeed,
  pessoasSeed,
  seguimentosSeed,
  type Comissao,
  type Despesa,
  type Documento,
  type EntradaAssessor,
  type Imovel,
  type Oportunidade,
  type Pessoa,
  type Seguimento,
} from "./demo-data";

interface AppStore {
  pessoas: Pessoa[];
  oportunidades: Oportunidade[];
  imoveis: Imovel[];
  seguimentos: Seguimento[];
  documentos: Documento[];
  comissoes: Comissao[];
  despesas: Despesa[];
  entradas: EntradaAssessor[];
  addSeguimento: (s: Omit<Seguimento, "id">) => void;
  concluirSeguimento: (id: string) => void;
  reagendarSeguimento: (id: string, novaData: string) => void;
  addDespesa: (d: Omit<Despesa, "id">) => void;
  addComissao: (c: Omit<Comissao, "id">) => void;
  addEntrada: (e: Omit<EntradaAssessor, "id">) => void;
}

const Ctx = createContext<AppStore | null>(null);

let idCounter = 1000;
const nid = (p: string) => `${p}${++idCounter}`;

export function AppStoreProvider({ children }: { children: ReactNode }) {
  const [pessoas] = useState<Pessoa[]>(pessoasSeed);
  const [oportunidades] = useState<Oportunidade[]>(oportunidadesSeed);
  const [imoveis] = useState<Imovel[]>(imoveisSeed);
  const [seguimentos, setSeguimentos] = useState<Seguimento[]>(seguimentosSeed);
  const [documentos] = useState<Documento[]>(documentosSeed);
  const [comissoes, setComissoes] = useState<Comissao[]>(comissoesSeed);
  const [despesas, setDespesas] = useState<Despesa[]>(despesasSeed);
  const [entradas, setEntradas] = useState<EntradaAssessor[]>(entradasSeed);

  const addSeguimento = useCallback((s: Omit<Seguimento, "id">) => {
    setSeguimentos((prev) => [{ ...s, id: nid("s") }, ...prev]);
  }, []);
  const concluirSeguimento = useCallback((id: string) => {
    setSeguimentos((prev) => prev.map((s) => (s.id === id ? { ...s, estado: "Concluído" } : s)));
  }, []);
  const reagendarSeguimento = useCallback((id: string, novaData: string) => {
    setSeguimentos((prev) => prev.map((s) => (s.id === id ? { ...s, data: novaData, estado: "Pendente" } : s)));
  }, []);
  const addDespesa = useCallback((d: Omit<Despesa, "id">) => {
    setDespesas((prev) => [{ ...d, id: nid("e") }, ...prev]);
  }, []);
  const addComissao = useCallback((c: Omit<Comissao, "id">) => {
    setComissoes((prev) => [{ ...c, id: nid("c") }, ...prev]);
  }, []);
  const addEntrada = useCallback((e: Omit<EntradaAssessor, "id">) => {
    setEntradas((prev) => [{ ...e, id: nid("ent") }, ...prev]);
  }, []);

  const value = useMemo<AppStore>(
    () => ({
      pessoas,
      oportunidades,
      imoveis,
      seguimentos,
      documentos,
      comissoes,
      despesas,
      entradas,
      addSeguimento,
      concluirSeguimento,
      reagendarSeguimento,
      addDespesa,
      addComissao,
      addEntrada,
    }),
    [pessoas, oportunidades, imoveis, seguimentos, documentos, comissoes, despesas, entradas, addSeguimento, concluirSeguimento, reagendarSeguimento, addDespesa, addComissao, addEntrada],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStore(): AppStore {
  const s = useContext(Ctx);
  if (!s) throw new Error("useStore must be used within AppStoreProvider");
  return s;
}