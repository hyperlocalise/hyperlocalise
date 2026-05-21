import { z } from "zod";

export const teamRoleSchema = z.enum(["manager", "member"]);

export const createTeamBodySchema = z.object({
  name: z.string().trim().min(1).max(120),
  slug: z
    .string()
    .trim()
    .min(1)
    .max(120)
    .regex(/^[a-z0-9-]+$/)
    .optional(),
});

export const updateTeamBodySchema = createTeamBodySchema
  .partial()
  .refine((value) => value.name !== undefined || value.slug !== undefined);

export const addTeamMemberBodySchema = z.object({
  workosUserId: z.string().trim().min(1).max(256),
  role: teamRoleSchema.optional(),
});

export const teamIdParamsSchema = z.object({
  teamId: z.string().uuid(),
});

export const teamMemberParamsSchema = z.object({
  teamId: z.string().uuid(),
  workosUserId: z.string().min(1).max(256),
});

export const teamRecordSchema = z.object({
  id: z.string().uuid(),
  organizationId: z.string(),
  slug: z.string(),
  name: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const teamSummarySchema = teamRecordSchema
  .pick({
    id: true,
    slug: true,
    name: true,
    createdAt: true,
    updatedAt: true,
  })
  .extend({
    memberCount: z.number(),
  });

export const teamMemberSchema = z.object({
  workosUserId: z.string().max(256),
  email: z.string().email(),
  role: teamRoleSchema,
});

export const teamResponseSchema = z.object({
  team: teamRecordSchema,
});

export const teamWithMembersResponseSchema = z.object({
  team: teamRecordSchema.extend({
    members: z.array(teamMemberSchema),
  }),
});

export const teamsResponseSchema = z.object({
  teams: z.array(teamSummarySchema),
});

export const teamMemberResponseSchema = z.object({
  member: teamMemberSchema,
});

export type TeamRole = z.infer<typeof teamRoleSchema>;
export type CreateTeamBody = z.infer<typeof createTeamBodySchema>;
export type UpdateTeamBody = z.infer<typeof updateTeamBodySchema>;
export type AddTeamMemberBody = z.infer<typeof addTeamMemberBodySchema>;
export type TeamIdParams = z.infer<typeof teamIdParamsSchema>;
export type TeamMemberParams = z.infer<typeof teamMemberParamsSchema>;
export type TeamRecord = z.infer<typeof teamRecordSchema>;
export type TeamResponse = z.infer<typeof teamResponseSchema>;
export type TeamWithMembersResponse = z.infer<typeof teamWithMembersResponseSchema>;
export type TeamsResponse = z.infer<typeof teamsResponseSchema>;
export type TeamMemberResponse = z.infer<typeof teamMemberResponseSchema>;
