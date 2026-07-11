import { handle } from "hono/vercel";

import { createApp } from "@/api/app";
import { createWorkosIdentify } from "@/lib/flags/identify-workos-context";
import { workspaceKnowledgeFlag } from "@/lib/flags/workspace-flags";

const app = createApp({
  workspaceKnowledgeFlagResolver: (auth) =>
    workspaceKnowledgeFlag.run({ identify: () => createWorkosIdentify(auth) }),
});
const handler = handle(app);

export const GET = handler;
export const POST = handler;
export const PUT = handler;
export const PATCH = handler;
export const DELETE = handler;
export const OPTIONS = handler;
export const HEAD = handler;

export const maxDuration = 300;
