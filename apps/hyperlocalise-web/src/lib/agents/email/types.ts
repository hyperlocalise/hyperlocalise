export type EmailBotState = {
  lastEmailEvent?: {
    senderEmail: string;
    subject: string;
    originalMessageId: string;
  };
  pendingTranslationRequest?: PendingEmailTranslationRequest;
  processedTranslationKeys?: string[];
};

export type RawEmailMessage = {
  emailId?: string;
  subject?: string;
  messageId?: string;
  to?: string[];
  attachments?: Array<{ id: string; filename: string | null; contentType: string }>;
};

export type PendingEmailTranslationRequest = {
  requestId: string;
  senderEmail: string;
  subject: string;
  originalMessageId: string;
  emailId: string;
  inboundEmailAddress: string;
  attachments: Array<{ id: string; filename: string | null; contentType: string }>;
  sourceLocale: string | null;
  targetLocale: string | null;
  instructions: string | null;
};
