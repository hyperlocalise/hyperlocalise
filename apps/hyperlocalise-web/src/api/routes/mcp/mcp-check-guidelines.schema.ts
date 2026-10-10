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

import { projectIdSchema } from "@/lib/projects/identity/project-id";

/** Mirrors the limits enforced by go-svc `internal/guidelines/check`. */
const MAX_SEGMENTS = 50;
const MAX_SEGMENT_ID_LENGTH = 128;
const MAX_TOTAL_CHARACTERS = 16_000;
const MAX_LOCALE_LENGTH = 35;

const localeSchema = z.string().trim().min(1).max(MAX_LOCALE_LENGTH);

export const mcpCheckGuidelinesInputSchema = z
  .object({
    projectId: projectIdSchema
      .optional()
      .describe("Accessible project whose guidelines apply in addition to workspace guidelines."),
    sourceLocale: localeSchema.optional().describe("Source locale, for example en-US."),
    targetLocale: localeSchema
      .optional()
      .describe("Target locale, for example fr-FR. Selects locale-specific guidelines."),
    segments: z
      .array(
        z
          .object({
            id: z
              .string()
              .trim()
              .min(1)
              .max(MAX_SEGMENT_ID_LENGTH)
              .describe("Caller-chosen segment ID."),
            source: z.string().optional().describe("Source text."),
            target: z.string().optional().describe("Translated text."),
          })
          .refine((segment) => Boolean(segment.source?.trim() || segment.target?.trim()), {
            message: "Each segment needs source or target text",
          }),
      )
      .min(1)
      .max(MAX_SEGMENTS)
      .describe("Segments to check."),
    checks: z
      .array(z.enum(["source", "target"]))
      .min(1)
      .optional()
      .describe("Fields to check. Defaults to every field present."),
  })
  .superRefine((input, ctx) => {
    const total = input.segments.reduce(
      (sum, segment) => sum + (segment.source?.length ?? 0) + (segment.target?.length ?? 0),
      0,
    );
    if (total > MAX_TOTAL_CHARACTERS) {
      ctx.addIssue({
        code: "custom",
        path: ["segments"],
        message: `Segments may contain at most ${MAX_TOTAL_CHARACTERS} characters in total`,
      });
    }
    const ids = new Set<string>();
    for (const [index, segment] of input.segments.entries()) {
      if (ids.has(segment.id)) {
        ctx.addIssue({
          code: "custom",
          path: ["segments", index, "id"],
          message: "Duplicate segment id",
        });
      }
      ids.add(segment.id);
    }
  });

export type McpCheckGuidelinesInput = z.infer<typeof mcpCheckGuidelinesInputSchema>;
