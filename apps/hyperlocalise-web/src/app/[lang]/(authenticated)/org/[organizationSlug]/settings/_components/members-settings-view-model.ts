"use client";

/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in this application's LICENSE file.
 *
 * Change Date: Four years after publication of the applicable version.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
import type { IntlShape } from "@formatjs/intl";

import type { OrganizationMembershipRole } from "@/lib/database/types";
import {
  getRoleBadgeClassName,
  getRoleBadgeVariant,
  type MemberApiStatus,
} from "@/lib/members/member-management";
import { resolveMessage } from "@/lib/app-i18n/resolve-message";

import { membersSettingsViewModelMessages } from "./members-settings-view-model.messages";

export type MembersSettingsIntl = Pick<IntlShape, "formatMessage">;

export type MembersListMember = {
  workosUserId: string;
  email: string;
  displayName: string;
  avatarUrl: string | null;
  role: OrganizationMembershipRole;
  isCurrentUser: boolean;
  status?: "active" | "invited";
  canUpdateRole?: boolean;
  canRemove?: boolean;
};

export type MembersListResponse = {
  members: MembersListMember[];
  memberManagement?: {
    canInvite: boolean;
    assignableRoles: OrganizationMembershipRole[];
  };
};

const roleLabelMessages = {
  admin: membersSettingsViewModelMessages.roleAdmin,
  localization_manager: membersSettingsViewModelMessages.roleLocalizationManager,
  developer: membersSettingsViewModelMessages.roleDeveloper,
  reviewer: membersSettingsViewModelMessages.roleReviewer,
  translator: membersSettingsViewModelMessages.roleTranslator,
  member: membersSettingsViewModelMessages.roleMember,
} as const;

const roleDescriptionMessages = {
  admin: membersSettingsViewModelMessages.roleAdminDescription,
  localization_manager: membersSettingsViewModelMessages.roleLocalizationManagerDescription,
  developer: membersSettingsViewModelMessages.roleDeveloperDescription,
  reviewer: membersSettingsViewModelMessages.roleReviewerDescription,
  translator: membersSettingsViewModelMessages.roleTranslatorDescription,
  member: membersSettingsViewModelMessages.roleMemberDescription,
} as const;

export function getRoleLabel(role: OrganizationMembershipRole, intl?: MembersSettingsIntl) {
  const descriptor = roleLabelMessages[role];
  if (!descriptor) {
    return role;
  }

  return resolveMessage(intl, descriptor);
}

export function getRoleDescription(role: OrganizationMembershipRole, intl?: MembersSettingsIntl) {
  const descriptor = roleDescriptionMessages[role];
  if (!descriptor) {
    return "";
  }

  return resolveMessage(intl, descriptor);
}

export function getMembershipStatusLabel(status: MemberApiStatus, intl?: MembersSettingsIntl) {
  if (status === "invited") {
    return resolveMessage(intl, membersSettingsViewModelMessages.statusPending);
  }

  return resolveMessage(intl, membersSettingsViewModelMessages.statusActive);
}

export function getMembershipStatusDescription(
  status: MemberApiStatus,
  intl?: MembersSettingsIntl,
) {
  if (status === "invited") {
    return resolveMessage(intl, membersSettingsViewModelMessages.statusPendingDescription);
  }

  return resolveMessage(intl, membersSettingsViewModelMessages.statusActiveDescription);
}

export function resolveMembersPageState(
  response: MembersListResponse | undefined,
  intl?: MembersSettingsIntl,
) {
  const members = response?.members ?? [];
  const memberManagement = response?.memberManagement;
  const assignableRoles = memberManagement?.assignableRoles ?? [];
  const canInvite = memberManagement?.canInvite ?? false;

  return {
    members,
    assignableRoles,
    canInvite,
    manualAccessNotice: resolveMessage(
      intl,
      membersSettingsViewModelMessages.manualLocalizationAccessNotice,
    ),
  };
}

export { getRoleBadgeClassName, getRoleBadgeVariant };
