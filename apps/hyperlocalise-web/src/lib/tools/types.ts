import type { db } from "@/lib/database";
import type { OrganizationMembershipRole } from "@/lib/database/types";

/**
 * Request-scoped context passed to every chat tool.
 *
 * Tools use this object to scope database queries and side effects
 * to the current organization, conversation, and project.
 */
export type ToolContext = {
  conversationId: string;
  organizationId: string;
  membershipRole: OrganizationMembershipRole;
  projectId: string | null;
  db: typeof db;
};
