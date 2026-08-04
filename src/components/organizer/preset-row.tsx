/** Linha de presets de visualização (atalhos guardados). */
export function PresetRow<T extends string>({
  presets, value, onChange, counts,
}: {
  presets: { id: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  counts?: Record<string, number>;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Presets de visualização">
      {presets.map((p) => (
        <button
          key={p.id}
          type="button"
          aria-pressed={value === p.id}
          className={`c-pill tap-44 ${value === p.id ? "active" : ""}`}
          onClick={() => onChange(p.id)}
        >
          {p.label}
          {counts && counts[p.id] !== undefined && (
            <span className="ml-1 opacity-60">{counts[p.id]}</span>
          )}
        </button>
      ))}
    </div>
  );
}
