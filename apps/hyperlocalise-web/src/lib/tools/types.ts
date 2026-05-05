import type { db } from "@/lib/database";

/**
 * Request-scoped context passed to every chat tool.
 *
 * Tools use this object to scope database queries and side effects
 * to the current organization, conversation, and project.
 */
export type ToolContext = {
  conversationId: string;
  organizationId: string;
  projectId: string | null;
  db: typeof db;
};
