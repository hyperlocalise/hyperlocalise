import { z } from "zod";

import { projectIdParamsSchema } from "./project.schema";

export const issueSheetIssueStatusSchema = z.enum(["open", "in_progress", "resolved", "wont_fix"]);
export const issueSheetIssueTypeSchema = z.enum([
  "general_question",
  "translation_mistake",
  "context_request",
  "source_mistake",
  "glossary_violation",
  "qa_failure",
]);
export const issueSheetLinkKindSchema = z.enum([
  "cat_segment",
  "native_issue",
  "provider_issue",
  "agent_run",
  "url",
  "manual",
]);

export const issueSheetColumnTypeSchema = z.enum([
  "text",
  "long_text",
  "select",
  "user",
  "enrichment",
]);
export const issueSheetColumnLayerSchema = z.enum(["system", "generated", "custom", "enrichment"]);

export const issueSheetParamsSchema = projectIdParamsSchema;
export const issueSheetIssueParamsSchema = projectIdParamsSchema.extend({
  issueId: z.string().uuid(),
});
export const issueSheetColumnParamsSchema = projectIdParamsSchema.extend({
  columnId: z.string().uuid(),
});

export const issueSheetQuerySchema = z.object({
  view: z.enum(["my_work", "qa_triage", "source_context", "all_open"]).optional(),
  status: issueSheetIssueStatusSchema.or(z.literal("all")).optional(),
  issueType: issueSheetIssueTypeSchema.or(z.literal("all")).optional(),
  locale: z.string().trim().min(1).max(32).optional(),
  assignee: z.string().uuid().or(z.literal("me")).or(z.literal("unassigned")).optional(),
  search: z.string().trim().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

const nullableUuidSchema = z.string().uuid().nullable();
const nullableStringSchema = z.string().trim().min(1).max(2048).nullable();

export const issueSheetCreateIssueBodySchema = z.object({
  title: z.string().trim().min(1).max(300),
  description: z.string().max(20_000).optional(),
  issueType: issueSheetIssueTypeSchema.optional(),
  status: issueSheetIssueStatusSchema.optional(),
  targetLocale: z.string().trim().min(1).max(32).optional(),
  sourcePath: z.string().trim().min(1).max(2048).optional(),
  segmentId: z.string().trim().min(1).max(512).optional(),
  translationKeyId: z.string().uuid().optional(),
  linkedCommentId: z.string().uuid().optional(),
  linkedAgentRunId: z.string().uuid().optional(),
  linkKind: issueSheetLinkKindSchema.optional(),
  linkLabel: z.string().trim().min(1).max(200).optional(),
  linkUrl: z.string().trim().min(1).max(2048).optional(),
  externalRef: z.string().trim().min(1).max(512).optional(),
  assigneeUserId: z.string().uuid().optional(),
  priority: z.enum(["P0", "P1", "P2"]).optional(),
});

export const issueSheetUpdateIssueBodySchema = z
  .object({
    title: z.string().trim().min(1).max(300).optional(),
    description: z.string().max(20_000).optional(),
    issueType: issueSheetIssueTypeSchema.optional(),
    status: issueSheetIssueStatusSchema.optional(),
    targetLocale: nullableStringSchema.optional(),
    sourcePath: nullableStringSchema.optional(),
    segmentId: nullableStringSchema.optional(),
    linkKind: issueSheetLinkKindSchema.nullable().optional(),
    linkLabel: nullableStringSchema.optional(),
    linkUrl: nullableStringSchema.optional(),
    assigneeUserId: nullableUuidSchema.optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "at least one field must be provided",
  });

export const issueSheetCreateColumnBodySchema = z.object({
  key: z
    .string()
    .trim()
    .min(1)
    .max(64)
    .regex(/^[a-z][a-z0-9_]*$/, "Use lowercase letters, numbers, and underscores"),
  label: z.string().trim().min(1).max(120),
  type: issueSheetColumnTypeSchema.exclude(["enrichment"]),
  config: z
    .object({
      options: z
        .array(
          z.object({
            id: z.string().trim().min(1).max(64),
            label: z.string().trim().min(1).max(120),
            color: z.string().trim().min(1).max(64).optional(),
          }),
        )
        .max(25)
        .optional(),
    })
    .optional(),
});

export const issueSheetSetValueBodySchema = z.object({
  columnKey: z.string().trim().min(1).max(64),
  value: z.unknown(),
});

export const issueSheetSystemFieldSchema = z.enum([
  "title",
  "description",
  "status",
  "issue_type",
  "target_locale",
  "source_path",
  "segment_id",
  "external_ref",
  "link_url",
  "assignee",
]);

export const issueSheetImportColumnMappingSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("system"),
    field: issueSheetSystemFieldSchema,
  }),
  z.object({
    kind: z.literal("column"),
    columnId: z.string().uuid(),
  }),
  z.object({
    kind: z.literal("create"),
    key: z
      .string()
      .trim()
      .min(1)
      .max(64)
      .regex(/^[a-z][a-z0-9_]*$/, "Use lowercase letters, numbers, and underscores"),
    label: z.string().trim().min(1).max(120),
    type: issueSheetColumnTypeSchema.exclude(["enrichment", "user"]),
  }),
  z.object({
    kind: z.literal("skip"),
  }),
]);

export const issueSheetImportBodySchema = z.object({
  content: z.string().min(1).max(2_097_152),
  dryRun: z.boolean(),
  mapping: z
    .array(
      z.object({
        csvHeader: z.string().trim().min(1).max(256),
        target: issueSheetImportColumnMappingSchema,
      }),
    )
    .min(1)
    .max(200),
  options: z
    .object({
      skipInvalidRows: z.boolean().optional(),
    })
    .optional(),
});

export type IssueSheetQuery = z.infer<typeof issueSheetQuerySchema>;
export type IssueSheetCreateIssueBody = z.infer<typeof issueSheetCreateIssueBodySchema>;
export type IssueSheetUpdateIssueBody = z.infer<typeof issueSheetUpdateIssueBodySchema>;
export type IssueSheetCreateColumnBody = z.infer<typeof issueSheetCreateColumnBodySchema>;
export type IssueSheetSetValueBody = z.infer<typeof issueSheetSetValueBodySchema>;
export type IssueSheetImportBody = z.infer<typeof issueSheetImportBodySchema>;
