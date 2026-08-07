import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { foldIncludes } from "@/lib/search/normalize";
import { InvitePreview } from "@/components/admin/invite-preview";
import { InviteLinkDialog } from "@/components/admin/invite-link-dialog";
import { toast } from "sonner";
import {
  listAccessUsers,
  createAccess,
  updateAccess,
  deactivateAccess,
  reactivateAccess,
  listPromoCodes,
  createPromoCode,
  revokePromoCode,
  listDuplicateAccountAlerts,
  confirmAccessEmail,
  findAccountsByContact,
  type AccessUser,
  type ExistingAccountMatch,
} from "@/lib/admin/acessos.functions";
import { getMyAdminRole } from "@/lib/admin.functions";
import { Badge, Empty, PageTitle, SectionTitle } from "@/components/admin/ui";
import { AccountMergeDialog, type MergeSource } from "@/components/admin/merge-dialog";
import { startSupportSession } from "@/lib/admin/support-mode.functions";
import { writeSupportMode } from "@/lib/admin/support-mode";
import { supabase } from "@/integrations/supabase/client";
import { tierLabel, TIER_DISPLAY_NAME, type SubscriptionTier } from "@/lib/subscription/tiers";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export const Route = createFileRoute("/admin/utilizadores")({
  head: () => ({ meta: [{ title: "Utilizadores & planos — Afonso admin" }] }),
  component: AcessosPage,
});

const TIERS: SubscriptionTier[] = ["base", "consultor", "pro", "hub"];

