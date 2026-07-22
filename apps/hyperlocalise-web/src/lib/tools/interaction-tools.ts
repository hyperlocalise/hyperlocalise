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
import { tool } from "ai";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { schema } from "@/lib/database";
import type { ToolContext } from "@/lib/tools/types";

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
