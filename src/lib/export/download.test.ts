import { describe, it, expect } from "vitest";
import { toCsv, buildVCards, csvDate } from "@/lib/export/download";
describe("export", () => {
  it("csv", () => {
    const out = toCsv(["Nome","Notas"],[["Júlio; Q","linha1\nlinha2"]]);
    console.log(JSON.stringify(out));
    expect(out).toContain('"Júlio; Q"');
  });
  it("vcf", () => {
    const out = buildVCards([{name:"João Paulo", phone:"934555444", note:"Nota; teste"}]);
    console.log(out);
    expect(out).toContain("FN:João Paulo");
    expect(out).toContain("TEL;TYPE=CELL:934555444");
  });
  it("date", () => { expect(csvDate("2026-07-30T10:00:00Z")).toBe("30/07/2026"); });
});
