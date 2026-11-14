import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import {
  getEarlyAccessOverview, grantEarlyAccess, issueAdminInvite, removeFromWaitlist, revokeAccessInvite,
} from "@/lib/access/admin.functions";
import {
  getPilotOverview, issuePilotInviteAdmin, revokePilotInviteAdmin,
  listPilotInviteCandidates, previewPilotInviteDeliveryAdmin, sendPilotInviteAdmin,
} from "@/lib/pilot/admin.functions";
import { DELIVERY_OUTCOME_LABEL, type DeliveryOutcome } from "@/lib/pilot/invite-delivery";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/admin/acesso-antecipado")({
  head: () => ({ meta: [{ title: "Acesso antecipado — Admin Afonso" }] }),
  component: AcessoAntecipadoPage,
});

const STATUS: Record<string, string> = { issued: "Por usar", used: "Usado", revoked: "Anulado", expired: "Expirado" };
const PILOT_STATUS: Record<string, string> = { no_go: "Fechado (NO-GO)", go: "Aberto (GO)", closed: "Terminado" };
const OUTCOME: Record<string, string> = {
  not_open: "O piloto ainda não está aberto: nenhum convite foi gerado.",
  cap_reached: "Os lugares do piloto já estão todos em uso.",
  replayed: "Este pedido já tinha gerado um convite.",
  not_issuer: "A tua conta não pode emitir convites do piloto.",
  no_pilot: "Piloto não encontrado.",
  error: "Não foi possível gerar o convite.",
};
const fmt = (d: string | null) => (d ? new Date(d).toLocaleString("pt-PT") : "—");

