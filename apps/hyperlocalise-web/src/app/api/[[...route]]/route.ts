import { handle } from "hono/vercel";

import { api } from "@/api/app";

const handler = handle(api);

export const GET = handler;
export const POST = handler;
export const PUT = handler;
export const PATCH = handler;
export const DELETE = handler;
export const OPTIONS = handler;
export const HEAD = handler;
