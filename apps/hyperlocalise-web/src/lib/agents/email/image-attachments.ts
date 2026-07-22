/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in the LICENSE file.
 *
 * Change Date: Four years from the date the Licensed Work is published.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
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
  billing?: {
    organizationId: string;
    interactionId?: string | null;
  },
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
    billing: billing
      ? {
          organizationId: billing.organizationId,
          operationKey: `image-localization:email:${raw.emailId}:${intent.targetLocale ?? "unknown"}`,
          source: "email_image_localization",
          interactionId: billing.interactionId,
          dimensions: {
            channel: "email",
            target_locale: intent.targetLocale,
          },
        }
      : undefined,
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
