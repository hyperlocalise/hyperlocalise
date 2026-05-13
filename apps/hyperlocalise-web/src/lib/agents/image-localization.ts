import type { Message } from "chat";

import { regenerateImageFromAttachment } from "@/lib/image-generation";

export type ImageLocalizationAttachment = NonNullable<Message["attachments"]>[number];

type LocalizeImageAttachmentInput = {
  attachment: ImageLocalizationAttachment;
  sourceLocale?: string | null;
  targetLocale?: string | null;
  instructions?: string | null;
  contextLines?: Array<string | null | undefined>;
};

export function getImageAttachments(message: Message): ImageLocalizationAttachment[] {
  return (message.attachments ?? []).filter((attachment) => {
    return attachment.type === "image" || attachment.mimeType?.toLowerCase().startsWith("image/");
  });
}

export function getImageAttachmentData(imageAttachment: ImageLocalizationAttachment) {
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

function filenameLocaleSuffix(targetLocale: string | null | undefined) {
  return targetLocale
    ? `-${targetLocale.toLowerCase().replace(/[^a-z0-9._-]+/g, "-")}`
    : "-localized";
}

export function localizedImageOutputFilename(
  filename: string | undefined,
  targetLocale: string | null | undefined,
  mimeType: string,
) {
  const suffix = filenameLocaleSuffix(targetLocale);
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

export function buildImageLocalizationPrompt(input: LocalizeImageAttachmentInput) {
  const { attachment, sourceLocale, targetLocale, instructions, contextLines } = input;
  return [
    "Use the attached image as the visual source and generate a localized version.",
    "Preserve the original layout, style, composition, brand treatment, and visual hierarchy unless the user explicitly asks for a change.",
    sourceLocale ? `Source locale: ${sourceLocale}` : "Source locale: auto-detect",
    targetLocale ? `Target locale: ${targetLocale}` : null,
    instructions ? `User instructions: ${instructions}` : null,
    ...(contextLines ?? []),
    attachment.name ? `Source filename: ${attachment.name}` : null,
  ]
    .filter((line): line is string => line !== null && line !== undefined)
    .join("\n");
}

export async function localizeImageAttachment(input: LocalizeImageAttachmentInput) {
  const image = await getImageAttachmentData(input.attachment);
  const prompt = buildImageLocalizationPrompt(input);
  const result = await regenerateImageFromAttachment(
    image,
    input.attachment.mimeType ?? "image/png",
    prompt,
  );
  const mimeType = result.mimeType || "image/png";

  return {
    data: result.image,
    filename: localizedImageOutputFilename(input.attachment.name, input.targetLocale, mimeType),
    mimeType,
    prompt: result.prompt,
  };
}
