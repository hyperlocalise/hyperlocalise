import { describe, expect, it } from "vite-plus/test";

import {
  matchesProviderAssignee,
  normalizeProviderAssigneeCandidates,
} from "./tms-provider-assignee-match";

describe("tms-provider-assignee-match", () => {
  it("normalizes and deduplicates assignee candidates", () => {
    expect(normalizeProviderAssigneeCandidates([" Lee ", "LEE", ""])).toEqual(["lee"]);
  });

  it("matches assignees with exact normalized equality only", () => {
    expect(matchesProviderAssignee("Lee Example", ["lee example"])).toBe(true);
    expect(matchesProviderAssignee("Ashlee Johnson", ["lee"])).toBe(false);
    expect(matchesProviderAssignee("Joanna Smith", ["ann"])).toBe(false);
  });
});
