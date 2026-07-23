/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in this application's LICENSE file.
 *
 * Change Date: Four years after publication of the applicable version.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
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
