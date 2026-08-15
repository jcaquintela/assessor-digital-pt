// Forma comum de um email, independente do provedor (Gmail ou Outlook).
export type MailMessageHead = {
  id: string;
  threadId: string;
  from: string | null;
  to: string[];
  subject: string | null;
  snippet: string | null;
  sentAt: string | null;
  isRead: boolean;
  /** Sinal do provedor de que o email é provavelmente ruído (Focused/Other, spam). */
  lowPriorityHint?: boolean;
};
