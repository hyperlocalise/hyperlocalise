import { z } from "zod";

export const projectIdParamsSchema = z.object({
  projectId: z.string().trim().min(1),
});

export const createProjectBodySchema = z.object({
  name: z.string().trim().min(1).max(200),
  description: z.string().max(10_000).optional(),
  translationContext: z.string().max(20_000).optional(),
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

export const projectRecordSchema = z.object({
  id: z.string(),
  organizationId: z.string(),
  createdByUserId: z.string().nullable(),
  name: z.string(),
  description: z.string(),
  translationContext: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const projectResponseSchema = z.object({
  project: projectRecordSchema,
});

export const projectsResponseSchema = z.object({
  projects: z.array(projectRecordSchema),
});

export type ProjectIdParams = z.infer<typeof projectIdParamsSchema>;
export type CreateProjectBody = z.infer<typeof createProjectBodySchema>;
export type UpdateProjectBody = z.infer<typeof updateProjectBodySchema>;
export type ProjectRecord = z.infer<typeof projectRecordSchema>;
export type ProjectResponse = z.infer<typeof projectResponseSchema>;
export type ProjectsResponse = z.infer<typeof projectsResponseSchema>;
