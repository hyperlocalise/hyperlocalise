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

import { issueIdSchema } from "@/lib/projects/issue-identifier/project-issue-identifier";
import { ISSUE_SHEET_COLUMN_ICON_IDS } from "@/lib/projects/issue-sheet/issue-sheet-column-icons";
import { issueSheetImportContentExceedsByteLimit } from "@/lib/projects/issue-sheet/issue-sheet-csv-import";

import {
  issueRelationshipKindSchema,
  issueRelationshipPresentedKindSchema,
} from "./issue-relationships.schema";
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
export type IssueSheetIssueType = z.infer<typeof issueSheetIssueTypeSchema>;

// Issue template keys, deliberately distinct strings from IssueSheetIssueType values so the two
// literal unions are disjoint and a mix-up is a type error. Provenance only: `template_key` on an
// issue records which template created it, independent of the issue's own (mutable) issueType.
// Definitions (label, linked type, default priority, description skeleton) are static code in
// lib/projects/issue-sheet/issue-sheet-templates.ts, not stored here or in the database.
export const issueSheetTemplateKeySchema = z.enum([
  "tpl_translation_mistake",
  "tpl_source_mistake",
  "tpl_context_request",
  "tpl_glossary_violation",
  "tpl_qa_failure",
]);
export type IssueSheetTemplateKey = z.infer<typeof issueSheetTemplateKeySchema>;
export const issueSheetLinkKindSchema = z.enum([
  "content_editor_segment",
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
export const issueSheetColumnIconIdSchema = z.enum(ISSUE_SHEET_COLUMN_ICON_IDS);

export const issueSheetParamsSchema = projectIdParamsSchema;
export const issueSheetIssueParamsSchema = projectIdParamsSchema.extend({
  issueId: issueIdSchema,
});
export const issueSheetColumnParamsSchema = projectIdParamsSchema.extend({
  columnId: z.string().uuid(),
});

export const issueSheetSortSchema = z.enum(["updated_at", "created_at", "priority", "status"]);
export const issueSheetSortDirSchema = z.enum(["asc", "desc"]);
export const issueSheetPrioritySchema = z.enum(["P0", "P1", "P2"]);
export type IssueSheetPriority = z.infer<typeof issueSheetPrioritySchema>;

export const issueSheetQuerySchema = z.object({
  view: z.enum(["my_work", "qa_triage", "source_context", "all_open"]).optional(),
  status: issueSheetIssueStatusSchema.or(z.literal("all")).optional(),
  issueType: issueSheetIssueTypeSchema.or(z.literal("all")).optional(),
  priority: issueSheetPrioritySchema.optional(),
  locale: z.string().trim().min(1).max(32).optional(),
  assignee: z.string().uuid().or(z.literal("me")).or(z.literal("unassigned")).optional(),
  translationKeyId: z.string().uuid().optional(),
  search: z.string().trim().max(200).optional(),
  sort: issueSheetSortSchema.default("status"),
  sortDir: issueSheetSortDirSchema.optional(),
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
  // Provenance only: which static template (if any) the client applied to prefill this issue.
  // The client is responsible for having already copied the template's type/priority/description
  // into the fields above; the server does not resolve or apply template content itself.
  templateKey: issueSheetTemplateKeySchema.optional(),
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
  values: z.record(z.string(), z.unknown()).optional(),
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
    translationKeyId: nullableUuidSchema.optional(),
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
  icon: issueSheetColumnIconIdSchema.nullable().optional(),
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

const issueSheetColumnSelectOptionSchema = z.object({
  id: z.string().trim().min(1).max(64),
  label: z.string().trim().min(1).max(120),
  color: z.string().trim().min(1).max(64).optional(),
});

export const issueSheetUpdateColumnBodySchema = z
  .object({
    label: z.string().trim().min(1).max(120).optional(),
    hidden: z.boolean().optional(),
    sortOrder: z.number().int().min(0).max(100_000).optional(),
    icon: issueSheetColumnIconIdSchema.nullable().optional(),
    config: z
      .object({
        options: z.array(issueSheetColumnSelectOptionSchema).max(25).optional(),
      })
      .optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "at least one field must be provided",
  });

export const issueSheetReorderColumnsBodySchema = z.object({
  columnIds: z.array(z.string().uuid()).min(1).max(200),
});

export const issueSheetSetValueBodySchema = z.object({
  columnKey: z.string().trim().min(1).max(64),
  value: z.unknown(),
});

// Full-object replace: PUT /template-config always overwrites both fields, so a client that only
// intends to change the default must still resend its current assigneeByTemplate, or those
// bindings are cleared. Keys of assigneeByTemplate are validated against issueSheetTemplateKeySchema
// via superRefine rather than z.record(issueSheetTemplateKeySchema, ...), since a record keyed by
// a zod enum is exhaustive (requires every key present) rather than partial.
export const issueSheetTemplateConfigBodySchema = z.object({
  defaultTemplateKey: issueSheetTemplateKeySchema.nullable(),
  assigneeByTemplate: z.record(z.string(), z.string().uuid()).superRefine((value, ctx) => {
    for (const key of Object.keys(value)) {
      if (!issueSheetTemplateKeySchema.safeParse(key).success) {
        ctx.addIssue({ code: "custom", path: [key], message: "Unknown template key" });
      }
    }
  }),
});
export type IssueSheetTemplateConfigBody = z.infer<typeof issueSheetTemplateConfigBodySchema>;

export type IssueSheetTemplateConfig = {
  defaultTemplateKey: string | null;
  assigneeByTemplate: { templateKey: string; userId: string; assignable: boolean }[];
};

export const issueSheetFeedQuerySchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(100).default(100),
    cursor: z.string().trim().min(1).max(512).optional(),
  })
  .superRefine((query, ctx) => {
    if (!query.cursor) {
      return;
    }

    const parts = query.cursor.split("|");
    if (parts.length !== 3) {
      ctx.addIssue({
        code: "custom",
        path: ["cursor"],
        message: "feed cursor must be isoTimestamp|sortRank|uuid",
      });
      return;
    }

    const [createdAt, sortRank, id] = parts;
    if (!createdAt || Number.isNaN(Date.parse(createdAt))) {
      ctx.addIssue({
        code: "custom",
        path: ["cursor"],
        message: "feed cursor timestamp is invalid",
      });
    }
    if (sortRank !== "0" && sortRank !== "1") {
      ctx.addIssue({
        code: "custom",
        path: ["cursor"],
        message: "feed cursor sortRank must be 0 or 1",
      });
    }
    if (!id || !z.uuid().safeParse(id).success) {
      ctx.addIssue({
        code: "custom",
        path: ["cursor"],
        message: "feed cursor id is invalid",
      });
    }
  });

export const issueSheetAssignableMemberSchema = z.object({
  userId: z.string().uuid(),
  email: z.string(),
  firstName: z.string().nullable(),
  lastName: z.string().nullable(),
  displayName: z.string(),
  avatarUrl: z.string().nullable(),
  isCurrentUser: z.boolean(),
});

export const issueSheetActivityUserSchema = z.object({
  userId: z.string().uuid(),
  displayName: z.string(),
  email: z.string().nullable(),
  avatarUrl: z.string().nullable(),
});

const issueSheetActivityBaseSchema = {
  id: z.string().uuid(),
  actor: issueSheetActivityUserSchema.nullable(),
  createdAt: z.string(),
};

export const issueSheetActivitySchema = z.discriminatedUnion("type", [
  z.object({
    ...issueSheetActivityBaseSchema,
    type: z.literal("assignee_changed"),
    previousAssignee: issueSheetActivityUserSchema.nullable(),
    nextAssignee: issueSheetActivityUserSchema.nullable(),
  }),
  z.object({
    ...issueSheetActivityBaseSchema,
    type: z.literal("issue_created"),
  }),
  z.object({
    ...issueSheetActivityBaseSchema,
    type: z.literal("status_changed"),
    previousStatus: z.string(),
    nextStatus: z.string(),
  }),
  z.object({
    ...issueSheetActivityBaseSchema,
    type: z.literal("relationship_added"),
    relationshipKind: issueRelationshipKindSchema,
    relatedIssue: z.object({ issueId: z.string().uuid(), title: z.string().nullable() }),
  }),
  z.object({
    ...issueSheetActivityBaseSchema,
    type: z.literal("relationship_removed"),
    // Removal can be actioned from either side of the relationship, so the
    // presented kind can also be "duplicate" (see presentRelationshipKind).
    relationshipKind: issueRelationshipPresentedKindSchema,
    relatedIssue: z.object({ issueId: z.string().uuid(), title: z.string().nullable() }),
  }),
]);

export type IssueSheetFeedQuery = z.infer<typeof issueSheetFeedQuerySchema>;

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
  content: z
    .string()
    .min(1)
    .superRefine((value, ctx) => {
      if (issueSheetImportContentExceedsByteLimit(value)) {
        ctx.addIssue({
          code: "custom",
          message: "CSV file is too large",
        });
      }
    }),
  dryRun: z.boolean(),
  mapping: z
    .array(
      z.object({
        csvHeader: z.string().trim().min(1).max(256),
        target: issueSheetImportColumnMappingSchema,
      }),
    )
    .min(1)
    .max(200)
    .superRefine((mapping, ctx) => {
      const seenSystemFields = new Set<string>();
      for (const [index, entry] of mapping.entries()) {
        if (entry.target.kind !== "system") {
          continue;
        }
        if (seenSystemFields.has(entry.target.field)) {
          ctx.addIssue({
            code: "custom",
            message: `System field "${entry.target.field}" is mapped more than once`,
            path: [index, "target", "field"],
          });
          continue;
        }
        seenSystemFields.add(entry.target.field);
      }
    }),
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
export type IssueSheetUpdateColumnBody = z.infer<typeof issueSheetUpdateColumnBodySchema>;
export type IssueSheetReorderColumnsBody = z.infer<typeof issueSheetReorderColumnsBodySchema>;
export type IssueSheetSetValueBody = z.infer<typeof issueSheetSetValueBodySchema>;
export type IssueSheetImportBody = z.infer<typeof issueSheetImportBodySchema>;
