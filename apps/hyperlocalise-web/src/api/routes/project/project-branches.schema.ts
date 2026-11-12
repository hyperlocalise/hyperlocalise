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
import {
  isValidProjectBranchName,
  normalizeProjectBranchName,
} from "@/lib/projects/branches/project-branch-name";
import type { ProjectBranchRecord } from "@/lib/projects/branches/project-branch-service";

function decodePathSegment(value: unknown) {
  if (typeof value !== "string") {
    return value;
  }
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

const projectBranchNameSchema = z
  .string()
  .trim()
  .min(1)
  .max(128)
  .transform(normalizeProjectBranchName)
  .refine(isValidProjectBranchName, { message: "Invalid branch name" });

export const projectBranchParamsSchema = z.object({
  projectId: projectIdSchema,
});

export const projectBranchNameParamsSchema = projectBranchParamsSchema.extend({
  branchName: z.preprocess(decodePathSegment, projectBranchNameSchema),
});

export const createProjectBranchBodySchema = z.object({
  name: projectBranchNameSchema,
  title: z.string().trim().max(256).nullable().optional(),
  baseBranchName: projectBranchNameSchema.optional(),
  clone: z.boolean().optional(),
});

export const updateProjectBranchBodySchema = z
  .object({
    title: z.string().trim().max(256).nullable().optional(),
    isProtected: z.boolean().optional(),
  })
  .refine((value) => value.title !== undefined || value.isProtected !== undefined, {
    message: "Update at least one field",
  });

export const projectBranchConflictStrategySchema = z.enum(["use_branch", "use_base"]);

export const mergeProjectBranchQuerySchema = z.object({
  targetName: projectBranchNameSchema.optional(),
});

export const mergeProjectBranchBodySchema = z.object({
  targetName: projectBranchNameSchema.optional(),
  strategy: projectBranchConflictStrategySchema,
  deleteAfter: z.boolean().optional(),
});

export const syncProjectBranchBodySchema = z.object({
  strategy: projectBranchConflictStrategySchema,
});

export const projectBranchRecordSchema = z.object({
  id: z.string().uuid(),
  projectId: z.string(),
  name: z.string(),
  title: z.string().nullable(),
  baseBranchId: z.string().uuid().nullable(),
  isDefault: z.boolean(),
  isProtected: z.boolean(),
  status: z.enum(["active", "merged"]),
  lastSyncedAt: z.string().nullable(),
  createdByUserId: z.string().uuid().nullable(),
  mergedAt: z.string().nullable(),
  mergedIntoBranchId: z.string().uuid().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
  fileCount: z.number().int(),
  keyCount: z.number().int(),
});

export const projectBranchesResponseSchema = z.object({
  branches: z.array(projectBranchRecordSchema),
});

export const projectBranchResponseSchema = z.object({
  branch: projectBranchRecordSchema,
});

export const projectBranchMergePreviewResponseSchema = z.object({
  changes: z.array(
    z.object({
      kind: z.enum(["added", "changed", "conflicted"]),
      sourcePath: z.string().nullable(),
      key: z.string(),
      sourceText: z.string(),
      targetSourceText: z.string().nullable(),
      translations: z.array(
        z.object({
          locale: z.string(),
          text: z.string(),
          status: z.string(),
        }),
      ),
    }),
  ),
});

export type ProjectBranchApiRecord = ProjectBranchRecord;
