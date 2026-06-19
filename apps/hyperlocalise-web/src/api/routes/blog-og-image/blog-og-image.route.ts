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
