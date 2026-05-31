import type { OrganizationMembershipRole } from "@/lib/database/types";
import {
  getMembershipStatusLabel,
  getRoleDescription,
  getRoleLabel,
  MANUAL_LOCALIZATION_ACCESS_NOTICE,
} from "@/lib/members/member-management";

export type MembersListMember = {
  workosUserId: string;
  email: string;
  displayName: string;
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

export function resolveMembersPageState(response: MembersListResponse | undefined) {
  const members = response?.members ?? [];
  const memberManagement = response?.memberManagement;
  const assignableRoles = memberManagement?.assignableRoles ?? [];
  const canInvite = memberManagement?.canInvite ?? false;

  return {
    members,
    assignableRoles,
    canInvite,
    manualAccessNotice: MANUAL_LOCALIZATION_ACCESS_NOTICE,
  };
}

export { getMembershipStatusLabel, getRoleDescription, getRoleLabel };
