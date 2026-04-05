import { z } from "zod";

export const projectIdParamsSchema = z.object({
  projectId: z.string().trim().min(1),
});

export const createProjectBodySchema = z.object({
  name: z.string().trim().min(1).max(200),
  description: z.string().max(10_000).optional().default(""),
  translationContext: z.string().max(20_000).optional().default(""),
});

export const updateProjectBodySchema = z
  .object({
    name: z.string().trim().min(1).max(200).optional(),
    description: z.string().max(10_000).optional(),
    translationContext: z.string().max(20_000).optional(),
  })
  .refine(
    (value) =>
      value.name !== undefined ||
      value.description !== undefined ||
      value.translationContext !== undefined,
    {
      message: "at least one field must be provided",
    },
  );

export type ProjectIdParams = z.infer<typeof projectIdParamsSchema>;
export type CreateProjectBody = z.infer<typeof createProjectBodySchema>;
export type UpdateProjectBody = z.infer<typeof updateProjectBodySchema>;
