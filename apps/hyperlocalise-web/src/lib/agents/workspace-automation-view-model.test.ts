import { describe, expect, it } from "vite-plus/test";

import { getWorkspaceAutomationTemplate } from "./workspace-automation-templates";
import {
  createDefaultWorkspaceAutomationFormState,
  createWorkspaceAutomationFormStateFromTemplate,
  formStateToWorkspaceAutomationPayload,
  validateWorkspaceAutomationFormState,
} from "./workspace-automation-view-model";

describe("workspace automation view model", () => {
  it("prefills the form from a template", () => {
    const template = getWorkspaceAutomationTemplate("validate-localisation-on-push");
    expect(template).not.toBeNull();

    const form = createWorkspaceAutomationFormStateFromTemplate("validate-localisation-on-push");
    expect(form).toMatchObject({
      name: "Validate localisation on push",
      triggerMode: "github",
      pushBranches: ["main"],
      githubEnabled: true,
      validationEnabled: true,
      slackEnabled: true,
    });
    expect(form?.instructions).toContain("localisation quality automation");
  });

  it("does not prefill coming-soon templates", () => {
    expect(getWorkspaceAutomationTemplate("create-localisation-job-brief")?.activatable).toBe(
      false,
    );
    expect(createWorkspaceAutomationFormStateFromTemplate("create-localisation-job-brief")).toBe(
      null,
    );
  });

  it("maps form state to API payload", () => {
    const form = {
      ...createDefaultWorkspaceAutomationFormState(),
      name: "Nightly validation",
      instructions: "Validate repository changes.",
      triggerMode: "scheduled" as const,
      githubEnabled: true,
      githubInstallationRepositoryId: "11111111-1111-4111-8111-111111111111",
      githubProjectId: "project-1",
      validationEnabled: true,
      slackEnabled: true,
      slackChannelId: "C123",
      emailEnabled: true,
      emailRecipients: ["ops@example.com"],
    };

    expect(validateWorkspaceAutomationFormState(form)).toEqual({});
    const payload = formStateToWorkspaceAutomationPayload(form);
    expect(payload.triggerConfig.mode).toBe("scheduled");
    expect(payload.repositoryTarget).toEqual({
      kind: "github",
      githubInstallationRepositoryId: "11111111-1111-4111-8111-111111111111",
    });
    expect(payload.toolConfig.github).toMatchObject({
      enabled: true,
      projectId: "project-1",
      validation: true,
    });
    expect(payload.toolConfig.slack).toEqual({
      enabled: true,
      channelId: "C123",
    });
    expect(payload.toolConfig.email).toEqual({
      enabled: true,
      recipients: ["ops@example.com"],
    });
  });
});
