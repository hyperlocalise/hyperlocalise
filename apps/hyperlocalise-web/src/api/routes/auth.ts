import { Hono } from "hono";

import { workosAuthMiddleware, type AuthVariables } from "../auth/workos";

export const authRoutes = new Hono<{ Variables: AuthVariables }>()
  .use("*", workosAuthMiddleware)
  .get("/context", (c) => c.json({ auth: c.var.auth }, 200));
