import type { ExternalTmsSourceFileUpload } from "@/lib/providers/jobs/tms-provider-types";

export function providerSourcePath(file: ExternalTmsSourceFileUpload) {
  return file.sourcePath.trim().replaceAll("\\", "/").replace(/^\/+/, "");
}

export function providerFilename(file: ExternalTmsSourceFileUpload) {
  const sourcePath = providerSourcePath(file);
  return file.filename.trim() || sourcePath.split("/").filter(Boolean).at(-1) || "source";
}

export function providerFileFormat(file: ExternalTmsSourceFileUpload) {
  const explicit = file.format?.trim().replace(/^\./, "").toLowerCase();
  if (explicit) {
    return explicit;
  }

  const filename = providerFilename(file);
  const match = /\.([a-z0-9][a-z0-9_-]*)$/i.exec(filename);
  return match?.[1]?.toLowerCase() ?? null;
}

export function providerFileBase64(file: ExternalTmsSourceFileUpload) {
  return Buffer.from(file.content).toString("base64");
}
