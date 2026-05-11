import { desc, eq } from "drizzle-orm";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { db, schema } from "@/lib/database";

export const mcpServer = new McpServer({
  name: "hyperlocalise",
  version: "1.0.0",
});

mcpServer.registerTool(
  "list_projects",
  {
    description:
      "List Hyperlocalise projects for the authenticated organization. Returns project id, name, description, and creation date.",
  },
  async (extra) => {
    const authExtra = extra.authInfo?.extra as { organizationId?: string } | undefined;
    const organizationId = authExtra?.organizationId;

    if (!organizationId) {
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ error: "unauthorized" }),
          },
        ],
      };
    }

    const projects = await db
      .select({
        id: schema.projects.id,
        name: schema.projects.name,
        description: schema.projects.description,
        createdAt: schema.projects.createdAt,
      })
      .from(schema.projects)
      .where(eq(schema.projects.organizationId, organizationId))
      .orderBy(desc(schema.projects.createdAt));

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({ projects }),
        },
      ],
    };
  },
);
