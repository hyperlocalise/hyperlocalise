import { z } from "zod";

const localePattern = /^[a-z]{2,3}(-[A-Z]{2,3})?$/;

export const glossaryIdParamsSchema = z.object({
  glossaryId: z.string().trim().min(1),
});

export const listGlossaryQuerySchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(100).default(50),
    offset: z.coerce.number().int().min(0).default(0),
  })
  .optional();

export const createGlossaryBodySchema = z.object({
  name: z.string().trim().min(1).max(200),
  description: z.string().max(10_000).optional(),
  sourceLocale: z
    .string()
    .trim()
    .min(1)
    .max(50)
    .regex(localePattern, "invalid locale format (e.g., en, en-US, fr-FR)"),
  targetLocale: z
    .string()
    .trim()
    .min(1)
    .max(50)
    .regex(localePattern, "invalid locale format (e.g., en, en-US, fr-FR)"),
});

export const updateGlossaryBodySchema = z
  .object({
    name: z.string().trim().min(1).max(200).optional(),
    description: z.string().max(10_000).optional(),
    sourceLocale: z
      .string()
      .trim()
      .min(1)
      .max(50)
      .regex(localePattern, "invalid locale format (e.g., en, en-US, fr-FR)")
      .optional(),
    targetLocale: z
      .string()
      .trim()
      .min(1)
      .max(50)
      .regex(localePattern, "invalid locale format (e.g., en, en-US, fr-FR)")
      .optional(),
  })
  .refine(
    (value) =>
      value.name !== undefined ||
      value.description !== undefined ||
      value.sourceLocale !== undefined ||
      value.targetLocale !== undefined,
    {
      message: "at least one field must be provided",
    },
  );

export const glossaryRecordSchema = z.object({
  id: z.string(),
  organizationId: z.string(),
  createdByUserId: z.string().nullable(),
  name: z.string(),
  description: z.string(),
  sourceLocale: z.string(),
  targetLocale: z.string(),
  status: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const glossaryResponseSchema = z.object({
  glossary: glossaryRecordSchema,
});

export const glossariesResponseSchema = z.object({
  glossaries: z.array(glossaryRecordSchema),
});

export type GlossaryIdParams = z.infer<typeof glossaryIdParamsSchema>;
export type ListGlossaryQuery = z.infer<typeof listGlossaryQuerySchema>;
export type CreateGlossaryBody = z.infer<typeof createGlossaryBodySchema>;
export type UpdateGlossaryBody = z.infer<typeof updateGlossaryBodySchema>;
export type GlossaryRecord = z.infer<typeof glossaryRecordSchema>;
export type GlossaryResponse = z.infer<typeof glossaryResponseSchema>;
export type GlossariesResponse = z.infer<typeof glossariesResponseSchema>;
