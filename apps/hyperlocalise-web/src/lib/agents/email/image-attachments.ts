import type { Message, Thread } from "chat";

import { regenerateImageFromAttachment } from "@/lib/image-generation";

import type { EmailRequestIntent } from "./intent";
import type { EmailBotState, RawEmailMessage } from "./types";

function imageAttachmentData(imageAttachment: Message["attachments"][number]) {
  if (imageAttachment.fetchData) {
    return imageAttachment.fetchData();
  }

  const { data } = imageAttachment;
  if (Buffer.isBuffer(data)) {
    return Promise.resolve(data);
  }
  if (data instanceof Blob) {
    return data.arrayBuffer().then((arrayBuffer) => Buffer.from(arrayBuffer));
  }

  throw new Error(`Image attachment ${imageAttachment.name ?? "attachment"} has no data`);
}

function outputFilename(filename: string | undefined, targetLocale: string | null) {
  const suffix = targetLocale ? `-${targetLocale.toLowerCase()}` : "-localized";
  if (!filename) {
    return `image${suffix}.png`;
  }

  const extensionStart = filename.lastIndexOf(".");
  if (extensionStart <= 0) {
    return `${filename}${suffix}.png`;
  }

  return `${filename.slice(0, extensionStart)}${suffix}.png`;
}

function buildImagePrompt(input: {
  message: Message;
  imageAttachment: Message["attachments"][number];
  intent: EmailRequestIntent;
  raw: Pick<RawEmailMessage, "subject">;
}) {
  const { message, imageAttachment, intent, raw } = input;
  return [
    "Use the attached image as the visual source and generate a localized version.",
    "Preserve the original layout, style, composition, brand treatment, and visual hierarchy unless the user explicitly asks for a change.",
    intent.sourceLocale ? `Source locale: ${intent.sourceLocale}` : "Source locale: auto-detect",
    intent.targetLocale ? `Target locale: ${intent.targetLocale}` : null,
    intent.instructions ? `User instructions: ${intent.instructions}` : null,
    raw.subject ? `Email subject: ${raw.subject}` : null,
    message.text ? `Email body: ${message.text}` : null,
    imageAttachment.name ? `Source filename: ${imageAttachment.name}` : null,
  ]
    .filter((line): line is string => line !== null)
    .join("\n");
}

export async function handleImageAttachment(
  thread: Thread<EmailBotState>,
  message: Message,
  imageAttachment: Message["attachments"][number],
  raw: Pick<RawEmailMessage, "emailId" | "subject" | "messageId">,
  intent: EmailRequestIntent,
) {
  const image = await imageAttachmentData(imageAttachment);
  const prompt = buildImagePrompt({ message, imageAttachment, intent, raw });
  const result = await regenerateImageFromAttachment(
    image,
    imageAttachment.mimeType ?? "image/png",
    prompt,
  );

  await thread.post({
    raw: [
      `Done: ${imageAttachment.name ?? "image attachment"}`,
      intent.targetLocale ? `Localized image: ${intent.targetLocale}` : "Localized image generated",
      "Attached: generated image",
    ].join("\n"),
    files: [
      {
        data: result.image,
        filename: outputFilename(imageAttachment.name, intent.targetLocale),
        mimeType: "image/png",
      },
    ],
  });
}
