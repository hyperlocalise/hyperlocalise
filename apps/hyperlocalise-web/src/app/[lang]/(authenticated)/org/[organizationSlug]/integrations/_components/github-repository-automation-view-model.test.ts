import { describe, expect, it } from "vite-plus/test";

import {
  addBranchPattern,
  createAutomationFormStateFromSettings,
  formStateToAutomationSettings,
  mapAutomationApiErrorToFieldErrors,
  validateAutomationFormState,
} from "./github-repository-automation-view-model";
import { DEFAULT_GITHUB_REPOSITORY_AUTOMATION_SETTINGS } from "@/lib/agents/github/github-repository-automation-settings";
import { getIntlShape } from "@/lib/app-i18n/intl";
import type { IntlShape } from "react-intl";

const intl = getIntlShape("en") as IntlShape;

describe("github-repository-automation-view-model", () => {
  it("maps stored settings into form state", () => {
    const form = createAutomationFormStateFromSettings({
      ...DEFAULT_GITHUB_REPOSITORY_AUTOMATION_SETTINGS,
      workflows: {
        pushSource: { enabled: true, projectId: "project-1" },
        pullTranslations: { enabled: false },
        validation: { enabled: true, blockOnFailure: false },
      },
      trigger: {
        mode: "push",
        branches: ["main", "release/*"],
      },
      statusCheck: { enabled: true, mode: "advisory" },
    });

    expect(form).toMatchObject({
      pushSourceEnabled: true,
      pushSourceProjectId: "project-1",
      validationEnabled: true,
      triggerMode: "push",
      pushBranches: ["main", "release/*"],
      statusCheckEnabled: true,
      statusCheckMode: "advisory",
    });
  });

  it("requires a trigger when workflows are enabled", () => {
    const errors = validateAutomationFormState(intl, {
      ...createAutomationFormStateFromSettings(DEFAULT_GITHUB_REPOSITORY_AUTOMATION_SETTINGS),
      pushSourceEnabled: true,
      pushSourceProjectId: "project-1",
      triggerMode: "none",
    });

    expect(errors.trigger).toBeTruthy();
  });

  it("serializes push trigger settings for save", () => {
    const settings = formStateToAutomationSettings({
      ...createAutomationFormStateFromSettings(DEFAULT_GITHUB_REPOSITORY_AUTOMATION_SETTINGS),
      pullTranslationsEnabled: true,
      pullTranslationsProjectId: "project-2",
      triggerMode: "push",
      pushBranches: ["main"],
      statusCheckEnabled: true,
      statusCheckMode: "blocking",
    });

    expect(settings).toMatchObject({
      workflows: {
        pullTranslations: { enabled: true, projectId: "project-2" },
      },
      trigger: {
        mode: "push",
        branches: ["main"],
      },
      statusCheck: { enabled: true, mode: "blocking" },
    });
  });

  it("maps API validation codes to field errors", () => {
    expect(mapAutomationApiErrorToFieldErrors(intl, "push_trigger_requires_branches")).toEqual({
      pushBranches: expect.stringContaining("branch pattern"),
    });
  });

  it("deduplicates branch patterns and enforces limits", () => {
    const first = addBranchPattern(intl, [], "main");
    const duplicate = addBranchPattern(intl, first.branches, "main");

    expect(first.branches).toEqual(["main"]);
    expect(duplicate.error).toMatch(/already listed/i);
  });

  it("rejects invalid weekly day-of-week values", () => {
    const errors = validateAutomationFormState(intl, {
      ...createAutomationFormStateFromSettings(DEFAULT_GITHUB_REPOSITORY_AUTOMATION_SETTINGS),
      pushSourceEnabled: true,
      pushSourceProjectId: "project-1",
      triggerMode: "scheduled",
      scheduledCadence: "weekly",
      scheduledDayOfWeek: 7,
    });

    expect(errors.scheduledDayOfWeek).toBeTruthy();
  });
});
