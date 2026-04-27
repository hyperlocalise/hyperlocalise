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

function extensionFromMimeType(mimeType: string) {
  const normalizedMimeType = mimeType.toLowerCase().split(";")[0]?.trim();
  switch (normalizedMimeType) {
    case "image/jpeg":
      return "jpg";
    case "image/png":
      return "png";
    case "image/webp":
      return "webp";
    case "image/gif":
      return "gif";
    default:
      if (normalizedMimeType?.startsWith("image/")) {
        return normalizedMimeType.slice("image/".length).replace(/\+xml$/, "");
      }
      return "png";
  }
}

function outputFilename(
  filename: string | undefined,
  targetLocale: string | null,
  mimeType: string,
) {
  const suffix = targetLocale ? `-${targetLocale.toLowerCase()}` : "-localized";
  const extension = extensionFromMimeType(mimeType);
  if (!filename) {
    return `image${suffix}.${extension}`;
  }

  const extensionStart = filename.lastIndexOf(".");
  if (extensionStart <= 0) {
    return `${filename}${suffix}.${extension}`;
  }

  return `${filename.slice(0, extensionStart)}${suffix}.${extension}`;
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
  const outputMimeType = result.mimeType || "image/png";

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
        data: result.image,
        filename: outputFilename(imageAttachment.name, intent.targetLocale, outputMimeType),
        mimeType: outputMimeType,
      },
    ],
  });
}
