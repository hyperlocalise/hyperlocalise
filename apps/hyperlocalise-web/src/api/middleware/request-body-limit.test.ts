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
import { describe, expect, it } from "vite-plus/test";
import { Hono } from "hono";

import { createRequestBodyLimitMiddleware } from "./request-body-limit";

describe("createRequestBodyLimitMiddleware", () => {
  it("accepts a proxied multipart body without content-length", async () => {
    const app = new Hono();
    app.post(
      "/upload",
      createRequestBodyLimitMiddleware({
        maxSize: 1024,
        onError: (c) => c.json({ error: "too_large" }, 413),
      }),
      async (c) => {
        const formData = await c.req.formData();
        const file = formData.get("file");
        return c.json({
          ok: file instanceof File,
          size: file instanceof File ? file.size : 0,
        });
      },
    );

    const formData = new FormData();
    formData.set("file", new File([Uint8Array.from([1, 2, 3, 4])], "a.png", { type: "image/png" }));
    const request = new Request("http://localhost/upload", {
      method: "POST",
      body: formData,
    });
    expect(request.headers.get("content-length")).toBeNull();

    const proxiedRequest = new Proxy(request, {
      get(target, property) {
        const value = Reflect.get(target, property, target);
        return typeof value === "function" ? value.bind(target) : value;
      },
    });

    // Hono's built-in bodyLimit rebuilds with `new Request(raw)`, which throws on Proxy.
    expect(() => new Request(proxiedRequest, { duplex: "half" } as RequestInit)).toThrow();

    const response = await app.fetch(proxiedRequest);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true, size: 4 });
  });

  it("rejects oversized chunked bodies", async () => {
    const app = new Hono();
    app.post(
      "/upload",
      createRequestBodyLimitMiddleware({
        maxSize: 8,
        onError: (c) => c.json({ error: "too_large" }, 413),
      }),
      async (c) => c.json({ ok: true }),
    );

    const body = new ReadableStream({
      start(controller) {
        controller.enqueue(new Uint8Array(16));
        controller.close();
      },
    });
    const response = await app.fetch(
      new Request("http://localhost/upload", {
        method: "POST",
        headers: { "transfer-encoding": "chunked" },
        body,
        // @ts-expect-error undici duplex for streaming bodies
        duplex: "half",
      }),
    );

    expect(response.status).toBe(413);
    await expect(response.json()).resolves.toEqual({ error: "too_large" });
  });
});
