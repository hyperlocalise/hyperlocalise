/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 */
import { describe, expect, it } from "vite-plus/test";

import { DEFAULT_SANITY_STUDIO_ORIGINS, isHostedSanityStudioOrigin } from "./origins";

describe("sanity studio origins", () => {
  it("allows default Studio dev origins", () => {
    expect(DEFAULT_SANITY_STUDIO_ORIGINS).toEqual([
      "http://localhost:3333",
      "http://localhost:3334",
    ]);
  });
});

describe("isHostedSanityStudioOrigin", () => {
  it("accepts hosted https sanity.studio origins", () => {
    expect(isHostedSanityStudioOrigin("https://acme.sanity.studio")).toBe(true);
    expect(isHostedSanityStudioOrigin("https://my-project.sanity.studio")).toBe(true);
  });

  it("rejects non-https and non-studio hosts", () => {
    expect(isHostedSanityStudioOrigin("http://acme.sanity.studio")).toBe(false);
    expect(isHostedSanityStudioOrigin("https://acme.example.com")).toBe(false);
    expect(isHostedSanityStudioOrigin("https://evil.sanity.studio.attacker.com")).toBe(false);
    expect(isHostedSanityStudioOrigin("https://sub.acme.sanity.studio")).toBe(false);
  });
});
