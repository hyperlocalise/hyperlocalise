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
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { getWorkosAuthkitIssuerUrl } from "@/lib/workos/config";

import { integrationSlugs } from "@/components/marketing/integrations/integrations-page-content";
import { productSlugs } from "@/components/marketing/product/product-page-content";
import { useCaseSlugs } from "@/components/marketing/use-case/use-case-page-content";
import { getAllPosts } from "@/lib/blog/blog-post";

import { GET } from "./route";

vi.mock("@/lib/workos/config", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/workos/config")>();
  return {
    ...actual,
    getWorkosAuthkitIssuerUrl: vi.fn(),
  };
});

describe("llms.txt route", () => {
  beforeEach(() => {
    vi.mocked(getWorkosAuthkitIssuerUrl).mockReturnValue("https://authkit.test");
  });

  it("returns a spec-shaped markdown index for agents", async () => {
    const response = GET();
    const body = await response.text();

    expect(response.headers.get("Content-Type")).toBe("text/plain; charset=utf-8");
    expect(body.startsWith("# Hyperlocalise\n")).toBe(true);
    expect(body).toContain(
      "> Hyperlocalise is the best agentic localisation platform — an AI workforce that helps teams launch globally in days, built so localisation managers can thrive.",
    );
    expect(body).toContain("## Product");
    expect(body).toContain("## Use cases");
    expect(body).toContain("## Integrations");
    expect(body).toContain("## Blog");
    expect(body).toContain("https://hyperlocalise.dev");
    expect(body).toContain("## Agents");
    expect(body).toContain("[Agent registration](https://www.hyperlocalise.com/auth.md)");
    expect(body).toContain("https://www.hyperlocalise.com/llms-full.txt");
    expect(body).not.toContain("..");
    expect(body).not.toContain("| Hyperlocalise");
    expect(body).not.toContain("github.com/hyperlocalise");
    expect(body).not.toContain("mailto:");
  });

  it("links every product, use case, integration, and English blog post", async () => {
    const body = await GET().text();

    for (const slug of productSlugs) {
      expect(body).toContain(`(https://www.hyperlocalise.com/en/product/${slug})`);
    }
    for (const slug of useCaseSlugs) {
      expect(body).toContain(`(https://www.hyperlocalise.com/en/use-cases/${slug})`);
    }
    for (const slug of integrationSlugs) {
      expect(body).toContain(`(https://www.hyperlocalise.com/en/integrations/${slug})`);
    }
    for (const post of getAllPosts("en")) {
      expect(body).toContain(`(https://www.hyperlocalise.com/en/blog/${post.slug}.md)`);
    }
  });

  it("uses short product names as link text", async () => {
    const body = await GET().text();

    expect(body).toContain(
      "[Agent Automation](https://www.hyperlocalise.com/en/product/agents-automation)",
    );
  });

  it("omits AuthKit registration when the AuthKit domain is unset", async () => {
    vi.mocked(getWorkosAuthkitIssuerUrl).mockReturnValue(null);

    const body = await GET().text();

    expect(body).not.toContain("## Agents");
    expect(body).not.toContain("/auth.md");
    expect(body).toContain("## Product");
  });
});
