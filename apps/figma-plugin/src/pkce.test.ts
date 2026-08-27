import { describe, expect, it } from "vite-plus/test";

import { createPkcePair } from "./pkce";

describe("pkce", () => {
  it("creates an S256 verifier, challenge, and state", async () => {
    const pair = await createPkcePair();

    expect(pair.codeVerifier.length).toBeGreaterThanOrEqual(43);
    expect(pair.codeChallenge.length).toBeGreaterThanOrEqual(43);
    expect(pair.state.length).toBeGreaterThanOrEqual(16);
    expect(pair.codeVerifier).not.toBe(pair.codeChallenge);
  });
});
