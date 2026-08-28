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
import { bodyLimit } from "hono/body-limit";

import { handle } from "./hono-vercel";
import { toPlainRequest } from "./to-plain-request";

function asNextLikeRequest(request: Request): Request {
  return new Proxy(request, {
    get(target, property) {
      const value = Reflect.get(target, property, target);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
}

describe("toPlainRequest", () => {
  it("rebuilds a Request that Hono can remount and bodyLimit can clone", async () => {
    const app = new Hono().basePath("/api").route(
      "/echo",
      new Hono().post(
        "/",
        bodyLimit({
          maxSize: 1024,
          onError: (c) => c.json({ error: "too_large" }, 413),
        }),
        async (c) => c.json({ text: await c.req.text() }),
      ),
    );

    const createChunkedPost = () =>
      new Request("http://localhost/api/echo", {
        method: "POST",
        headers: { "transfer-encoding": "chunked" },
        body: "hello",
        duplex: "half",
      } as RequestInit);

    const proxied = asNextLikeRequest(createChunkedPost());
    expect(() => new Request(proxied)).toThrow(/private member #state/);
    const failed = await app.fetch(proxied);
    expect(failed.status).toBe(500);

    const handler = handle(app);
    const response = await handler(asNextLikeRequest(createChunkedPost()));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ text: "hello" });
  });

  it("preserves method, url, headers, and body", async () => {
    const request = new Request("http://localhost/api/items?q=1", {
      method: "PUT",
      headers: { "content-type": "text/plain", "x-test": "yes" },
      body: "payload",
    });

    const plain = toPlainRequest(asNextLikeRequest(request));
    expect(plain).not.toBe(request);
    expect(plain.url).toBe("http://localhost/api/items?q=1");
    expect(plain.method).toBe("PUT");
    expect(plain.headers.get("x-test")).toBe("yes");
    await expect(plain.text()).resolves.toBe("payload");
  });
});
