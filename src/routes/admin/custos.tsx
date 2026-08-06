import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getAfonsoCosts } from "@/lib/admin/afonso.functions";
import {
  listTemplateRates,
  saveTemplateRate,
  deleteTemplateRate,
} from "@/lib/admin/proactive-test.functions";
import {
  getAiCostSettings,
  saveAiRate,
  saveCreditPrice,
} from "@/lib/admin/cost-settings.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Empty, Grid, MetricCard, PageTitle, SectionTitle } from "@/components/admin/ui";

export const Route = createFileRoute("/admin/custos")({
  head: () => ({ meta: [{ title: "Custos — Afonso admin" }] }),
  component: CustosPage,
});

function CustosPage() {
  const fn = useServerFn(getAfonsoCosts);
  const { data, isPending } = useQuery({ queryKey: ["admin", "afonso", "costs"], queryFn: () => fn() });
  if (isPending || !data) return <p className="sub">A carregar…</p>;

  const mb = (data.storageBytes / 1024 / 1024).toFixed(1);

  const waCost = data.whatsappTemplateCost30d;
  const waSub =
    data.whatsappBillable30d === 0
      ? `${data.whatsappMessages24h} msgs/24h · nenhum template fora das 24h ainda`
      : waCost == null
        ? `${data.whatsappBillable30d} templates fora das 24h/30d · falta tarifa`
        : `${data.whatsappBillable30d} templates fora das 24h/30d · ${data.whatsappBillable24h} nas últimas 24h` +
          (data.whatsappUnpriced30d > 0 ? ` · ${data.whatsappUnpriced30d} sem tarifa` : "");

  return (
    <div>
      <PageTitle title="Custos" sub="O que custa operar o Afonso, hoje — sem isto não há margem real, só receita." />

      <Grid cols={3}>
        <MetricCard
          label="IA (modelo)"
          value={data.aiCost == null ? "—" : `$${data.aiCost.toFixed(2)}`}
          tone={data.aiCost == null ? "muted" : "default"}
          sub={
            data.aiCost == null
              ? "custo por 1M tokens não confirmado"
              : `${data.aiCalls24h} chamadas · ${data.aiTokens24h} tokens / 24h`
          }
          source={data.aiCost == null ? "por ligar" : "assessor_ai_logs · live"}
          stale={data.aiCost == null}
        />
        <MetricCard
          label="Supabase"
          value="Free"
          sub={`ainda dentro do plano gratuito · ${mb} MB em ficheiros`}
          source="uploaded_files · live"
        />
        <MetricCard
          label="WhatsApp (BSP)"
          value={waCost == null ? "—" : `${waCost.toFixed(2)} €`}
          tone={waCost == null ? "muted" : "default"}
          sub={waSub}
          source={waCost == null ? "por confirmar · tabela de tarifas vazia" : "whatsapp_send_logs · live"}
          stale={waCost == null}
        />
      </Grid>

      <TemplateRatesBlock />

      <AiRatesBlock />

      <SectionTitle>Custo por utilizador ativo</SectionTitle>
      <Empty note="objetivo: custo total ÷ utilizadores ativos, por plano — decide se o Nível 0 grátis é sustentável">
        Não calculável até os 3 custos acima estarem ligados a dados reais.
      </Empty>
    </div>
  );
}

