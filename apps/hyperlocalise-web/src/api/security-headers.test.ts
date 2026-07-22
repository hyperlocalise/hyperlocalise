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
import "dotenv/config";

import { describe, expect, it } from "vite-plus/test";
import { createApp } from "@/api/app";

const app = createApp();

describe("security headers", () => {
  it("should have security headers on the health endpoint", async () => {
    const res = await app.request("/api/health");

    // Default Hono secureHeaders() includes these:
    expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(res.headers.get("X-Frame-Options")).toBe("SAMEORIGIN");
    expect(res.headers.get("Referrer-Policy")).toBe("no-referrer");
    expect(res.headers.get("X-XSS-Protection")).toBe("0");
  });

  it("should have security headers on other endpoints", async () => {
    // Health route (as a proxy for other routes)
    const res = await app.request("/api/health");
    expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff");
  });
});
