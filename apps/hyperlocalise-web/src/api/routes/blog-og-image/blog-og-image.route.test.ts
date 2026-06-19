import { describe, expect, it } from "vite-plus/test";

import { createBlogOgImageRoutes } from "./blog-og-image.route";

describe("createBlogOgImageRoutes", () => {
  const app = createBlogOgImageRoutes();

  it("returns 404 for unsafe slugs", async () => {
    const response = await app.request("http://localhost/../secrets/og-image?lang=en");

    expect(response.status).toBe(404);
  });

  it("returns 404 for missing posts", async () => {
    const response = await app.request("http://localhost/missing-post/og-image?lang=en");

    expect(response.status).toBe(404);
  });
});
