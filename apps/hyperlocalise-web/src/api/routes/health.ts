import { Hono } from "hono";

import { isDatabaseHealthy } from "@/lib/database";

export const healthRoutes = new Hono().get("/", async (c) => {
  const isHealthy = await isDatabaseHealthy();

  if (!isHealthy) {
    return c.json(
      {
        ok: false,
        error: "database_unavailable",
      },
      503,
    );
  }

  return c.json({ ok: true });
});
