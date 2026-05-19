import { tool } from "ai";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { schema } from "@/lib/database";
import type { ToolContext } from "./types";

/**
 * Marks the current interaction's inbox item as active or archived.
 *
 * Example usage: user says "That's all I needed, thanks."
 */
export function createResolveInteractionTool(ctx: ToolContext) {
  return tool({
    description:
      "Resolve or archive the current conversation so it no longer appears as requiring attention in the inbox.",
    inputSchema: z.object({
      status: z.enum(["active", "archived"]).describe("Desired inbox status."),
    }),
    execute: async ({ status }) => {
      const [item] = await ctx.db
        .update(schema.inboxItems)
        .set({ status })
        .where(
          and(
            eq(schema.inboxItems.interactionId, ctx.conversationId),
            eq(schema.inboxItems.organizationId, ctx.organizationId),
          ),
        )
        .returning({ status: schema.inboxItems.status });

      if (!item) {
        return { success: false, status: null, error: "Inbox item not found." };
      }

      return { success: true, status: item.status };
    },
  });
}
