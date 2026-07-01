import { describe, expect, it } from "vite-plus/test";

import {
  orchestratorDirectToolNames,
  shouldUseCrowdinDirectTools,
} from "./orchestrator-direct-path";

describe("shouldUseCrowdinDirectTools", () => {
  it("returns true for translation-only Crowdin requests without attachments", () => {
    expect(
      shouldUseCrowdinDirectTools({
        suggestedIntents: ["translation"],
        hasFileAttachments: false,
      }),
    ).toBe(true);
  });

  it("returns false when file attachments are present", () => {
    expect(
      shouldUseCrowdinDirectTools({
        suggestedIntents: ["translation"],
        hasFileAttachments: true,
      }),
    ).toBe(false);
  });

  it("returns false when repository intent is also active", () => {
    expect(
      shouldUseCrowdinDirectTools({
        suggestedIntents: ["translation", "repository"],
        hasFileAttachments: false,
      }),
    ).toBe(false);
  });

  it("returns false for non-translation intents", () => {
    expect(
      shouldUseCrowdinDirectTools({
        suggestedIntents: ["general"],
        hasFileAttachments: false,
      }),
    ).toBe(false);
  });
});

describe("orchestratorDirectToolNames", () => {
  it("includes project resolution and Crowdin progress tools", () => {
    expect(orchestratorDirectToolNames).toEqual([
      "list_projects",
      "get_project_context",
      "update_interaction_project",
      "check_crowdin_progress",
    ]);
  });
});
