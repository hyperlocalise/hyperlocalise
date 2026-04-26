export function toBase64AttachmentContent(content: Buffer): string {
  return content.toString("base64");
}
