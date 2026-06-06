import { describe, expect, it, vi } from "vite-plus/test";

vi.mock("@/lib/database", () => ({
  db: {},
  schema: {},
}));

import { extractProviderFileIds } from "./job-provider-source-files";

describe("extractProviderFileIds", () => {
  it.each([
    { name: "null payload", providerPayload: null },
    { name: "undefined payload", providerPayload: undefined },
    { name: "missing fileIds", providerPayload: {} },
    { name: "non-array fileIds", providerPayload: { fileIds: "123" } },
  ])("returns an empty list for $name", ({ providerPayload }) => {
    expect(extractProviderFileIds(providerPayload)).toEqual([]);
  });

  it("normalizes string and numeric file ids", () => {
    expect(extractProviderFileIds({ fileIds: [123, "456", 0] })).toEqual(["123", "456", "0"]);
  });

  it("filters unsupported and empty file id entries", () => {
    expect(
      extractProviderFileIds({
        fileIds: [123, "", null, undefined, false, true, { id: "456" }, ["789"]],
      }),
    ).toEqual(["123"]);
  });
});
