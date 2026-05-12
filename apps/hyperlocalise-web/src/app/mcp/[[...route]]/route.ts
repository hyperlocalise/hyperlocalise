import { handle } from "hono/vercel";

import { createMcpRoutes } from "@/api/routes/mcp/mcp.route";

const handler = handle(createMcpRoutes({ apiBasePath: "" }));

export const GET = handler;
export const POST = handler;
export const DELETE = handler;
