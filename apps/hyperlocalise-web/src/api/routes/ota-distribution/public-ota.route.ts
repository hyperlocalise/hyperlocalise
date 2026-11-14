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

import { hostedOtaObjectStore } from "@/lib/ota/release";
import { otaObjectKey } from "@/lib/ota/store";
import { isOtaPublicHash } from "@/lib/ota/public-hash";

function missing() {
  return new Response(null, { status: 404 });
}

function isUnsafeOtaPathSegment(value: string): boolean {
  return value.length === 0 || value === "." || /[\\/\0]/.test(value) || value.includes("..");
}

async function serveOtaObject(hash: string, relativePath: string, method: string) {
  if (!isOtaPublicHash(hash)) {
    return missing();
  }

  const store = hostedOtaObjectStore();
  if (!store) {
    return missing();
  }

  const stored = await store.get(otaObjectKey(hash, relativePath));
  if (!stored) {
    return missing();
  }

  const headers = {
    "Content-Type": stored.contentType,
    "Cache-Control": stored.cacheControl,
  };

  if (method === "HEAD") {
    return new Response(null, { status: 200, headers });
  }

  return new Response(Uint8Array.from(stored.body), { status: 200, headers });
}

export function createPublicOtaRoutes() {
  return new Hono()
    .on("GET", "/:hash/manifest.json", async (c) => {
      return serveOtaObject(c.req.param("hash"), "manifest.json", c.req.method);
    })
    .on("HEAD", "/:hash/manifest.json", async (c) => {
      return serveOtaObject(c.req.param("hash"), "manifest.json", c.req.method);
    })
    .on("GET", "/:hash/content/:locale/:file", async (c) => {
      const { hash, locale, file } = c.req.param();
      if (isUnsafeOtaPathSegment(locale) || isUnsafeOtaPathSegment(file)) {
        return missing();
      }
      return serveOtaObject(hash, `content/${locale}/${file}`, c.req.method);
    })
    .on("HEAD", "/:hash/content/:locale/:file", async (c) => {
      const { hash, locale, file } = c.req.param();
      if (isUnsafeOtaPathSegment(locale) || isUnsafeOtaPathSegment(file)) {
        return missing();
      }
      return serveOtaObject(hash, `content/${locale}/${file}`, c.req.method);
    });
}
