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
import { loadProjectFileVariant } from "@/lib/projects/files/file-variant-download";
import { getImageVariant } from "@/lib/projects/files/image-variant-service";
import { inferSupportedTranslationFileFormat } from "@/lib/translation/file-formats";

/** TXT sources push from stored file variants, not from segments. */
export function isTxtPushSource(
  sourcePath: string,
  ingestFormat: string | null | undefined,
): boolean {
  return inferSupportedTranslationFileFormat(sourcePath) === "txt" || ingestFormat === "txt";
}

/**
 * Whether a TXT locale can actually be pushed. Mirrors the writer in
 * `loadTranslatedBytes`: the per-locale file variant must exist and be approved.
 * Segment approvals alone are not enough.
 */
export async function isTxtPushReady(input: {
  organizationId: string;
  projectId: string;
  sourcePath: string;
  targetLocale: string;
}): Promise<boolean> {
  const variant = await getImageVariant({
    organizationId: input.organizationId,
    projectId: input.projectId,
    sourcePath: input.sourcePath,
    targetLocale: input.targetLocale,
  });
  if (variant?.status !== "approved") {
    return false;
  }
  const fileVariant = await loadProjectFileVariant({
    organizationId: input.organizationId,
    projectId: input.projectId,
    sourcePath: input.sourcePath,
    locale: input.targetLocale,
  });
  return fileVariant !== null;
}
