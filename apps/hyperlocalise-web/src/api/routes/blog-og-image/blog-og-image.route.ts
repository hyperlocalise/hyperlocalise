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

import { DEFAULT_APP_LOCALE, normalizeAppLocale } from "@/lib/app-i18n/locales";
import { createBlogPostOgImageResponse } from "@/lib/blog/blog-post-og-image";

export function createBlogOgImageRoutes() {
  return new Hono().get("/:slug/og-image", async (c) => {
    const lang =
      normalizeAppLocale(c.req.query("lang") ?? DEFAULT_APP_LOCALE) ?? DEFAULT_APP_LOCALE;
    const imageResponse = await createBlogPostOgImageResponse(lang, c.req.param("slug"));

    if (!imageResponse) {
      return c.text("Not found", 404);
    }

    return imageResponse;
  });
}
