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
import { describe, expect, it, vi } from "vite-plus/test";

import { createGoSvcRoutes, goSvcUpstreamPath, resolveGoSvcBaseUrl } from "./go-svc.route";

function createApp(options: Parameters<typeof createGoSvcRoutes>[0] = {}) {
  return new Hono().basePath("/api").route("/go-svc", createGoSvcRoutes(options));
}

describe("goSvcUpstreamPath", () => {
  it("strips the public prefix and allows health and v1 paths", () => {
    expect(goSvcUpstreamPath("/api/go-svc/v1/validate/segment")).toBe("/v1/validate/segment");
    expect(goSvcUpstreamPath("/api/go-svc/health")).toBe("/health");
    expect(goSvcUpstreamPath("/v1/validate/segment")).toBe("/v1/validate/segment");
  });

  it("rejects traversal and unknown paths", () => {
    expect(goSvcUpstreamPath("/api/go-svc/../secret")).toBeNull();
    expect(goSvcUpstreamPath("/api/go-svc/admin")).toBeNull();
    expect(goSvcUpstreamPath("/api/go-svc/v2/validate/segment")).toBeNull();
  });
});

describe("resolveGoSvcBaseUrl", () => {
  it("uses an explicit override and strips a trailing slash", () => {
    expect(resolveGoSvcBaseUrl("http://go-svc.test/")).toBe("http://go-svc.test");
  });

  it("treats a null override as missing", () => {
    expect(resolveGoSvcBaseUrl(null)).toBeUndefined();
  });
});

describe("createGoSvcRoutes", () => {
  it("posts to the bound go-svc URL with cookies and the stripped path", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ checks: [] }), {
        status: 200,
        headers: { "Content-Type": "application/json", "Set-Cookie": "wos-session=refreshed" },
      }),
    );
    const app = createApp({
      baseUrl: "http://go-svc.test/",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    const response = await app.request("/api/go-svc/v1/validate/segment?debug=1", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: "wos-session=sealed",
      },
      body: JSON.stringify({ sourceText: "Hello", targetText: "Bonjour" }),
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("set-cookie")).toBe("wos-session=refreshed");
    await expect(response.json()).resolves.toEqual({ checks: [] });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0] as [URL, RequestInit];
    expect(url.href).toBe("http://go-svc.test/v1/validate/segment?debug=1");
    expect(init.method).toBe("POST");
    expect(new Headers(init.headers).get("cookie")).toBe("wos-session=sealed");
    expect(new Headers(init.headers).has("host")).toBe(false);
    expect(init.body).toBeTruthy();
  });

  it("returns 404 for paths outside health and v1", async () => {
    const fetchImpl = vi.fn();
    const app = createApp({
      baseUrl: "http://go-svc.test",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    const response = await app.request("/api/go-svc/admin");

    expect(response.status).toBe(404);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("returns 503 when the binding URL is missing", async () => {
    const fetchImpl = vi.fn();
    const app = createApp({
      baseUrl: null,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    const response = await app.request("/api/go-svc/v1/validate/segment", { method: "POST" });

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      error: "go_svc_unavailable",
      message: "Validation service is unavailable",
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("returns 503 when the binding fetch fails", async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error("connection refused"));
    const app = createApp({
      baseUrl: "http://go-svc.test",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    const response = await app.request("/api/go-svc/health");

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      error: "go_svc_unavailable",
      message: "Validation service is unavailable",
    });
  });
});
