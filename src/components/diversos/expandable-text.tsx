import { useState } from "react";

const LIMIT = 180;

// Contexto longo (ex.: listagem de ficheiros colada) nunca ocupa o cartão
// inteiro por omissão.
export function ExpandableText({ text, className }: { text: string; className?: string }) {
  const [open, setOpen] = useState(false);
  const value = String(text ?? "");
  const long = value.length > LIMIT;
  const shown = !long || open ? value : `${value.slice(0, LIMIT).trimEnd()}…`;
  return (
    <p className={className}>
      {shown}
      {long ? (
        <>
          {" "}
          <button
            type="button"
            className="underline underline-offset-2 opacity-80 hover:opacity-100"
            onClick={() => setOpen((v) => !v)}
          >
            {open ? "ver menos" : "ver mais"}
          </button>
        </>
      ) : null}
    </p>
  );
}