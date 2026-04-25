import type { Message, Thread } from "chat";

import type { EmailBotState, RawEmailMessage } from "./types";

export async function handleImageAttachment(
  thread: Thread<EmailBotState>,
  _message: Message,
  imageAttachment: Message["attachments"][number],
  _raw: Pick<RawEmailMessage, "emailId" | "subject" | "messageId">,
) {
  await thread.post(
    `I received ${imageAttachment.name}, but image localization is not available in the email translation workflow yet. Please send a document, spreadsheet, JSON, or text file for translation.`,
  );
}
