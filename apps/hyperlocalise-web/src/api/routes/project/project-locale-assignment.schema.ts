import { z } from "zod";

import { projectIdSchema } from "@/lib/projects/identity/project-id";
import * as schema from "@/lib/database/schema";

export const projectLocaleAssignmentParamsSchema = z.object({
  projectId: projectIdSchema,
});

export const projectLocaleAssignmentItemSchema = z.object({
  locale: z.string().trim().min(1).max(32),
  role: z.enum(schema.jobAssigneeRoleEnum.enumValues),
  assigneeWorkosUserId: z.string().trim().min(1).max(256),
});

export const replaceProjectLocaleAssignmentsBodySchema = z.object({
  assignments: z.array(projectLocaleAssignmentItemSchema).max(200),
});

export const projectLocaleAssignmentRecordSchema = z.object({
  locale: z.string(),
  role: z.enum(schema.jobAssigneeRoleEnum.enumValues),
  userId: z.string(),
  workosUserId: z.string(),
  email: z.string(),
  displayName: z.string(),
});

export const projectLocaleAssignmentsResponseSchema = z.object({
  localeAssignments: z.array(projectLocaleAssignmentRecordSchema),
});

export type ReplaceProjectLocaleAssignmentsBody = z.infer<
  typeof replaceProjectLocaleAssignmentsBodySchema
>;
