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
import { z } from "zod";

import {
  maxTranslationMetadataEntries,
  maxTranslationTargetLocales,
} from "@/api/routes/project/job.schema";
import { projectIdSchema } from "@/lib/projects/identity/project-id";
import { supportedFileTranslationFileFormats } from "@/lib/translation/file-formats";

const metadataSchema = z
  .record(z.string().max(100), z.string().max(1000))
  .refine((metadata) => Object.keys(metadata).length <= maxTranslationMetadataEntries, {
    message: `metadata must contain at most ${maxTranslationMetadataEntries} entries`,
  })
  .optional();

export const mcpRunWorkflowInputSchema = z
  .object({
    type: z.enum(["string", "file"]).describe("Translation job type."),

    projectId: projectIdSchema.describe("ID of the accessible Hyperlocalise project."),

    sourceText: z
      .string()
      .trim()
      .min(1)
      .max(100_000)
      .optional()
      .describe("Source text for a string translation job."),

    sourceFileId: z
      .string()
      .trim()
      .min(1)
      .max(128)
      .optional()
      .describe("Source file ID for a file translation job."),

    sourcePath: z
      .string()
      .trim()
      .min(1)
      .max(2048)
      .optional()
      .describe("Repository-relative source path for a file translation job."),

    fileFormat: z
      .enum(supportedFileTranslationFileFormats)
      .optional()
      .describe("Translation file format for a file job."),

    sourceLocale: z
      .string()
      .trim()
      .min(1)
      .max(32)
      .describe("BCP-47 source locale configured for the project."),

    targetLocales: z
      .array(z.string().trim().min(1).max(32))
      .min(1)
      .max(maxTranslationTargetLocales)
      .describe("Target locales configured for the project."),

    context: z
      .string()
      .max(20_000)
      .optional()
      .describe("Optional context for a string translation job."),

    maxLength: z
      .number()
      .int()
      .positive()
      .max(100_000)
      .optional()
      .describe("Optional maximum output length for a string translation job."),

    metadata: metadataSchema.describe("Optional job metadata."),

    idempotencyKey: z
      .string()
      .trim()
      .min(1)
      .max(128)
      .optional()
      .describe("Stable retry key used to prevent duplicate jobs."),
  })
  .superRefine((input, ctx) => {
    if (input.type === "string") {
      if (!input.sourceText) {
        ctx.addIssue({
          code: "custom",
          path: ["sourceText"],
          message: "sourceText is required for string jobs",
        });
      }

      if (input.sourceFileId || input.sourcePath || input.fileFormat) {
        ctx.addIssue({
          code: "custom",
          path: ["type"],
          message: "File inputs are not allowed for string jobs",
        });
      }

      return;
    }

    if (!input.fileFormat) {
      ctx.addIssue({
        code: "custom",
        path: ["fileFormat"],
        message: "fileFormat is required for file jobs",
      });
    }

    const fileLocatorCount =
      Number(Boolean(input.sourceFileId)) + Number(Boolean(input.sourcePath));

    if (fileLocatorCount !== 1) {
      ctx.addIssue({
        code: "custom",
        path: ["sourceFileId"],
        message: "Provide exactly one of sourceFileId or sourcePath",
      });
    }

    if (input.sourceText || input.context || input.maxLength !== undefined) {
      ctx.addIssue({
        code: "custom",
        path: ["type"],
        message: "String inputs are not allowed for file jobs",
      });
    }
  });

export type McpRunWorkflowInput = z.infer<typeof mcpRunWorkflowInputSchema>;
