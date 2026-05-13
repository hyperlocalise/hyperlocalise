import type { Message } from "chat";

import { createStoredFile } from "@/lib/file-storage/records";
import {
  inferSupportedFileTranslationFileFormat,
  supportedFileTranslationFileFormats,
  type SupportedFileTranslationFileFormat,
} from "@/lib/translation/file-formats";

type SlackAttachment = NonNullable<Message["attachments"]>[number];

export type StoredSlackFileAttachment = {
  id: string;
  filename: string;
  contentType: string;
  fileFormat: SupportedFileTranslationFileFormat;
  url: string;
};

type StoreSlackFileAttachmentsInput = {
  attachments: SlackAttachment[];
  organizationId: string;
  projectId: string | null;
  createdByUserId: string | null;
  interactionId: string;
};

function isImageAttachment(attachment: SlackAttachment) {
  return attachment.type === "image" || attachment.mimeType?.toLowerCase().startsWith("image/");
}

function attachmentFilename(attachment: SlackAttachment, index: number) {
  return attachment.name?.trim() || `slack-file-${index + 1}`;
}

function attachmentContentType(attachment: SlackAttachment) {
  return attachment.mimeType?.trim() || "application/octet-stream";
}

async function attachmentData(attachment: SlackAttachment) {
  if (attachment.fetchData) {
    return attachment.fetchData();
  }

  const { data } = attachment;
  if (Buffer.isBuffer(data)) {
    return data;
  }

  if (data instanceof Blob) {
    return Buffer.from(await data.arrayBuffer());
  }

  throw new Error(`Slack attachment ${attachment.name ?? "file"} has no downloadable data`);
}

export function getSlackTranslationFileAttachments(message: Message) {
  return (message.attachments ?? []).filter((attachment, index) => {
    if (isImageAttachment(attachment)) {
      return false;
    }

    return inferSupportedFileTranslationFileFormat(attachmentFilename(attachment, index)) !== null;
  });
}

export function getUnsupportedSlackFileAttachments(message: Message) {
  return (message.attachments ?? []).filter((attachment, index) => {
    if (isImageAttachment(attachment)) {
      return false;
    }

    return inferSupportedFileTranslationFileFormat(attachmentFilename(attachment, index)) === null;
  });
}

export async function storeSlackFileAttachments(input: StoreSlackFileAttachmentsInput) {
  const storedFiles: StoredSlackFileAttachment[] = [];

  for (const [index, attachment] of input.attachments.entries()) {
    const filename = attachmentFilename(attachment, index);
    const fileFormat = inferSupportedFileTranslationFileFormat(filename);
    if (!fileFormat) {
      continue;
    }

    const file = await createStoredFile({
      organizationId: input.organizationId,
      projectId: input.projectId,
      createdByUserId: input.createdByUserId,
      role: "source",
      sourceKind: "chat_upload",
      sourceInteractionId: input.interactionId,
      filename,
      contentType: attachmentContentType(attachment),
      content: await attachmentData(attachment),
      metadata: {
        uploadSurface: "slack_agent",
        translationSource: true,
        slackAttachmentType: attachment.type,
        slackAttachmentUrl: attachment.url,
      },
    });

    storedFiles.push({
      id: file.id,
      filename: file.filename,
      contentType: file.contentType,
      fileFormat,
      url: file.downloadUrl ?? file.storageUrl,
    });
  }

  return storedFiles;
}

export function buildSlackStoredFileContext(files: StoredSlackFileAttachment[]) {
  if (files.length === 0) {
    return null;
  }

  return [
    "Attached translation source files are already stored and ready for file translation jobs:",
    ...files.map(
      (file) =>
        `- ${file.filename}: sourceFileId=${file.id}, fileFormat=${file.fileFormat}, contentType=${file.contentType}`,
    ),
    "Use these sourceFileId values when creating file translation jobs.",
  ].join("\n");
}

export function appendSlackStoredFileContext(text: string, files: StoredSlackFileAttachment[]) {
  const fileContext = buildSlackStoredFileContext(files);
  if (!fileContext) {
    return text;
  }

  return [text.trim() || "Please translate the attached source file.", "", fileContext].join("\n");
}

export function buildUnsupportedSlackFilesMessage(attachments: SlackAttachment[]) {
  const filenames = attachments.map(
    (attachment, index) => `- ${attachmentFilename(attachment, index)}`,
  );

  return [
    "I received the file upload, but it is not a supported text translation source yet.",
    "",
    "Supported file formats:",
    supportedFileTranslationFileFormats.map((format) => `\`${format}\``).join(", "),
    "",
    "Unsupported files:",
    ...filenames,
  ].join("\n");
}
