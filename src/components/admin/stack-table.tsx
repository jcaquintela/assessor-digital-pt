import {
  createContext,
  useContext,
  type HTMLAttributes,
  type ReactNode,
  type TdHTMLAttributes,
  type ThHTMLAttributes,
} from "react";
import { cn } from "@/lib/utils";

/**
 * Tabela do Admin que vira cartões em ecrãs estreitos.
 *
 * No desktop é uma <table> normal (aparência inalterada). Abaixo de 768px o
 * CSS `.cards-sm` empilha cada linha num cartão e usa `data-label` para
 * mostrar o nome da coluna ao lado do valor. Este componente trata do
 * `data-label` sozinho: basta declarar os cabeçalhos uma vez em `headers`
 * e usar <Td> pela mesma ordem.
 *
 *   <StackTable headers={["Pessoa", "Plano", "Ações"]}>
 *     <tr><Td>Ana</Td><Td>Consultor</Td><Td>…</Td></tr>
 *   </StackTable>
 */

const HeadersCtx = createContext<string[]>([]);
const IndexCtx = createContext<{ i: number }>({ i: 0 });

export function StackTable({
  headers,
  children,
  className,
  scroll = true,
}: {
  /** Cabeçalhos por ordem. "" produz coluna sem etiqueta (ex.: ações). */
  headers: string[];
  children: ReactNode;
  className?: string;
  /** Envolve em scroll horizontal no desktop (predefinido). */
  scroll?: boolean;
}) {
  const table = (
    <table className={cn("cards-sm", className)}>
      <thead>
        <tr>
          {headers.map((h, i) => (
            <th key={`${h}-${i}`}>{h}</th>
          ))}
        </tr>
      </thead>
      <HeadersCtx.Provider value={headers}>
        <tbody>{children}</tbody>
      </HeadersCtx.Provider>
    </table>
  );
  return scroll ? <div className="overflow-x-auto">{table}</div> : table;
}

/** Linha: reinicia o contador de colunas para o <Td> saber a sua etiqueta. */
export function Tr({ children, ...rest }: { children: ReactNode } & HTMLAttributes<HTMLTableRowElement>) {
  return (
    <IndexCtx.Provider value={{ i: 0 }}>
      <tr {...rest}>{children}</tr>
    </IndexCtx.Provider>
  );
}

/** Célula: recebe `data-label` automaticamente a partir dos headers. */
export function Td({
  children,
  label,
  ...rest
}: { children?: ReactNode; label?: string } & TdHTMLAttributes<HTMLTableCellElement>) {
  const headers = useContext(HeadersCtx);
  const cursor = useContext(IndexCtx);
  const idx = cursor.i;
  cursor.i += (rest.colSpan ?? 1);
  const resolved = label ?? headers[idx] ?? "";
  return (
    <td {...rest} data-label={resolved || undefined}>
      {children}
    </td>
  );
}

export function Th(props: ThHTMLAttributes<HTMLTableCellElement>) {
  return <th {...props} />;
}