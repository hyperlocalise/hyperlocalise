import "dotenv/config";

import { describe, expect, it } from "vite-plus/test";

import { createSlackState, verifySlackState } from "./oauth-state";

const secret = "test-slack-oauth-state-secret";

describe("slack oauth state", () => {
  it("round trips slugs containing colons", async () => {
    const state = await createSlackState("org:with:colon", secret);

    await expect(verifySlackState(state, secret)).resolves.toEqual(
      expect.objectContaining({ slug: "org:with:colon" }),
    );
  });
});
