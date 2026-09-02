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
import { generateText } from "ai";
import { and, eq } from "drizzle-orm";

import { db, schema } from "@/lib/database/client";
import { getStoredFileContent } from "@/lib/file-storage/records";
import { getManagedLanguageModel } from "@/lib/providers/language-model";
import { err, ok, type Result } from "@/lib/primitives/result/results";

import {
  getImageVariant,
  replaceImageVariantBytes,
  type ImageVariantError,
  type ProjectImageVariantProvenance,
} from "./image-variant-service";

async function loadSourceDocumentBytes(input: {
  organizationId: string;
  storedFileId: string;
}): Promise<Result<{ content: Buffer; contentType: string; filename: string }, ImageVariantError>> {
  const [file] = await db
    .select({
      id: schema.storedFiles.id,
      contentType: schema.storedFiles.contentType,
      filename: schema.storedFiles.filename,
    })
    .from(schema.storedFiles)
    .where(
      and(
        eq(schema.storedFiles.id, input.storedFileId),
        eq(schema.storedFiles.organizationId, input.organizationId),
      ),
    )
    .limit(1);

  if (!file) {
    return err({ code: "source_file_not_found" });
  }

  try {
    const stored = await getStoredFileContent({
      organizationId: input.organizationId,
      fileId: file.id,
    });
    return ok({
      content: stored.content,
      contentType: file.contentType || "text/markdown",
      filename: file.filename,
    });
  } catch (error) {
    return err({
      code: "localization_failed",
      message: error instanceof Error ? error.message : "Failed to load source document",
    });
  }
}

function buildDocumentLocalizationPrompt(input: {
  sourceLocale?: string | null;
  targetLocale: string;
  instructions?: string | null;
  sourceText: string;
}) {
  const lines = [
    "You are an expert software localization assistant.",
    `Translate the following document from ${input.sourceLocale ?? "the source locale"} to ${input.targetLocale}.`,
    "Preserve YAML frontmatter field keys, markdown structure, MDX/JSX tags, HTML tags, code spans, and placeholders.",
    "Only translate human-readable text.",
    "Return only the translated document with no explanations or code fences.",
  ];

  const trimmedInstructions = input.instructions?.trim();
  if (trimmedInstructions) {
    lines.push(`Additional instructions: ${trimmedInstructions}`);
  }

  lines.push("", input.sourceText);
  return lines.join("\n");
}

export async function localizeAndStoreDocumentVariant(input: {
  organizationId: string;
  projectId: string;
  sourcePath: string;
  targetLocale: string;
  sourceLocale?: string | null;
  sourceStoredFileId: string;
  repositorySourceFileId: string;
  instructions?: string | null;
  provenance: ProjectImageVariantProvenance;
  createdByUserId?: string | null;
  force?: boolean;
}): Promise<Result<typeof schema.projectImageVariants.$inferSelect, ImageVariantError>> {
  const existing = await getImageVariant({
    organizationId: input.organizationId,
    projectId: input.projectId,
    sourcePath: input.sourcePath,
    targetLocale: input.targetLocale,
  });

  if (existing?.status === "approved" && !input.force) {
    return err({ code: "approved_locked" });
  }

  const sourceBytes = await loadSourceDocumentBytes({
    organizationId: input.organizationId,
    storedFileId: input.sourceStoredFileId,
  });
  if (!sourceBytes.ok) {
    return sourceBytes;
  }

  const sourceText = sourceBytes.value.content.toString("utf8");
  if (!sourceText.trim()) {
    return err({ code: "source_bytes_missing" });
  }

  const model = getManagedLanguageModel();

  let translatedText: string;
  try {
    const result = await generateText({
      model,
      prompt: buildDocumentLocalizationPrompt({
        sourceLocale: input.sourceLocale,
        targetLocale: input.targetLocale,
        instructions: input.instructions,
        sourceText,
      }),
    });

    if (result.finishReason !== "stop") {
      return err({
        code: "localization_failed",
        message:
          result.finishReason === "length"
            ? "Document translation was truncated because the output exceeded the model limit"
            : "Document translation did not complete successfully",
      });
    }

    translatedText = result.text.trim();
  } catch (error) {
    return err({
      code: "localization_failed",
      message: error instanceof Error ? error.message : "Document translation failed",
    });
  }

  if (!translatedText) {
    return err({ code: "localization_failed", message: "Document translation was empty" });
  }

  return replaceImageVariantBytes({
    organizationId: input.organizationId,
    projectId: input.projectId,
    sourcePath: input.sourcePath,
    targetLocale: input.targetLocale,
    content: Buffer.from(translatedText, "utf8"),
    contentType: sourceBytes.value.contentType,
    filename: sourceBytes.value.filename,
    repositorySourceFileId: input.repositorySourceFileId,
    createdByUserId: input.createdByUserId,
    force: input.force,
    provenance: input.provenance,
  });
}
