import { z } from "zod";

import {
  issueSheetIssueStatusSchema,
  issueSheetIssueTypeSchema,
} from "@/api/routes/project/issue-sheet.schema";

export const organizationIssuesQuerySchema = z.object({
  view: z.enum(["my_work", "qa_triage", "source_context", "all_open"]).optional(),
  status: issueSheetIssueStatusSchema.or(z.literal("all")).optional(),
  issueType: issueSheetIssueTypeSchema.or(z.literal("all")).optional(),
  locale: z.string().trim().min(1).max(32).optional(),
  assignee: z.string().uuid().or(z.literal("me")).or(z.literal("unassigned")).optional(),
  search: z.string().trim().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

export type OrganizationIssuesQuery = z.infer<typeof organizationIssuesQuerySchema>;
