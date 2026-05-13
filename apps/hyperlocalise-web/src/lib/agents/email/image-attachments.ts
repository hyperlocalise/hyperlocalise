import type { Message, Thread } from "chat";

import { localizeImageAttachment } from "@/lib/agents/image-localization";

import type { EmailRequestIntent } from "./intent";
import type { EmailBotState, RawEmailMessage } from "./types";

export async function handleImageAttachment(
  thread: Thread<EmailBotState>,
  message: Message,
  imageAttachment: Message["attachments"][number],
  raw: Pick<RawEmailMessage, "emailId" | "subject" | "messageId">,
  intent: EmailRequestIntent,
) {
  const file = await localizeImageAttachment({
    attachment: imageAttachment,
    sourceLocale: intent.sourceLocale,
    targetLocale: intent.targetLocale,
    instructions: intent.instructions,
    contextLines: [
      raw.subject ? `Email subject: ${raw.subject}` : null,
      message.text ? `Email body: ${message.text}` : null,
    ],
  });

  await thread.post({
    raw: [
      `Here is the localized version of ${imageAttachment.name ?? "your image"}${intent.targetLocale ? ` for the ${intent.targetLocale} market` : ""}. I kept the layout and style as close to the original as possible.`,
      "",
      "Let me know if you'd like any adjustments to the text placement or tone.",
      "",
      "—Hyperlocalise Agent",
    ].join("\n"),
    files: [
      {
        data: file.data,
        filename: file.filename,
        mimeType: file.mimeType,
      },
    ],
  });
}
