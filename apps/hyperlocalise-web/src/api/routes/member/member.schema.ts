import { z } from "zod";

export const organizationMembershipRoleSchema = z.enum(["owner", "admin", "member"]);

export const memberWorkosUserIdParamsSchema = z.object({
  workosUserId: z.string().trim().min(1).max(256),
});

export const inviteMemberBodySchema = z.object({
  email: z.string().trim().email().max(320),
  role: organizationMembershipRoleSchema.default("member"),
});

export const updateMemberBodySchema = z.object({
  role: organizationMembershipRoleSchema,
});

export const memberSummarySchema = z.object({
  workosUserId: z.string(),
  email: z.string(),
  firstName: z.string().nullable(),
  lastName: z.string().nullable(),
  displayName: z.string(),
  role: organizationMembershipRoleSchema,
  isCurrentUser: z.boolean(),
  createdAt: z.string(),
});

export const membersResponseSchema = z.object({
  members: z.array(memberSummarySchema),
});

export const memberResponseSchema = z.object({
  member: memberSummarySchema.extend({
    status: z.enum(["active", "invited"]).optional(),
  }),
});

export type InviteMemberBody = z.infer<typeof inviteMemberBodySchema>;
export type UpdateMemberBody = z.infer<typeof updateMemberBodySchema>;
export type MemberWorkosUserIdParams = z.infer<typeof memberWorkosUserIdParamsSchema>;
export type MemberSummary = z.infer<typeof memberSummarySchema>;
export type MembersResponse = z.infer<typeof membersResponseSchema>;
export type MemberResponse = z.infer<typeof memberResponseSchema>;
