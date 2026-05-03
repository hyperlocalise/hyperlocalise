import { tool } from "ai";
import { z } from "zod";

import type { ToolContext } from "./types";

/**
 * TODO: Resolve or archive the interaction's inbox item.
 *
 * PRODUCT.md requirement: "The interaction records the result, and the inbox item remains open,
 * resolved, or archived."
 *
 * Implementation plan:
 * 1. Accept `status`: "active" | "archived" (or add "resolved" to the `inboxStatusEnum`).
 * 2. Update `inboxItems.status` for the current interaction.
 * 3. Return the new status.
 *
 * Example usage: user says "That's all I needed, thanks."
 */
export function createResolveInteractionTool(_ctx: ToolContext) {
  return tool({
    description:
      "Resolve or archive the current conversation so it no longer appears as requiring attention in the inbox.",
    inputSchema: z.object({
      status: z.enum(["active", "archived"]).describe("Desired inbox status."),
    }),
    execute: async () => {
      // TODO: implement inbox status update.
      // Schema: `inboxItems`. Consider adding "resolved" to `inboxStatusEnum`.
      return { success: false, status: null };
    },
  });
}
