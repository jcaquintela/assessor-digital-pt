import { it, expect } from "vitest";
import { detectCompletionInstructions } from "@/lib/assessor/v3/completion-intent";
const m = "Bom dia Vanessa. Entregar contrato à Maria Manuel está feito. Malas feitas e já estou de férias. Já comprei os envelopes";
it("dbg", () => {
  console.log(JSON.stringify(detectCompletionInstructions(m), null, 1));
  for (const t of ["Já tratei disso", "Bom dia, como estás?", "amanhã tenho a visita ao T2", "a visita das 18h foi cancelada", "preciso de comprar envelopes", "reunião marcada para quinta"])
    console.log(t, "=>", JSON.stringify(detectCompletionInstructions(t)));
  expect(1).toBe(1);
});
