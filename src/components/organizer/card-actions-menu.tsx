import { MoreHorizontal, Pencil, Tag, Tags, Trash2 } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/** Menu "⋯" com as ações do cartão. Mesmas ações, escondidas até serem precisas. */
export function CardActionsMenu({
  label,
  onEdit,
  onOrganize,
  onDelete,
  onCategory,
}: {
  label: string;
  onEdit: () => void;
  onOrganize: () => void;
  onDelete: () => void;
  onCategory?: () => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={`Ações de ${label}`}
          className="tap-44 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg opacity-70 hover:opacity-100"
          style={{ color: "var(--muted)" }}
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}
        >
          <MoreHorizontal className="h-4.5 w-4.5" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        <DropdownMenuItem onSelect={() => onEdit()}>
          <Pencil className="h-4 w-4" /> Editar
        </DropdownMenuItem>
        {onCategory && (
          <DropdownMenuItem onSelect={() => onCategory()}>
            <Tag className="h-4 w-4" /> Categoria
          </DropdownMenuItem>
        )}
        <DropdownMenuItem onSelect={() => onOrganize()}>
          <Tags className="h-4 w-4" /> Organizar
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => onDelete()} className="text-destructive focus:text-destructive">
          <Trash2 className="h-4 w-4" /> Eliminar
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
