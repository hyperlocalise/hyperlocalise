import { z } from "zod";

import * as schema from "@/lib/database/schema";

export const updateJobAssignmentBodySchema = z
  .object({
    assigneeWorkosUserId: z.string().trim().min(1).max(256).nullable(),
    assigneeRole: z.enum(schema.jobAssigneeRoleEnum.enumValues).nullable(),
  })
  .superRefine((value, ctx) => {
    const hasAssignee = Boolean(value.assigneeWorkosUserId);
    const hasRole = Boolean(value.assigneeRole);

    if (hasAssignee !== hasRole) {
      ctx.addIssue({
        code: "custom",
        message: "assigneeWorkosUserId and assigneeRole must both be set or both be cleared",
        path: ["assigneeRole"],
      });
    }
  });

export type UpdateJobAssignmentBody = z.infer<typeof updateJobAssignmentBodySchema>;
