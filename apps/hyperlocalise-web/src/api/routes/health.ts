/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in this application's LICENSE file.
 *
 * Change Date: Four years after publication of the applicable version.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
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
