import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { SectionTitle, Badge, Empty, Source } from "@/components/admin/ui";
import {
  getTodayDigest,
  listDigests,
  saveTodayDigest,
  sendDigestTestToMe,
  sendTodayDigestNow,
  unapproveTodayDigest,
} from "@/lib/admin/digest.functions";

const STATUS_LABEL: Record<string, { text: string; tone: "ok" | "warn" | "bad" }> = {
  rascunho: { text: "Rascunho", tone: "warn" },
  aprovado: { text: "Aprovado — sai às 19h", tone: "ok" },
  enviado: { text: "Enviado", tone: "ok" },
  sem_novidades: { text: "Sem novidades — não saiu", tone: "warn" },
  falhou: { text: "Falhou", tone: "bad" },
};

function day(d: string) {
  return new Date(`${d}T12:00:00Z`).toLocaleDateString("pt-PT", { timeZone: "UTC" });
}

export function DailyDigest({ isSuper }: { isSuper: boolean }) {
  const qc = useQueryClient();
  const todayFn = useServerFn(getTodayDigest);
  const saveFn = useServerFn(saveTodayDigest);
  const unapproveFn = useServerFn(unapproveTodayDigest);
  const sendNowFn = useServerFn(sendTodayDigestNow);
  const testFn = useServerFn(sendDigestTestToMe);
  const historyFn = useServerFn(listDigests);

  const { data, isLoading } = useQuery({ queryKey: ["admin", "digest-today"], queryFn: () => todayFn() });
  const { data: history } = useQuery({ queryKey: ["admin", "digest-history"], queryFn: () => historyFn() });

  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!data?.digest || dirty) return;
    setSubject(data.digest.subject);
    setBody(data.digest.body);
  }, [data?.digest?.id, data?.digest?.body, data?.digest?.subject, dirty]);

  if (isLoading) return <div className="mini">A carregar o rascunho de hoje…</div>;

  const digest = data?.digest ?? null;
  const status = digest?.status ?? "rascunho";
  const meta = STATUS_LABEL[status] ?? { text: status, tone: "warn" as const };
  const recipients = data?.recipients ?? [];
  const updates = data?.updates ?? [];
  const sent = status === "enviado";
  const pastLock = (data?.hour ?? 0) >= (data?.lockHour ?? 18);
  const empty = body.trim().length === 0;

  const refresh = () => {
    setDirty(false);
    qc.invalidateQueries({ queryKey: ["admin", "digest-today"] });
    qc.invalidateQueries({ queryKey: ["admin", "digest-history"] });
  };

  const run = async (fn: () => Promise<unknown>, ok: string) => {
    setBusy(true);
    try {
      await fn();
      toast.success(ok);
      refresh();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <SectionTitle first>Resumo de hoje ({data ? day(data.date) : "—"})</SectionTitle>
      <div className="rounded-xl border p-4" style={{ borderColor: "var(--line)", background: "var(--card)" }}>
        <div className="mb-3 flex flex-wrap items-center gap-3">
          <Badge tone={meta.tone}>{meta.text}</Badge>
          <span className="mini" style={{ color: "var(--muted)" }}>
            {updates.length} novidade(s) registada(s) hoje · {recipients.length} beta tester(s) ativo(s) com email
          </span>
        </div>

        <p className="mini mb-3" style={{ color: "var(--muted)" }}>
          O rascunho é montado a partir das novidades que registas em Novidades do produto — nunca a partir de código
          ou commits. Revê o texto até às {data?.lockHour ?? 18}h e aprova: às {data?.sendHour ?? 19}h sai só o que
          estiver aprovado. Se não aprovares, não sai email nenhum.
        </p>

        {updates.length === 0 ? (
          <p className="mini mb-3 rounded-lg px-3 py-2" style={{ background: "var(--amber-bg)", color: "var(--amber)" }}>
            Hoje ainda não há nenhuma novidade visível para o consultor. Sem texto aprovado, às {data?.sendHour ?? 19}h
            não sai email.
          </p>
        ) : null}

        <label className="mini mb-3 block" style={{ color: "var(--muted)" }}>
          Assunto
          <input
            className="admin-input mt-1 block w-full"
            value={subject}
            disabled={sent || !isSuper}
            onChange={(e) => {
              setSubject(e.target.value);
              setDirty(true);
            }}
          />
        </label>

        <label className="mini block" style={{ color: "var(--muted)" }}>
          Texto do email
          <textarea
            className="admin-input mt-1 block h-64 w-full"
            value={body}
            disabled={sent || !isSuper}
            onChange={(e) => {
              setBody(e.target.value);
              setDirty(true);
            }}
            placeholder="Escreve como falarias com um consultor: “Corrigimos…”, “A partir de hoje podes…”. Sem nomes de ficheiros nem código."
          />
        </label>

        <SectionTitle>Pré-visualização (como o beta tester vê)</SectionTitle>
        <div className="admin-card p-4">
          <div className="mini" style={{ color: "var(--muted)" }}>De: Afonso &lt;ola@meuafonso.com&gt;</div>
          <div className="mt-1"><strong>{subject || "(sem assunto)"}</strong></div>
          {empty ? (
            <div className="mini mt-2" style={{ color: "var(--muted)" }}>Sem texto — nada será enviado.</div>
          ) : (
            <div className="mt-2 whitespace-pre-wrap">{body}</div>
          )}
        </div>

        <SectionTitle>Quem recebe</SectionTitle>
        <div className="admin-card p-4">
          <div style={{ fontSize: 20 }}><strong>{recipients.length}</strong> beta tester(s)</div>
          <div className="mini mt-1" style={{ color: "var(--muted)" }}>
            Beta por expirar, com email real e com atividade nos últimos 30 dias. Contas de teste/CI/shadow ficam de fora.
          </div>
          {recipients.length ? (
            <div className="mt-3 max-h-56 overflow-auto">
              <table>
                <thead><tr><th>Nome</th><th>Email</th></tr></thead>
                <tbody>
                  {recipients.map((r) => (
                    <tr key={r.userId}>
                      <td className="mini">{r.name ?? "—"}</td>
                      <td className="mini">{r.email}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="mini mt-2" style={{ color: "var(--coral)" }}>
              Nenhum beta tester ativo — mesmo aprovado, não haveria a quem enviar.
            </div>
          )}
        </div>

        {!isSuper ? (
          <p className="mini mt-3" style={{ color: "var(--muted)" }}>Só super admin pode editar e aprovar.</p>
        ) : sent ? (
          <p className="mini mt-3" style={{ color: "var(--muted)" }}>
            Já enviado a {digest?.recipients_count ?? 0} beta tester(s). O resumo de hoje está fechado.
          </p>
        ) : (
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button
              type="button"
              className="admin-btn tap-44"
              disabled={busy}
              onClick={() => run(() => saveFn({ data: { subject, body, approve: false } }), "Rascunho guardado. Ainda não sai às 19h.")}
            >
              Guardar rascunho
            </button>
            <button
              type="button"
              className="admin-btn-primary tap-44"
              disabled={busy || empty || recipients.length === 0}
              onClick={() =>
                run(
                  () => saveFn({ data: { subject, body, approve: true } }),
                  `Aprovado. Às ${data?.sendHour ?? 19}h sai para ${recipients.length} beta tester(s).`,
                )
              }
            >
              Aprovar para as {data?.sendHour ?? 19}h
            </button>
            {status === "aprovado" ? (
              <>
                <button
                  type="button"
                  className="admin-btn tap-44"
                  disabled={busy}
                  onClick={() => run(() => unapproveFn(), "Aprovação retirada — hoje não sai email.")}
                >
                  Retirar aprovação
                </button>
                <button
                  type="button"
                  className="admin-btn tap-44"
                  disabled={busy}
                  onClick={() =>
                    run(async () => {
                      const res: any = await sendNowFn();
                      if (!res?.ok) throw new Error(res?.error ?? res?.skipped ?? "não foi possível enviar");
                    }, "Enviado agora.")
                  }
                >
                  Enviar já
                </button>
              </>
            ) : null}
            <button
              type="button"
              className="admin-btn tap-44"
              disabled={busy || empty}
              onClick={() => run(() => testFn(), "Email de teste enviado para ti.")}
            >
              Enviar teste só para mim
            </button>
            {pastLock && status !== "aprovado" ? (
              <span className="mini" style={{ color: "var(--amber)" }}>
                Passa das {data?.lockHour ?? 18}h — se não aprovares agora, hoje não sai nada.
              </span>
            ) : null}
          </div>
        )}

        <Source>daily_digests + product_updates + admin_broadcast_recipients</Source>
      </div>

      <SectionTitle>Resumos anteriores</SectionTitle>
      {(history ?? []).length === 0 ? (
        <Empty note="um por dia, só quando há novidades aprovadas">Ainda não houve nenhum resumo diário.</Empty>
      ) : (
        <div className="overflow-x-auto">
          <table>
            <thead>
              <tr><th>Dia</th><th>Assunto</th><th>Destinatários</th><th>Estado</th><th>Nota</th></tr>
            </thead>
            <tbody>
              {(history ?? []).map((h) => {
                const m = STATUS_LABEL[h.status] ?? { text: h.status, tone: "warn" as const };
                return (
                  <tr key={h.id}>
                    <td className="mini whitespace-nowrap">{day(h.digest_date)}</td>
                    <td className="mini">{h.subject}</td>
                    <td className="mini">{h.sent_at ? h.recipients_count : "—"}</td>
                    <td><Badge tone={m.tone}>{m.text}</Badge></td>
                    <td className="mini">{h.note ?? "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
