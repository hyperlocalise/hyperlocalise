import { describe, expect, it } from "vite-plus/test";

import { mergeWorkspaceTemplateSkills } from "@/agents/automations/workspace/agent/workspace-template-manifest";

import {
  getWorkspaceAutomationTemplate,
  WORKSPACE_AUTOMATION_TEMPLATES_BASE,
} from "./workspace-automation-templates";
import {
  createDefaultWorkspaceAutomationFormState,
  createWorkspaceAutomationFormStateFromTemplate,
  formStateToWorkspaceAutomationPayload,
  validateWorkspaceAutomationFormState,
} from "./workspace-automation-view-model";

const mergedTemplates = mergeWorkspaceTemplateSkills(WORKSPACE_AUTOMATION_TEMPLATES_BASE);

describe("workspace automation view model", () => {
  it("prefills the form from a template", () => {
    const template = getWorkspaceAutomationTemplate(
      "validate-localisation-on-push",
      mergedTemplates,
    );
    expect(template).not.toBeNull();

    const form = createWorkspaceAutomationFormStateFromTemplate(
      "validate-localisation-on-push",
      mergedTemplates,
    );
    expect(form).toMatchObject({
      name: "Validate localisation on push",
      triggerMode: "github",
      pushBranches: ["main"],
      githubEnabled: true,
      validationEnabled: true,
      slackEnabled: true,
    });
    expect(form?.instructions).toContain("protected branches");
  });

  it("does not prefill coming-soon templates", () => {
    expect(
      getWorkspaceAutomationTemplate("create-localisation-job-brief", mergedTemplates)?.activatable,
    ).toBe(false);
    expect(
      createWorkspaceAutomationFormStateFromTemplate(
        "create-localisation-job-brief",
        mergedTemplates,
      ),
    ).toBe(null);
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

  it("prefills the Contentful translation template", () => {
    const form = createWorkspaceAutomationFormStateFromTemplate(
      "translate-contentful-article",
      mergedTemplates,
    );

    expect(form).toMatchObject({
      name: "Translate Contentful article",
      triggerMode: "contentful",
      contentfulEnabled: true,
      contentfulRunQa: true,
      contentfulWriteDrafts: true,
    });
    expect(form?.instructions).toContain("Contentful help center article");
  });

  it("maps Contentful tool settings to API payload", () => {
    const form = {
      ...createDefaultWorkspaceAutomationFormState(),
      name: "Translate Contentful updates",
      instructions: "Translate updates.",
      triggerMode: "contentful" as const,
      contentfulEnabled: true,
      contentfulConnectionId: "11111111-1111-4111-8111-111111111111",
      contentfulProjectId: "project-1",
      contentfulSourceLocale: "de-DE",
      contentfulTargetLocales: ["fr-FR", "de-DE"],
      contentfulContentTypeIds: ["helpCenterArticle"],
      contentfulRunQa: true,
      contentfulWriteDrafts: true,
    };

    expect(validateWorkspaceAutomationFormState(form)).toEqual({});
    const payload = formStateToWorkspaceAutomationPayload(form);
    expect(payload.triggerConfig).toEqual({ mode: "contentful" });
    expect(payload.toolConfig.contentful).toMatchObject({
      enabled: true,
      connectionId: "11111111-1111-4111-8111-111111111111",
      projectId: "project-1",
      sourceLocale: "de-DE",
      targetLocales: ["fr-FR", "de-DE"],
      contentTypeIds: ["helpCenterArticle"],
      runQa: true,
      writeDrafts: true,
    });
  });

  it("requires Contentful connection, project, and locales when enabled", () => {
    const form = {
      ...createDefaultWorkspaceAutomationFormState(),
      contentfulEnabled: true,
    };

    expect(validateWorkspaceAutomationFormState(form)).toMatchObject({
      contentfulConnectionId: "Choose a Contentful connection.",
      contentfulProjectId: "Choose a Hyperlocalise project.",
      contentfulTargetLocales: "Add at least one target locale.",
    });
  });
});