function AcessoAntecipadoPage() {
  const overview = useServerFn(getEarlyAccessOverview);
  const issue = useServerFn(issueAdminInvite);
  const revoke = useServerFn(revokeAccessInvite);
  const grant = useServerFn(grantEarlyAccess);
  const remove = useServerFn(removeFromWaitlist);
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["admin", "early-access"], queryFn: () => overview() });
  const [note, setNote] = useState("");
  const [lastCode, setLastCode] = useState<string | null>(null);
  const refresh = () => qc.invalidateQueries({ queryKey: ["admin", "early-access"] });

  const issueMut = useMutation({
    mutationFn: () => issue({ data: { note: note.trim() || undefined } }),
    onSuccess: (r) => { setLastCode(r.code); setNote(""); refresh(); },
    onError: (e: any) => toast.error(e?.message ?? "Falhou"),
  });
  const revokeMut = useMutation({
    mutationFn: (id: string) => revoke({ data: { id } }),
    onSuccess: () => { toast.success("Convite anulado"); refresh(); },
  });
  const grantMut = useMutation({
    mutationFn: (userId: string) => grant({ data: { userId } }),
    onSuccess: (r) => { toast.success(r.granted ? "Acesso dado" : "Esta conta já tinha acesso"); refresh(); },
  });
  const removeMut = useMutation({
    mutationFn: (userId: string) => remove({ data: { userId } }),
    onSuccess: () => { toast.success("Retirado da lista"); refresh(); },
  });

  const f = data?.funnel;
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Acesso antecipado</h1>
        <p className="text-sm text-muted-foreground">
          Contas novas sem convite ficam em espera. Os convites valem 7 dias e só uma vez. Nada aqui envia mensagens.
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          Interruptores:{" "}
          {(data?.flags ?? []).map((fl: any) => `${fl.key} ${fl.enabled_globally ? "ligado" : "desligado"}`).join(" · ") || "—"}
        </p>
      </header>

      {f && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            ["Em espera", f.waiting], ["Convites emitidos", f.issued], ["Convites usados", f.used],
            ["Dados por beta testers", f.by_beta_tester], ["Ativadas", f.activated],
            ["Em experiência", f.trialing], ["Subscritas", f.subscribed],
          ].map(([k, v]) => (
            <div key={k as string} className="rounded-lg border bg-card p-3">
              <div className="text-xs text-muted-foreground">{k}</div>
              <div className="text-xl font-semibold">{v as number}</div>
            </div>
          ))}
        </div>
      )}

      <section className="rounded-lg border bg-card p-4 space-y-3">
        <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
          <div>
            <Label htmlFor="note">Nota (opcional)</Label>
            <Input id="note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ex.: Agência Zome Porto — Ana" />
          </div>
          <Button onClick={() => issueMut.mutate()} disabled={issueMut.isPending}>
            {issueMut.isPending ? "A gerar…" : "Gerar convite da equipa"}
          </Button>
        </div>
        {lastCode && (
          <p className="text-sm">
            Código (só aparece agora): <span className="font-mono font-semibold">{lastCode}</span>
          </p>
        )}
      </section>

      <section className="rounded-lg border bg-card">
        <h2 className="border-b px-4 py-2 text-sm font-semibold">Convites</h2>
        {isLoading ? <div className="p-4 text-sm text-muted-foreground">A carregar…</div> : (
          <table className="w-full text-sm">
            <thead className="border-b text-left text-xs uppercase text-muted-foreground">
              <tr><th className="px-4 py-2">Origem</th><th className="px-4 py-2">Estado</th><th className="px-4 py-2">Usado por</th><th className="px-4 py-2">Expira</th><th className="px-4 py-2">Nota</th><th /></tr>
            </thead>
            <tbody>
              {(data?.invites ?? []).map((i: any) => (
                <tr key={i.id} className="border-b last:border-0">
                  <td className="px-4 py-2">{i.issuer_name}</td>
                  <td className="px-4 py-2">{STATUS[i.effective_status] ?? i.effective_status}</td>
                  <td className="px-4 py-2">{i.used_by_name ? `${i.used_by_name} (${i.used_channel ?? "—"})` : "—"}</td>
                  <td className="px-4 py-2 text-muted-foreground">{fmt(i.expires_at)}</td>
                  <td className="px-4 py-2 text-muted-foreground">{i.note ?? "—"}</td>
                  <td className="px-4 py-2 text-right">
                    {i.effective_status === "issued" && (
                      <Button size="sm" variant="outline" onClick={() => revokeMut.mutate(i.id)}>Anular</Button>
                    )}
                  </td>
                </tr>
              ))}
              {!data?.invites?.length && <tr><td className="px-4 py-3 text-muted-foreground" colSpan={6}>Ainda não há convites.</td></tr>}
            </tbody>
          </table>
        )}
      </section>

      <PilotSection />

      <section className="rounded-lg border bg-card">
        <h2 className="border-b px-4 py-2 text-sm font-semibold">Lista de espera</h2>
        <table className="w-full text-sm">
          <thead className="border-b text-left text-xs uppercase text-muted-foreground">
            <tr><th className="px-4 py-2">Pessoa</th><th className="px-4 py-2">Canal</th><th className="px-4 py-2">Consentimento</th><th className="px-4 py-2">Estado</th><th /></tr>
          </thead>
          <tbody>
            {(data?.waitlist ?? []).map((w: any) => (
              <tr key={w.user_id} className="border-b last:border-0">
                <td className="px-4 py-2">{w.name}</td>
                <td className="px-4 py-2">{w.channel ?? "—"}</td>
                <td className="px-4 py-2">{w.consent_contact ? fmt(w.consent_at) : "Não"}</td>
                <td className="px-4 py-2">{w.status === "waiting" ? "À espera" : w.status === "granted" ? "Com acesso" : "Saiu"}</td>
                <td className="px-4 py-2 text-right space-x-2">
                  {w.status === "waiting" && (
                    <>
                      <Button size="sm" onClick={() => grantMut.mutate(w.user_id)}>Dar acesso</Button>
                      <Button size="sm" variant="outline" onClick={() => removeMut.mutate(w.user_id)}>Retirar</Button>
                    </>
                  )}
                </td>
              </tr>
            ))}
            {!data?.waitlist?.length && <tr><td className="px-4 py-3 text-muted-foreground" colSpan={5}>Ninguém na lista.</td></tr>}
          </tbody>
        </table>
      </section>
    </div>
  );
}

