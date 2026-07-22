/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in the LICENSE file.
 *
 * Change Date: Four years from the date the Licensed Work is published.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
import { z } from "zod";

export const organizationMembershipRoleSchema = z.enum([
  "admin",
  "localization_manager",
  "developer",
  "reviewer",
  "translator",
  "member",
]);

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
  avatarUrl: z.string().nullable(),
  role: organizationMembershipRoleSchema,
  isCurrentUser: z.boolean(),
  createdAt: z.string(),
  status: z.enum(["active", "invited"]),
  canUpdateRole: z.boolean().optional(),
  canRemove: z.boolean().optional(),
});

export const memberManagementSchema = z.object({
  canInvite: z.boolean(),
  assignableRoles: z.array(organizationMembershipRoleSchema),
});

export const membersResponseSchema = z.object({
  members: z.array(memberSummarySchema),
  memberManagement: memberManagementSchema.optional(),
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
