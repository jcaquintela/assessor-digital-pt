// Porque é que um registo não aparece?
//
// Havia uma única mensagem — "não encontrado, pode ter sido apagado" — para
// dois casos muito diferentes: o registo já não existe, ou existe mas está
// noutra conta (sessão errada). A segunda leitura assusta sem razão: os dados
// estão intactos, só a sessão é que não é a certa.

export type MissingRecordKind = "other_account" | "archived" | "absent";

export type MissingRecordFacts = {
  /** Existe na base de dados, mas pertence a outra conta. */
  existsForOtherUser: boolean;
  /** Existe nesta conta, mas está arquivado. */
  archivedForMe: boolean;
};

export function classifyMissingRecord(f: MissingRecordFacts): MissingRecordKind {
  if (f.archivedForMe) return "archived";
  if (f.existsForOtherUser) return "other_account";
  return "absent";
}

export type MissingRecordCopy = {
  title: string;
  subtitle: string;
  showSwitchAccount: boolean;
};

/** `label` no singular e minúsculas: "seguimento", "imóvel", "negócio". */
export function missingRecordCopy(
  kind: MissingRecordKind,
  opts: { label: string; sessionEmail?: string | null },
): MissingRecordCopy {
  const label = opts.label;
  const cap = label.charAt(0).toUpperCase() + label.slice(1);
  const email = (opts.sessionEmail ?? "").trim();

  if (kind === "other_account") {
    return {
      title: `Este ${label} está noutra conta`,
      subtitle: email
        ? `Nada foi perdido. Estás com sessão iniciada como ${email} e este registo pertence a outra conta tua. Muda de conta para o abrir.`
        : "Nada foi perdido. Este registo pertence a outra conta. Muda de conta para o abrir.",
      showSwitchAccount: true,
    };
  }
  if (kind === "archived") {
    return {
      title: `${cap} arquivado`,
      subtitle: "Está arquivado. Podes recuperá-lo a partir da lista, nos arquivados.",
      showSwitchAccount: false,
    };
  }
  return {
    title: `${cap} não encontrado`,
    subtitle: "Pode ter sido apagado.",
    showSwitchAccount: false,
  };
}
