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
import { and, desc, eq, isNull } from "drizzle-orm";
import { Hono } from "hono";

import { db, schema } from "@/lib/database/client";
import { otaContentType, otaManifestContentType, OTA_CACHE_CONTROL } from "@/lib/ota/formats";
import { hostedOtaObjectStore } from "@/lib/ota/release";
import { otaObjectKey } from "@/lib/ota/store";
import { isOtaPublicHash } from "@/lib/ota/public-hash";

function missing() {
  return new Response(null, { status: 404 });
}

function isUnsafeOtaPathSegment(value: string): boolean {
  return value.length === 0 || value === "." || /[\\/\0]/.test(value) || value.includes("..");
}

async function serveOtaFromRelease(hash: string, relativePath: string, method: string) {
  const [row] = await db
    .select({
      manifest: schema.otaReleases.manifest,
      contents: schema.otaReleases.contents,
      format: schema.otaDistributions.format,
    })
    .from(schema.otaDistributions)
    .innerJoin(
      schema.otaReleases,
      eq(schema.otaReleases.distributionId, schema.otaDistributions.id),
    )
    .where(
      and(
        eq(schema.otaDistributions.publicHash, hash),
        isNull(schema.otaDistributions.revokedAt),
        eq(schema.otaReleases.status, "success"),
      ),
    )
    .orderBy(desc(schema.otaReleases.sequence))
    .limit(1);

  if (!row) {
    return null;
  }

  if (relativePath === "manifest.json") {
    const headers = {
      "Content-Type": otaManifestContentType(),
      "Cache-Control": OTA_CACHE_CONTROL,
    };
    if (method === "HEAD") {
      return new Response(null, { status: 200, headers });
    }
    return Response.json(row.manifest, { status: 200, headers });
  }

  const prefix = "content/";
  if (!relativePath.startsWith(prefix)) {
    return null;
  }
  const rest = relativePath.slice(prefix.length);
  const slash = rest.indexOf("/");
  if (slash <= 0) {
    return null;
  }
  const locale = rest.slice(0, slash);
  const exportPath = rest.slice(slash + 1);
  const body = row.contents?.[locale]?.[exportPath];
  if (body === undefined) {
    return null;
  }
  const headers = {
    "Content-Type": otaContentType(row.format),
    "Cache-Control": OTA_CACHE_CONTROL,
  };
  if (method === "HEAD") {
    return new Response(null, { status: 200, headers });
  }
  return new Response(body, { status: 200, headers });
}

async function serveOtaObject(hash: string, relativePath: string, method: string) {
  const store = hostedOtaObjectStore();
  if (!store) {
    return null;
  }

  const stored = await store.get(otaObjectKey(hash, relativePath));
  if (!stored) {
    return null;
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

async function serveOta(hash: string, relativePath: string, method: string) {
  if (!isOtaPublicHash(hash)) {
    return missing();
  }
  try {
    const fromRelease = await serveOtaFromRelease(hash, relativePath, method);
    if (fromRelease) {
      return fromRelease;
    }
  } catch {
    // Fall back to object storage when Postgres is unavailable.
  }
  return (await serveOtaObject(hash, relativePath, method)) ?? missing();
}

export function createPublicOtaRoutes() {
  return new Hono()
    .on("GET", "/:hash/manifest.json", async (c) => {
      return serveOta(c.req.param("hash"), "manifest.json", c.req.method);
    })
    .on("HEAD", "/:hash/manifest.json", async (c) => {
      return serveOta(c.req.param("hash"), "manifest.json", c.req.method);
    })
    .on("GET", "/:hash/content/:locale/:file", async (c) => {
      const { hash, locale, file } = c.req.param();
      if (isUnsafeOtaPathSegment(locale) || isUnsafeOtaPathSegment(file)) {
        return missing();
      }
      return serveOta(hash, `content/${locale}/${file}`, c.req.method);
    })
    .on("HEAD", "/:hash/content/:locale/:file", async (c) => {
      const { hash, locale, file } = c.req.param();
      if (isUnsafeOtaPathSegment(locale) || isUnsafeOtaPathSegment(file)) {
        return missing();
      }
      return serveOta(hash, `content/${locale}/${file}`, c.req.method);
    });
}