function PilotSection() {
  const overview = useServerFn(getPilotOverview);
  const issue = useServerFn(issuePilotInviteAdmin);
  const revoke = useServerFn(revokePilotInviteAdmin);
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ["admin", "pilot"], queryFn: () => overview() });
  const [note, setNote] = useState("");
  // Um pedido = uma chave: repetir o clique (ou a rede repetir) não gera outro convite.
  const [requestId, setRequestId] = useState(() => crypto.randomUUID());
  const [lastCode, setLastCode] = useState<string | null>(null);
  const refresh = () => qc.invalidateQueries({ queryKey: ["admin", "pilot"] });

  const issueMut = useMutation({
    mutationFn: () => issue({ data: { requestId, note: note.trim() || undefined } }),
    onSuccess: (r) => {
      if (r.outcome === "issued" && r.code) { setLastCode(r.code); setNote(""); setRequestId(crypto.randomUUID()); }
      else toast.message(OUTCOME[r.outcome] ?? OUTCOME.error);
      refresh();
    },
    onError: (e: any) => toast.error(e?.message ?? "Falhou"),
  });
  const revokeMut = useMutation({
    mutationFn: (id: string) => revoke({ data: { id } }),
    onSuccess: (r) => { r.revoked ? toast.success("Convite do piloto anulado") : toast.message("Nada a anular"); refresh(); },
  });

  if (!data?.pilot) return null;
  const p = data.pilot;
  const open = p.status === "go";
  return (
    <section className="rounded-lg border bg-card">
      <div className="border-b px-4 py-2">
        <h2 className="text-sm font-semibold">Piloto AFONSO 2.0</h2>
        <p className="text-xs text-muted-foreground">
          Estado: {PILOT_STATUS[p.status] ?? p.status} · Lugares por convite livres: {data.seatsLeft} de {p.invite_cap} ·
          Validade {p.invite_ttl_days} dias · Emissor designado: {p.issuer_name} (e Super Admin) ·{" "}
          {data.flags.map((fl: any) => `${fl.key} ${fl.enabled_globally ? "ligado" : "desligado"}`).join(" · ")}
        </p>
      </div>
      <div className="space-y-3 p-4">
        <div className="flex flex-wrap gap-2 text-sm">
          {data.participants.map((x: any) => (
            <span key={x.user_id} className="rounded-md border px-2 py-1">
              {x.name} — {x.status === "active" ? "participa" : "excluído"}
            </span>
          ))}
        </div>
        {data.canManage && (
          <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
            <div>
              <Label htmlFor="pilot-note">Nota (opcional)</Label>
              <Input id="pilot-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Para quem é" />
            </div>
            <Button onClick={() => issueMut.mutate()} disabled={!open || issueMut.isPending || data.seatsLeft === 0}>
              {issueMut.isPending ? "A gerar…" : "Gerar convite do piloto"}
            </Button>
          </div>
        )}
        {!open && <p className="text-xs text-muted-foreground">O piloto está fechado: não é possível gerar convites.</p>}
        {data.canManage && <PilotDeliveryPanel onDone={refresh} />}
        {lastCode && (
          <p className="text-sm">
            Código (só aparece agora): <span className="font-mono font-semibold">{lastCode}</span>
          </p>
        )}
      </div>
      <table className="w-full text-sm">
        <thead className="border-y text-left text-xs uppercase text-muted-foreground">
          <tr><th className="px-4 py-2">Emitido por</th><th className="px-4 py-2">Via</th><th className="px-4 py-2">Estado</th><th className="px-4 py-2">Usado por</th><th className="px-4 py-2">Expira</th><th /></tr>
        </thead>
        <tbody>
          {data.invites.map((i: any) => (
            <tr key={i.id} className="border-b last:border-0">
              <td className="px-4 py-2">{i.issuer_name}</td>
              <td className="px-4 py-2 text-muted-foreground">{i.issued_via ?? "—"}</td>
              <td className="px-4 py-2">{STATUS[i.effective_status] ?? i.effective_status}</td>
              <td className="px-4 py-2">{i.used_by_name ?? "—"}</td>
              <td className="px-4 py-2 text-muted-foreground">{fmt(i.expires_at)}</td>
              <td className="px-4 py-2 text-right">
                {data.canManage && i.effective_status === "issued" && (
                  <Button size="sm" variant="outline" onClick={() => revokeMut.mutate(i.id)}>Anular</Button>
                )}
              </td>
            </tr>
          ))}
          {!data.invites.length && <tr><td className="px-4 py-3 text-muted-foreground" colSpan={6}>Ainda não há convites do piloto.</td></tr>}
        </tbody>
      </table>
    </section>
  );
}

const DELIVERY_STATUS: Record<string, string> = {
  issuing: "A emitir", accepted: "Aceite pelo WhatsApp", sent: "Enviado", delivered: "Entregue",
  read: "Lido", failed: "Falhou", blocked: "Bloqueado",
};