function SupportModeDialog({ user, onClose }: { user: AccessUser; onClose: () => void }) {
  const [motivo, setMotivo] = useState("");
  const [busy, setBusy] = useState(false);
  const nome = user.name || user.email;

  const entrar = async () => {
    setBusy(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const admin = sessionData.session;
      if (!admin) throw new Error("Sessão de admin expirada. Volta a entrar.");

      const res = await startSupportSession({
        data: { target_user_id: user.id, reason: motivo.trim() },
      });

      const { error } = await supabase.auth.verifyOtp({
        type: "magiclink",
        token_hash: res.token_hash,
      });
      if (error) throw new Error(error.message);

      writeSupportMode({
        sessionId: res.session_id,
        targetUserId: res.target_user_id,
        targetName: res.target_name,
        adminAccessToken: admin.access_token,
        adminRefreshToken: admin.refresh_token,
        startedAt: new Date().toISOString(),
      });
      window.location.assign("/hoje");
    } catch (e) {
      setBusy(false);
      toast.error((e as Error).message || "Não foi possível entrar em modo suporte.");
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="admin-surface">
        <DialogHeader>
          <DialogTitle>Entrar como {nome}</DialogTitle>
          <DialogDescription>
            Abres Hoje, Pessoas, Imóveis, Negócios e Drive tal como {nome} os vê, para corrigires dados
            em nome dele. Não vês credenciais, pagamentos nem tokens. Tudo o que fizeres fica na
            auditoria como “admin agiu em nome de {nome}”.
          </DialogDescription>
        </DialogHeader>
        <label className="block text-sm">Motivo do apoio
          <input
            className="admin-input mt-1 w-full"
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            placeholder="Juntar pessoas duplicadas a pedido do consultor"
          />
        </label>
        <DialogFooter>
          <button type="button" className="admin-btn" onClick={onClose}>Cancelar</button>
          <button
            type="button"
            className="admin-btn-primary"
            disabled={busy || motivo.trim().length < 3}
            onClick={entrar}
          >{busy ? "A abrir…" : "Entrar em modo suporte"}</button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function fmtDate(v: string | null) {
  return v ? new Date(v).toLocaleDateString("pt-PT") : "—";
}

function betaLabel(u: AccessUser) {
  if (!u.is_beta_tester) return "—";
  return u.beta_expires_at ? `sim, até ${fmtDate(u.beta_expires_at)}` : "sim, sem prazo";
}

function AcessosPage() {
  return <AcessosPageInner />;
}

function AcessosPageInner() {
  const qc = useQueryClient();
  const roleFn = useServerFn(getMyAdminRole);
  const listFn = useServerFn(listAccessUsers);
  const promosFn = useServerFn(listPromoCodes);
  const dupsFn = useServerFn(listDuplicateAccountAlerts);
  const updateFn = useServerFn(updateAccess);
  const deactivateFn = useServerFn(deactivateAccess);
  const reactivateFn = useServerFn(reactivateAccess);
  const createPromoFn = useServerFn(createPromoCode);
  const revokePromoFn = useServerFn(revokePromoCode);
  const confirmEmailFn = useServerFn(confirmAccessEmail);

  const { data: me } = useQuery({ queryKey: ["admin", "my-role"], queryFn: () => roleFn() });
  const isSuper = me?.role === "super_admin";
  const { data: users, isPending } = useQuery({ queryKey: ["admin", "access-users"], queryFn: () => listFn() });
  const { data: promos } = useQuery({ queryKey: ["admin", "promo-codes"], queryFn: () => promosFn() });
  const { data: dups } = useQuery({ queryKey: ["admin", "duplicate-accounts"], queryFn: () => dupsFn() });

  const [q, setQ] = useState("");
  const [sortCredits, setSortCredits] = useState(false);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<AccessUser | null>(null);
  const [promoOpen, setPromoOpen] = useState(false);
  const [deleting, setDeleting] = useState<AccessUser | null>(null);
  const [merging, setMerging] = useState<MergeSource | null>(null);
  const [support, setSupport] = useState<AccessUser | null>(null);
  const [invite, setInvite] = useState<AccessUser | null>(null);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["admin", "access-users"] });
    qc.invalidateQueries({ queryKey: ["admin", "promo-codes"] });
    qc.invalidateQueries({ queryKey: ["admin", "duplicate-accounts"] });
  };

  const run = (label: string, p: Promise<unknown>) =>
    p.then(() => { toast.success(label); invalidate(); })
     .catch((e: Error) => toast.error(e.message || "Não foi possível concluir."));

  const filtered = (users ?? [])
    .filter((u) => {
      if (!q) return true;
      return foldIncludes(u.email ?? "", q) || foldIncludes(u.name ?? "", q);
    })
    .sort((a, b) => (sortCredits ? (b.credits30d ?? 0) - (a.credits30d ?? 0) : 0));

  return (
    <div>
      <PageTitle
        title="Utilizadores & planos"
        sub="Quem tem acesso, com que plano, e por que canal entra. Produto teu, agnóstico — geres tudo aqui, sem depender do Stripe."
      />

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <input
          className="admin-input w-64"
          placeholder="Procurar por nome ou email…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <button type="button" className="admin-btn-primary" disabled={!isSuper} onClick={() => setCreating(true)}>
          + Criar acesso
        </button>
      </div>

      <table>
        <thead>
          <tr>
            <th>Nome</th><th>Plano</th><th>Canal</th><th>Beta</th>
            <th>
              <button
                type="button"
                className="admin-link"
                title="Créditos de IA consumidos pela atividade deste consultor nos últimos 30 dias"
                onClick={() => setSortCredits((v) => !v)}
              >
                Créditos (30d){sortCredits ? " ↓" : ""}
              </button>
            </th>
            <th>Estado</th><th>Ações</th>
          </tr>
        </thead>
        <tbody>
          {isPending ? (
            <tr><td colSpan={7} className="mini">A carregar…</td></tr>
          ) : filtered.length === 0 ? (
            <tr><td colSpan={7} className="mini">Sem utilizadores.</td></tr>
          ) : filtered.map((u) => (
            <tr key={u.id}>
              <td>
                <Link to="/admin/consultor/$id" params={{ id: u.id }} className="admin-link">
                  {u.name || u.email || "Ver ficha"}
                </Link>
                <br />
                <span className="mini" style={{ color: "var(--muted)" }}>{u.email}</span>
              </td>
              <td><Badge tone={u.tier === "base" ? "warn" : "ok"}>{tierLabel(u.tier)}</Badge></td>
              <td className="mini">{u.channel}</td>
              <td className="mini">{betaLabel(u)}</td>
              <td className="mini" style={{ textAlign: "right" }}>
                {(u.credits30d ?? 0) >= 0.01 ? (u.credits30d ?? 0).toFixed(2).replace(".", ",") : "—"}
              </td>
              <td>
                <Badge tone={u.state === "active" ? "ok" : u.state === "test" ? "warn" : "bad"}>
                  {u.state === "active" ? "Ativo" : u.state === "test" ? "Teste" : "Inativo"}
                </Badge>
                {!u.email_confirmed && (
                  <>
                    {" "}
                    <Badge tone="bad">Email por confirmar</Badge>
                  </>
                )}
              </td>
              <td className="mini">
                <button type="button" className="admin-link" disabled={!isSuper} onClick={() => setEditing(u)}>Alterar</button>
                {" · "}
                <button
                  type="button"
                  className="admin-link"
                  disabled={!isSuper || me?.userId === u.id}
                  onClick={() => setSupport(u)}
                >Entrar como utilizador</button>
                {" · "}
                <button
                  type="button"
                  className="admin-link"
                  disabled={!isSuper}
                  onClick={() => setInvite(u)}
                >Link de acesso</button>
                {" · "}
                {!u.email_confirmed && (
                  <>
                    <button
                      type="button"
                      className="admin-link"
                      disabled={!isSuper}
                      onClick={() =>
                        run("Email confirmado — já pode entrar.", confirmEmailFn({ data: { target_user_id: u.id } }))
                      }
                    >Confirmar email</button>
                    {" · "}
                  </>
                )}
                {u.state === "inactive" ? (
                  <button
                    type="button"
                    className="admin-link"
                    disabled={!isSuper}
                    onClick={() => run("Conta reativada.", reactivateFn({ data: { target_user_id: u.id } }))}
                  >Reativar</button>
                ) : (
                  <button
                    type="button"
                    className="admin-link-danger"
                    disabled={!isSuper || me?.userId === u.id}
                    onClick={() => setDeleting(u)}
                  >Eliminar</button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mini mt-2" style={{ color: "var(--muted)" }}>
        “Eliminar” desativa a conta — perde acesso, os dados ficam. Apagar dados em definitivo não está disponível.
      </p>
      <p className="mini" style={{ color: "var(--muted)" }}>
        Contas criadas aqui nascem já confirmadas. “Email por confirmar” só aparece em contas criadas pelo próprio
        (registo no site) — “Confirmar email” desbloqueia a entrada na hora, sem esperar por email.
      </p>

      <SectionTitle>Contas a rever (possíveis duplicados)</SectionTitle>
      <table>
        <thead>
          <tr><th>Pessoa</th><th>Motivo</th><th>Contas</th><th>Ações</th></tr>
        </thead>
        <tbody>
          {(dups ?? []).length === 0 ? (
            <tr><td colSpan={4} className="mini">Nada a rever — nenhuma conta-sombra nem nomes repetidos em canais diferentes.</td></tr>
          ) : (dups ?? []).map((d) => {
            const isShadow = (a: { email: string }) => a.email.endsWith("@shadow.assessor.local");
            const shadow = d.accounts.find(isShadow);
            const main = d.accounts.find((a) => !isShadow(a));
            const src = shadow ?? d.accounts[0];
            const tgt = shadow ? main : d.accounts[1];
            return (
            <tr key={d.key}>
              <td>{d.name}</td>
              <td>
                <Badge tone={d.reason === "shadow_account" ? "bad" : "warn"}>
                  {d.reason === "shadow_account" ? "Conta-sombra por ligar" : "Mesmo nome, canais diferentes"}
                </Badge>
              </td>
              <td className="mini">
                {d.accounts.map((a) => (
                  <div key={a.id}>
                    {a.email} · {tierLabel(a.tier)} · {a.channels.join(", ") || "sem canal"} · {a.activity} mensagens · desde {fmtDate(a.created_at)}
                  </div>
                ))}
              </td>
              <td className="mini">
                <button
                  type="button"
                  className="admin-link"
                  disabled={!isSuper || !src}
                  onClick={() =>
                    setMerging({
                      id: src!.id,
                      label: `${src!.name || d.name} · ${src!.email}`,
                      suggestedTargetId: tgt?.id ?? null,
                    })
                  }
                >Fundir contas</button>
              </td>
            </tr>
            );
          })}
        </tbody>
      </table>
      <Empty note="nunca funde sozinho — homónimos existem e a decisão é humana">
        Sinaliza contas que podem ser a mesma pessoa em canais diferentes. “Fundir contas” passa plano, estado de
        beta, canais e todos os registos para a conta que ficar (por norma a conta de email), desliga a conta-sombra
        e regista tudo na auditoria.
      </Empty>

      {merging && (
        <AccountMergeDialog
          key={merging.id}
          source={merging}
          onClose={() => setMerging(null)}
          onDone={invalidate}
        />
      )}

      {support && (
        <SupportModeDialog key={support.id} user={support} onClose={() => setSupport(null)} />
      )}

      {invite && (
        <InviteLinkDialog
          key={invite.id}
          userId={invite.id}
          nome={invite.name || invite.email}
          onClose={() => setInvite(null)}
        />
      )}

      <SectionTitle>Códigos promocionais</SectionTitle>
      <div className="mb-2.5 flex justify-end">
        <button type="button" className="admin-btn" disabled={!isSuper} onClick={() => setPromoOpen(true)}>+ Criar código</button>
      </div>
      <table>
        <thead>
          <tr><th>Código</th><th>Concede</th><th>Usos</th><th>Validade</th><th>Estado</th><th>Ações</th></tr>
        </thead>
        <tbody>
          {(promos ?? []).length === 0 ? (
            <tr><td colSpan={6} className="mini">Nenhum código criado.</td></tr>
          ) : (promos ?? []).map((p) => {
            const expired = !!p.expires_at && new Date(p.expires_at).getTime() < Date.now();
            const exhausted = p.used_count >= p.max_uses;
            const live = p.active && !expired && !exhausted;
            return (
              <tr key={p.id}>
                <td className="mono">{p.code}</td>
                <td className="mini">{tierLabel(p.grants_tier)}{p.note ? ` · ${p.note}` : ""}</td>
                <td className="mini">{p.used_count} / {p.max_uses}</td>
                <td className="mini">{fmtDate(p.expires_at)}</td>
                <td>
                  <Badge tone={live ? "ok" : "warn"}>
                    {live ? "Ativo" : !p.active ? "Revogado" : expired ? "Expirado" : "Esgotado"}
                  </Badge>
                </td>
                <td className="mini">
                  <button
                    type="button"
                    className="admin-link-danger"
                    disabled={!isSuper || !p.active}
                    onClick={() => run("Código revogado.", revokePromoFn({ data: { id: p.id } }))}
                  >Revogar</button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <Empty note="cada uso é registado na Auditoria, com quem criou e quem resgatou">
        Um código promocional aplica o plano indicado quando alguém entra por Telegram ou WhatsApp — sem passar por checkout.
      </Empty>

      <CreateAccessDialog
        open={creating}
        onOpenChange={setCreating}
        onDone={() => { setCreating(false); invalidate(); }}
      />
      <EditAccessDialog
        user={editing}
        onOpenChange={(o) => !o && setEditing(null)}
        onSubmit={(payload) => run("Utilizador atualizado.", updateFn({ data: payload }).then(() => setEditing(null)))}
      />
      <CreatePromoDialog
        open={promoOpen}
        onOpenChange={setPromoOpen}
        onSubmit={(payload) => run("Código criado.", createPromoFn({ data: payload }).then(() => setPromoOpen(false)))}
      />

      <Dialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <DialogContent className="admin-surface">
          <DialogHeader>
            <DialogTitle>Desativar acesso</DialogTitle>
            <DialogDescription>
              {deleting?.email} perde acesso imediato. Os dados ficam guardados e a conta pode ser reativada.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <button type="button" className="admin-btn" onClick={() => setDeleting(null)}>Cancelar</button>
            <button
              type="button"
              className="admin-btn-danger"
              onClick={() => {
                const target = deleting;
                if (!target) return;
                setDeleting(null);
                run("Conta desativada. Dados mantidos.", deactivateFn({ data: { target_user_id: target.id } }));
              }}
            >Desativar</button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function TierSelect({ value, onChange }: { value: SubscriptionTier; onChange: (v: SubscriptionTier) => void }) {
  return (
    <select className="admin-input w-full" value={value} onChange={(e) => onChange(e.target.value as SubscriptionTier)}>
      {TIERS.map((t) => <option key={t} value={t}>{TIER_DISPLAY_NAME[t]}</option>)}
    </select>
  );
}

function CreateAccessDialog({
  open, onOpenChange, onDone,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onDone: () => void;
}) {
  const createFn = useServerFn(createAccess);
  const findFn = useServerFn(findAccountsByContact);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [sendChannel, setSendChannel] = useState<"whatsapp" | "telegram" | "nenhum">("whatsapp");
  const [tier, setTier] = useState<SubscriptionTier>("consultor");
  const [beta, setBeta] = useState(false);
  const [expires, setExpires] = useState("");
  const [dups, setDups] = useState<ExistingAccountMatch[] | null>(null);
  const [busy, setBusy] = useState(false);

  const reset = () => {
    setName(""); setEmail(""); setPhone(""); setTier("consultor");
    setBeta(false); setExpires(""); setDups(null); setSendChannel("whatsapp");
  };

  const payload = (associateTo?: string) => ({
    email: email.trim(),
    name: name.trim() || undefined,
    phone: phone.trim() || null,
    subscription_tier: tier,
    is_beta_tester: beta,
    beta_expires_at: beta && expires ? new Date(expires).toISOString() : null,
    send_link_channel: sendChannel,
    associate_to_user_id: associateTo ?? null,
  });

  const submit = async (associateTo?: string) => {
    if (!email.trim() && !associateTo) { toast.error("Indica o email."); return; }
    setBusy(true);
    try {
      const res = await createFn({ data: payload(associateTo) });
      if (!res.ok) {
        setDups(res.duplicates);
        return;
      }
      toast.success(
        res.associated ? "Canais associados à conta existente." : "Acesso criado e confirmado.",
      );
      if (res.erroEnvio) toast.error(res.erroEnvio);
      else if (res.linkEnviado) toast.success(`Link de acesso enviado por ${res.canal}.`);
      reset();
      onDone();
    } catch (e) {
      toast.error((e as Error).message || "Não foi possível concluir.");
    } finally {
      setBusy(false);
    }
  };

  // Verificação de duplicado enquanto o admin preenche — antes de criar seja o que for.
  const checkDuplicates = async () => {
    if (!email.trim() && !phone.trim()) return;
    try {
      const found = await findFn({ data: { email: email.trim() || null, phone: phone.trim() || null } });
      setDups(found.length ? found : null);
    } catch { /* verificação silenciosa: o servidor volta a validar ao criar */ }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) reset(); onOpenChange(o); }}>
      <DialogContent className="admin-surface">
        <DialogHeader>
          <DialogTitle>Criar acesso</DialogTitle>
          <DialogDescription>
            Nome, email e telefone no mesmo passo. A conta nasce confirmada, com os canais já ligados,
            e recebe um único link de acesso.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <label className="block text-sm">Nome
            <input className="admin-input mt-1 w-full" value={name} onChange={(e) => setName(e.target.value)} placeholder="Nome do consultor" />
          </label>
          <label className="block text-sm">Email
            <input className="admin-input mt-1 w-full" type="email" value={email} onChange={(e) => setEmail(e.target.value)} onBlur={checkDuplicates} placeholder="nome@empresa.pt" />
          </label>
          <label className="block text-sm">Telefone (WhatsApp)
            <input className="admin-input mt-1 w-full" value={phone} onChange={(e) => setPhone(e.target.value)} onBlur={checkDuplicates} placeholder="351912345678" />
          </label>
          <label className="block text-sm">Plano
            <TierSelect value={tier} onChange={setTier} />
          </label>
          <label className="block text-sm">Enviar link de acesso por
            <select className="admin-input mt-1 w-full" value={sendChannel} onChange={(e) => setSendChannel(e.target.value as any)}>
              <option value="whatsapp">WhatsApp</option>
              <option value="telegram">Telegram</option>
              <option value="nenhum">Não enviar agora</option>
            </select>
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={beta} onChange={(e) => setBeta(e.target.checked)} />
            Beta tester
          </label>
          {beta ? (
            <label className="block text-sm">Beta expira em (opcional)
              <input className="admin-input mt-1 w-full" type="date" value={expires} onChange={(e) => setExpires(e.target.value)} />
            </label>
          ) : null}

          {sendChannel !== "nenhum" ? (
            <InvitePreview canal={sendChannel} nome={name} phone={phone} />
          ) : null}

          {dups?.length ? (
            <div className="rounded-md border p-3 text-sm" style={{ borderColor: "var(--warn, #d97706)" }}>
              <p className="font-medium">
                Já existe uma conta com este {Array.from(new Set(dups.flatMap((d) => d.matchedOn))).join(" / ")} — queres associar a esta em vez de criar nova?
              </p>
              <ul className="mt-2 space-y-2">
                {dups.map((d) => (
                  <li key={d.id} className="flex items-center justify-between gap-3">
                    <span className="mini">
                      {d.name || d.email}
                      {d.isShadow ? " (conta-sombra)" : ""} · {tierLabel(d.tier)}
                      {d.channels.length ? ` · ${d.channels.join(", ")}` : ""}
                    </span>
                    <button type="button" className="admin-btn" disabled={busy} onClick={() => submit(d.id)}>
                      Associar a esta
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
        <DialogFooter>
          <button type="button" className="admin-btn" onClick={() => onOpenChange(false)}>Cancelar</button>
          <button
            type="button"
            className="admin-btn-primary"
            disabled={busy || !!dups?.length}
            onClick={() => submit()}
          >{busy ? "A criar…" : "Criar acesso"}</button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EditAccessDialog({
  user, onOpenChange, onSubmit,
}: {
  user: AccessUser | null;
  onOpenChange: (o: boolean) => void;
  onSubmit: (p: { target_user_id: string; subscription_tier: SubscriptionTier; is_beta_tester: boolean; beta_expires_at: string | null }) => void;
}) {
  const [tier, setTier] = useState<SubscriptionTier>("base");
  const [beta, setBeta] = useState(false);
  const [expires, setExpires] = useState("");
  const [loadedFor, setLoadedFor] = useState<string | null>(null);

  if (user && loadedFor !== user.id) {
    setLoadedFor(user.id);
    setTier((user.tier as SubscriptionTier) ?? "base");
    setBeta(user.is_beta_tester);
    setExpires(user.beta_expires_at ? user.beta_expires_at.slice(0, 10) : "");
  }

  return (
    <Dialog open={!!user} onOpenChange={onOpenChange}>
      <DialogContent className="admin-surface">
        <DialogHeader>
          <DialogTitle>Alterar acesso</DialogTitle>
          <DialogDescription>{user?.email}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <label className="block text-sm">Plano
            <TierSelect value={tier} onChange={setTier} />
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={beta} onChange={(e) => setBeta(e.target.checked)} />
            Beta tester
          </label>
          {beta ? (
            <label className="block text-sm">Beta expira em (vazio = sem prazo)
              <input className="admin-input mt-1 w-full" type="date" value={expires} onChange={(e) => setExpires(e.target.value)} />
            </label>
          ) : null}
        </div>
        <DialogFooter>
          <button type="button" className="admin-btn" onClick={() => onOpenChange(false)}>Cancelar</button>
          <button
            type="button"
            className="admin-btn-primary"
            onClick={() => user && onSubmit({
              target_user_id: user.id,
              subscription_tier: tier,
              is_beta_tester: beta,
              beta_expires_at: beta && expires ? new Date(expires).toISOString() : null,
            })}
          >Guardar</button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CreatePromoDialog({
  open, onOpenChange, onSubmit,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onSubmit: (p: { code: string; grants_tier: SubscriptionTier; max_uses: number; expires_at: string | null; note?: string }) => void;
}) {
  const [code, setCode] = useState("");
  const [tier, setTier] = useState<SubscriptionTier>("consultor");
  const [maxUses, setMaxUses] = useState("20");
  const [expires, setExpires] = useState("");
  const [note, setNote] = useState("");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="admin-surface">
        <DialogHeader>
          <DialogTitle>Criar código promocional</DialogTitle>
          <DialogDescription>Quem entrar por Telegram ou WhatsApp com este código recebe o plano indicado.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <label className="block text-sm">Código
            <input className="admin-input mono mt-1 w-full" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="ZOME-HD-2026" />
          </label>
          <label className="block text-sm">Concede
            <TierSelect value={tier} onChange={setTier} />
          </label>
          <label className="block text-sm">Usos máximos
            <input className="admin-input mt-1 w-full" type="number" min={1} value={maxUses} onChange={(e) => setMaxUses(e.target.value)} />
          </label>
          <label className="block text-sm">Validade (opcional)
            <input className="admin-input mt-1 w-full" type="date" value={expires} onChange={(e) => setExpires(e.target.value)} />
          </label>
          <label className="block text-sm">Nota (opcional)
            <input className="admin-input mt-1 w-full" value={note} onChange={(e) => setNote(e.target.value)} placeholder="3 meses grátis" />
          </label>
        </div>
        <DialogFooter>
          <button type="button" className="admin-btn" onClick={() => onOpenChange(false)}>Cancelar</button>
          <button
            type="button"
            className="admin-btn-primary"
            onClick={() => onSubmit({
              code: code.trim(),
              grants_tier: tier,
              max_uses: Number(maxUses) || 1,
              expires_at: expires ? new Date(expires).toISOString() : null,
              note: note.trim() || undefined,
            })}
          >Criar código</button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
