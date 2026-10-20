/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 */
import { describe, expect, it } from "vite-plus/test";

import { DEFAULT_SANITY_STUDIO_ORIGINS } from "./origins";

describe("sanity studio origins", () => {
  it("allows default Studio dev origins", () => {
    expect(DEFAULT_SANITY_STUDIO_ORIGINS).toEqual([
      "http://localhost:3333",
      "http://localhost:3334",
    ]);
  });
});
