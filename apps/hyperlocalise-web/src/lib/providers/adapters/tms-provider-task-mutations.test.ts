import { describe, expect, it } from "vite-plus/test";

import {
  providerSupportsTaskCreate,
  providerSupportsTaskDelete,
} from "@/lib/providers/adapters/tms-provider-registry";

describe("tms provider task create/delete support", () => {
  it("supports Crowdin task create and delete", () => {
    expect(providerSupportsTaskCreate("crowdin")).toBe(true);
    expect(providerSupportsTaskDelete("crowdin")).toBe(true);
  });

  it("does not support task create/delete for providers without overrides", () => {
    expect(providerSupportsTaskCreate("smartling")).toBe(false);
    expect(providerSupportsTaskDelete("smartling")).toBe(false);
  });
});
