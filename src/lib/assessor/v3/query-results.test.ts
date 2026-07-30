import { describe, it, expect } from "vitest";
import { formatQueryResults } from "@/lib/assessor/v3/query-results";

const real = [
  { id:"ed28", title:"Casa 2", phone:"918579839", location:null, address:null, status:"to_contact" },
  { id:"7aaa", title:"Casas 1", phone:"925512458", location:null, address:null, status:"to_contact" },
  { id:"33ba", title:"Placa", phone:"923134789", location:null, address:null, status:"to_contact" },
  { id:"e627", title:"Apartamento em Santa Maria da Feira", phone:"932145678", location:"Santa Maria da Feira", address:"junto ao Castelo", status:"to_contact" },
];

describe("query results", () => {
  it("devolve a lista real", () => {
    const out = formatQueryResults([{ name:"search_prospecting_leads", ok:true, data:{ results: real }, latencyMs:5 }])!;
    console.log("\n---\n" + out + "\n---");
    expect(out).toContain("918 579 839");
    expect(out).toContain("Casas 1");
    expect(out).toContain("Tens 4 placas registadas:");
    expect(out).not.toBe("Feito.");
  });
  it("vazio é explícito", () => {
    expect(formatQueryResults([{ name:"search_prospecting_leads", ok:true, data:{ results: [] }, latencyMs:1 }]))
      .toBe("Não encontrei placas registadas com esses critérios.");
  });
  it("ignora escritas", () => {
    expect(formatQueryResults([{ name:"create_prospecting_lead", ok:true, data:{}, latencyMs:1 }])).toBeNull();
  });
});