function AiRatesBlock() {
  const qc = useQueryClient();
  const listFn = useServerFn(getAiCostSettings);
  const saveRateFn = useServerFn(saveAiRate);
  const savePriceFn = useServerFn(saveCreditPrice);
  const { data } = useQuery({ queryKey: ["admin", "ai-cost-settings"], queryFn: () => listFn() });
  const [model, setModel] = useState("");
  const [inRate, setInRate] = useState("");
  const [outRate, setOutRate] = useState("");
  const [price, setPrice] = useState("");

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["admin", "ai-cost-settings"] });
    qc.invalidateQueries({ queryKey: ["admin", "access-users"] });
  };

  return (
    <>
      <SectionTitle>Tarifas de IA e preço do crédito</SectionTitle>
      <p className="sub mb-3">
        Sem estas tarifas, o custo por consultor fica só em créditos. Com elas, a ficha de cada
        consultor mostra euros e margem face ao plano que ele paga.
      </p>

      <div className="mb-4 flex flex-wrap items-end gap-2">
        <div>
          <div className="mini mb-1">Preço de 1 crédito (€)</div>
          <Input
            className="w-40"
            inputMode="decimal"
            placeholder={data?.creditPriceEur != null ? String(data.creditPriceEur) : "ex.: 0,20"}
            value={price}
            onChange={(e) => setPrice(e.target.value)}
          />
        </div>
        <Button
          onClick={() => {
            const v = Number(price.replace(",", "."));
            if (!Number.isFinite(v) || v <= 0) return toast.error("Indica um valor válido.");
            savePriceFn({ data: { eur: v } })
              .then(() => { toast.success("Preço do crédito guardado."); setPrice(""); invalidate(); })
              .catch((e: Error) => toast.error(e.message));
          }}
        >Guardar preço</Button>
      </div>

      <table>
        <thead>
          <tr><th>Modelo</th><th>Créditos / 1M entrada</th><th>Créditos / 1M saída</th><th>Origem</th></tr>
        </thead>
        <tbody>
          {(data?.rates ?? []).length === 0 ? (
            <tr><td colSpan={4} className="mini">Sem tarifas definidas.</td></tr>
          ) : data!.rates.map((r) => (
            <tr key={r.model}>
              <td className="mini">{r.model}</td>
              <td className="mini">{r.creditsPerMillionInput}</td>
              <td className="mini">{r.creditsPerMillionOutput}</td>
              <td className="mini">{r.source ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="mt-3 flex flex-wrap items-end gap-2">
        <Input className="w-64" placeholder="modelo (ex.: google/gemini-3.6-flash)" value={model} onChange={(e) => setModel(e.target.value)} />
        <Input className="w-36" inputMode="decimal" placeholder="entrada" value={inRate} onChange={(e) => setInRate(e.target.value)} />
        <Input className="w-36" inputMode="decimal" placeholder="saída" value={outRate} onChange={(e) => setOutRate(e.target.value)} />
        <Button
          onClick={() => {
            const i = Number(inRate.replace(",", "."));
            const o = Number(outRate.replace(",", "."));
            if (!model.trim() || !Number.isFinite(i) || !Number.isFinite(o)) {
              return toast.error("Preenche modelo e as duas tarifas.");
            }
            saveRateFn({ data: { model: model.trim(), creditsPerMillionInput: i, creditsPerMillionOutput: o } })
              .then(() => { toast.success("Tarifa guardada."); setModel(""); setInRate(""); setOutRate(""); invalidate(); })
              .catch((e: Error) => toast.error(e.message));
          }}
        >Guardar tarifa</Button>
      </div>
    </>
  );
}

/**
 * Tarifas de template (Meta cobra por mensagem fora da janela de 24h, por
 * categoria e país). Sem tarifa registada, o custo fica "por confirmar" —
 * preferimos não saber a inventar um número.
 */
function TemplateRatesBlock() {
  const qc = useQueryClient();
  const list = useServerFn(listTemplateRates);
  const save = useServerFn(saveTemplateRate);
  const del = useServerFn(deleteTemplateRate);
  const { data: rates } = useQuery({
    queryKey: ["admin", "wa", "rates"],
    queryFn: () => list(),
  });
  const [form, setForm] = useState({
    category: "utility",
    country_code: "PT",
    price_eur: "",
    effective_from: new Date().toISOString().slice(0, 10),
    source: "",
  });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["admin", "wa", "rates"] });
    qc.invalidateQueries({ queryKey: ["admin", "afonso", "costs"] });
  };

  return (
    <>
      <SectionTitle>Tarifas de template WhatsApp</SectionTitle>
      <p className="sub" style={{ marginBottom: 12 }}>
        Preço por mensagem de template enviada <strong>fora da janela de 24h</strong>, por categoria e
        país do destinatário. Dentro da janela, templates de utilidade não são cobrados. Preenche com
        os valores do teu contrato/BSP — enquanto estiver vazio, o custo aparece como "por confirmar".
      </p>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 12 }}>
        <select
          value={form.category}
          onChange={(e) => setForm({ ...form, category: e.target.value })}
          className="rounded-md border bg-background px-2 py-2 text-sm"
        >
          <option value="utility">utility</option>
          <option value="marketing">marketing</option>
          <option value="authentication">authentication</option>
          <option value="service">service</option>
        </select>
        <Input
          style={{ width: 80 }}
          value={form.country_code}
          onChange={(e) => setForm({ ...form, country_code: e.target.value.toUpperCase() })}
          placeholder="PT"
        />
        <Input
          style={{ width: 120 }}
          value={form.price_eur}
          onChange={(e) => setForm({ ...form, price_eur: e.target.value })}
          placeholder="€ / msg"
        />
        <Input
          type="date"
          style={{ width: 170 }}
          value={form.effective_from}
          onChange={(e) => setForm({ ...form, effective_from: e.target.value })}
        />
        <Input
          style={{ minWidth: 200, flex: 1 }}
          value={form.source}
          onChange={(e) => setForm({ ...form, source: e.target.value })}
          placeholder="origem (ex.: tabela Meta 2026, fatura BSP)"
        />
        <Button
          onClick={async () => {
            const price = Number(String(form.price_eur).replace(",", "."));
            if (!Number.isFinite(price)) return toast.error("Preço inválido.");
            try {
              await save({
                data: {
                  category: form.category as any,
                  country_code: form.country_code,
                  price_eur: price,
                  effective_from: form.effective_from,
                  source: form.source || undefined,
                },
              });
              toast.success("Tarifa guardada.");
              setForm({ ...form, price_eur: "" });
              refresh();
            } catch (e: any) {
              toast.error(e?.message ?? "Não consegui guardar.");
            }
          }}
        >
          Guardar tarifa
        </Button>
      </div>

      {!rates?.length ? (
        <Empty note="sem tarifas, o custo de proatividade fora das 24h não entra em COGS">
          Ainda não há nenhuma tarifa registada.
        </Empty>
      ) : (
        <div style={{ display: "grid", gap: 6 }}>
          {rates.map((r: any) => (
            <div
              key={r.id}
              style={{ display: "flex", gap: 12, alignItems: "center", justifyContent: "space-between" }}
              className="rounded-md border px-3 py-2 text-sm"
            >
              <span>
                <strong>{r.category}</strong> · {r.country_code} · {Number(r.price_eur).toFixed(4)} €/msg
                <span className="sub"> · desde {r.effective_from}{r.source ? ` · ${r.source}` : ""}</span>
              </span>
              <Button
                variant="ghost"
                size="sm"
                onClick={async () => {
                  await del({ data: { id: r.id } });
                  refresh();
                }}
              >
                Remover
              </Button>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
