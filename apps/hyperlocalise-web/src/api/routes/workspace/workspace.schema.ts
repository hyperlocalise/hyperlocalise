import { z } from "zod";

export const updateWorkspaceBodySchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    slug: z
      .string()
      .trim()
      .toLowerCase()
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, {
        message: "Use lowercase letters, numbers, and single hyphens between words",
      })
      .min(2)
      .max(80)
      .optional(),
  })
  .refine((value) => value.name !== undefined || value.slug !== undefined, {
    message: "Provide a name or slug",
  });

export type UpdateWorkspaceBody = z.infer<typeof updateWorkspaceBodySchema>;