function PilotDeliveryPanel({ onDone }: { onDone: () => void }) {
  const list = useServerFn(listPilotInviteCandidates);
  const preview = useServerFn(previewPilotInviteDeliveryAdmin);
  const send = useServerFn(sendPilotInviteAdmin);
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ["admin", "pilot-delivery"], queryFn: () => list() });
  const [recipient, setRecipient] = useState("");
  const [channel, setChannel] = useState<"whatsapp" | "telegram">("whatsapp");
  const [pv, setPv] = useState<Awaited<ReturnType<typeof preview>> | null>(null);
  const refresh = () => { qc.invalidateQueries({ queryKey: ["admin", "pilot-delivery"] }); onDone(); };

  const pvMut = useMutation({
    mutationFn: () => preview({ data: { recipientUserId: recipient, channel } }),
    onSuccess: (r) => setPv(r),
    onError: (e: any) => toast.error(e?.message ?? "Falhou"),
  });
  const sendMut = useMutation({
    mutationFn: () => send({ data: { recipientUserId: recipient, channel, confirm: { recipientUserId: recipient, channel, confirmed: true } } }),
    onSuccess: (r) => {
      const label = DELIVERY_OUTCOME_LABEL[r.outcome as DeliveryOutcome] ?? DELIVERY_OUTCOME_LABEL.error;
      r.outcome === "accepted" || r.outcome === "sent" ? toast.success(label) : toast.message(label);
      setPv(null); refresh();
    },
    onError: (e: any) => toast.error(e?.message ?? "Falhou"),
  });

  if (!data) return null;
  return (
    <div className="space-y-3 rounded-md border p-3">
      <div className="text-sm font-medium">Enviar convite a uma pessoa registada e em espera</div>
      {!data.enabled && (
        <p className="text-xs text-muted-foreground">O envio automático está desligado. Usa “Gerar convite do piloto” para partilhar o código à mão.</p>
      )}
      <div className="grid gap-2 sm:grid-cols-[1fr_auto_auto] sm:items-end">
        <div>
          <Label htmlFor="pilot-recipient">Destinatário</Label>
          <select id="pilot-recipient" className="h-9 w-full rounded-md border bg-background px-2 text-sm"
            value={recipient} onChange={(e) => { setRecipient(e.target.value); setPv(null); }}>
            <option value="">Escolhe…</option>
            {data.candidates.map((c: any) => <option key={c.user_id} value={c.user_id}>{c.name}</option>)}
          </select>
        </div>
        <div>
          <Label htmlFor="pilot-channel">Canal</Label>
          <select id="pilot-channel" className="h-9 rounded-md border bg-background px-2 text-sm"
            value={channel} onChange={(e) => { setChannel(e.target.value as any); setPv(null); }}>
            <option value="whatsapp">WhatsApp</option>
            <option value="telegram">Telegram</option>
          </select>
        </div>
        <Button variant="outline" disabled={!recipient || pvMut.isPending} onClick={() => pvMut.mutate()}>Verificar</Button>
      </div>
      {pv && (
        <div className="space-y-2 rounded-md bg-muted p-3 text-sm" role="status">
          <div>Vais enviar um convite do piloto a <strong>{pv.recipientName}</strong> por <strong>{pv.destination}</strong>.</div>
          {pv.eligibility !== "ok" && <div>{DELIVERY_OUTCOME_LABEL[pv.eligibility as DeliveryOutcome]}</div>}
          {!pv.channelOk && pv.channelProblem && <div>{DELIVERY_OUTCOME_LABEL[pv.channelProblem as DeliveryOutcome]}</div>}
          {pv.mode === "template" && <div className="text-xs text-muted-foreground">Fora da janela de 24 h: será usado o template aprovado.</div>}
          <Button
            disabled={!pv.enabled || !pv.canManage || pv.eligibility !== "ok" || !pv.channelOk || sendMut.isPending}
            onClick={() => sendMut.mutate()}
          >
            {sendMut.isPending ? "A enviar…" : "Confirmo: enviar convite"}
          </Button>
        </div>
      )}
      {!!data.deliveries.length && (
        <table className="w-full text-xs">
          <thead className="text-left text-muted-foreground">
            <tr><th className="py-1">Pessoa</th><th>Canal</th><th>Estado</th><th>Tentativas</th><th>Atualizado</th></tr>
          </thead>
          <tbody>
            {data.deliveries.map((d: any) => (
              <tr key={d.id} className="border-t">
                <td className="py-1">{d.name}</td>
                <td>{d.channel === "whatsapp" ? "WhatsApp" : "Telegram"}</td>
                <td>{DELIVERY_STATUS[d.status] ?? d.status}{d.error_reason ? ` (${d.error_reason})` : ""}</td>
                <td>{d.attempts}</td>
                <td>{fmt(d.updated_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
