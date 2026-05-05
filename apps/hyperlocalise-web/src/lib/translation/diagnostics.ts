import {
  type AttachmentContent,
  inferAttachmentContentType,
  toAttachmentBuffer,
} from "@/lib/resend/attachments";

export type TranslatedFileDiagnostics = {
  filename: string;
  byteLength: number;
  sha256: string;
  firstBytesHex: string;
  contentType: string;
  isUtf8: boolean;
  jsonParseOk: boolean | null;
  jsonParseError: string | null;
};

async function sha256Hex(content: Buffer): Promise<string> {
  const hashBuffer = await crypto.subtle.digest(
    "SHA-256",
    content.buffer.slice(
      content.byteOffset,
      content.byteOffset + content.byteLength,
    ) as ArrayBuffer,
  );
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

function checkIsUtf8(buffer: Buffer): boolean {
  try {
    new TextDecoder("utf-8", { fatal: true }).decode(buffer);
    return true;
  } catch {
    return false;
  }
}

export async function getTranslatedFileDiagnostics(
  content: AttachmentContent,
  filename: string,
): Promise<TranslatedFileDiagnostics> {
  const fileContent = toAttachmentBuffer(content);
  const dotIndex = filename.lastIndexOf(".");
  const ext = dotIndex === -1 ? "" : filename.slice(dotIndex).toLowerCase();
  const isJsonLike = ext === ".json" || ext === ".jsonc";
  let jsonParseOk: boolean | null = null;
  let jsonParseError: string | null = null;

  if (isJsonLike) {
    try {
      JSON.parse(fileContent.toString("utf8"));
      jsonParseOk = true;
    } catch (error) {
      jsonParseOk = false;
      jsonParseError = error instanceof Error ? error.message : String(error);
    }
  }

  return {
    filename,
    byteLength: fileContent.byteLength,
    sha256: await sha256Hex(fileContent),
    firstBytesHex: fileContent.subarray(0, 16).toString("hex"),
    contentType: inferAttachmentContentType(filename),
    isUtf8: checkIsUtf8(fileContent),
    jsonParseOk,
    jsonParseError,
  };
}

export async function logTranslatedFileDiagnostics(
  requestId: string,
  attachmentId: string,
  sourceFilename: string,
  targetLocale: string,
  translatedContent: Buffer,
  outputFilename: string,
): Promise<void> {
  const diagnostics = await getTranslatedFileDiagnostics(translatedContent, outputFilename);

  console.info(`[sandbox-translation] translated file diagnostics`, {
    requestId,
    attachmentId,
    sourceFilename,
    targetLocale,
    diagnostics,
  });
}
