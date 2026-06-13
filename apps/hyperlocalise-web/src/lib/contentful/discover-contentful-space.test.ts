import { describe, expect, it } from "vite-plus/test";

import { isErr } from "@/lib/primitives/result/results";

import { discoverContentfulSpace } from "./discover-contentful-space";

describe("discoverContentfulSpace", () => {
  it("returns a missing-credentials Result when no token or connection is provided", async () => {
    const result = await discoverContentfulSpace({
      organizationId: crypto.randomUUID(),
      spaceId: "space-id",
      environmentId: "master",
    });

    expect(isErr(result)).toBe(true);
    if (isErr(result)) {
      expect(result.error.code).toBe("contentful_discovery_missing_credentials");
      expect(result.error.message).toContain("Content Management API token");
    }
  });
});
