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
import { getStoredFileContent } from "@/lib/file-storage/records";
import { createGoSvcServerClient } from "@/lib/go-svc/go-svc-server-client";
import type { HlEntriesPayload } from "@/lib/projects/files/hl-entries";
import { err, fromThrowableAsync, isErr, ok, type Result } from "@/lib/primitives/result/results";
import { inferSupportedPdfTranslationFileFormat } from "@/lib/translation/file-formats";

export type ProjectPdfEntriesError =
  | { code: "unsupported_pdf_format" }
  | { code: "source_content_not_found" }
  | { code: "pdf_encrypted" }
  | { code: "pdf_no_text_layer" }
  | { code: "pdf_parse_failed" };

export async function loadProjectPdfSourceEntries(input: {
  organizationId: string;
  projectId: string;
  storedFileId: string;
  sourcePath: string;
}): Promise<Result<HlEntriesPayload, ProjectPdfEntriesError>> {
  if (!inferSupportedPdfTranslationFileFormat(input.sourcePath)) {
    return err({ code: "unsupported_pdf_format" });
  }

  const stored = await fromThrowableAsync(
    getStoredFileContent({
      organizationId: input.organizationId,
      projectId: input.projectId,
      fileId: input.storedFileId,
    }),
  );
  if (isErr(stored)) {
    return err({ code: "source_content_not_found" });
  }

  const client = createGoSvcServerClient();
  const template =
    stored.value.content instanceof Buffer
      ? stored.value.content
      : Buffer.from(stored.value.content);
  const extracted = await fromThrowableAsync(client.pdf.extractEntries({ template }));
  if (isErr(extracted)) {
    const error = extracted.error as { code?: string };
    switch (error.code) {
      case "pdf_encrypted":
        return err({ code: "pdf_encrypted" });
      case "pdf_no_text_layer":
        return err({ code: "pdf_no_text_layer" });
      default:
        return err({ code: "pdf_parse_failed" });
    }
  }

  return ok(extracted.value as HlEntriesPayload);
}
