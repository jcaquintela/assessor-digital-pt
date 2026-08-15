import {

  Link2,
  ListOrdered,
  MessageCircle,
  MoreVertical,
  Tag,
  Trash2,
  Undo2,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/**
 * Ações de um ficheiro do Drive num só menu (⋮). Só "Ver" fica visível na
 * linha; o resto aparece quando o consultor precisa.
 */
export function DriveFileMenu({
  label,
  naReciclagem,
  temPaginas,
  paginaLabel,
  temCategoria,
  onLinks,
  onPages,
  onCategory,
  onShare,
  onRestore,
  onDelete,
}: {
  label: string;
  naReciclagem: boolean;
  temPaginas: boolean;
  paginaLabel?: string;
  temCategoria: boolean;
  onLinks: () => void;
  onPages: () => void;
  onCategory: () => void;
  onShare: () => void;
  onRestore: () => void;
  onDelete: () => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={`Ações de ${label}`}
          className="c-badge tap-44"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
        >
          <MoreVertical className="h-3 w-3" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        className="w-52"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
        }}
      >
        <DropdownMenuItem onSelect={() => onLinks()}>
          <Link2 className="h-4 w-4" /> Ligações
        </DropdownMenuItem>
        {temPaginas && (
          <DropdownMenuItem onSelect={() => onPages()}>
            <ListOrdered className="h-4 w-4" /> Ordenar páginas{paginaLabel ?? ""}
          </DropdownMenuItem>
        )}
        <DropdownMenuItem onSelect={() => onCategory()}>
          <Tag className="h-4 w-4" /> {temCategoria ? "Mudar categoria" : "Categoria"}
        </DropdownMenuItem>
        {!naReciclagem && (
          <DropdownMenuItem onSelect={() => onShare()}>
            <MessageCircle className="h-4 w-4" /> Abrir no WhatsApp
          </DropdownMenuItem>
        )}
        {naReciclagem ? (
          <DropdownMenuItem onSelect={() => onRestore()}>
            <Undo2 className="h-4 w-4" /> Recuperar
          </DropdownMenuItem>
        ) : (
          <DropdownMenuItem className="text-destructive" onSelect={() => onDelete()}>
            <Trash2 className="h-4 w-4" /> Eliminar
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}


