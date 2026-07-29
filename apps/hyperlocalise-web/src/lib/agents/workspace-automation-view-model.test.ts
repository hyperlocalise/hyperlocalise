/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in this application's LICENSE file.
 *
 * Change Date: Four years after publication of the applicable version.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
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
      projectId: "project-1",
      githubEnabled: true,
      githubInstallationRepositoryId: "11111111-1111-4111-8111-111111111111",
      validationEnabled: true,
      slackEnabled: true,
      slackChannelId: "C123",
      emailEnabled: true,
      emailRecipients: ["ops@example.com"],
    };

    expect(validateWorkspaceAutomationFormState(form)).toEqual({});
    const payload = formStateToWorkspaceAutomationPayload(form);
    expect(payload.projectId).toBe("project-1");
    expect(payload.triggerConfig.mode).toBe("scheduled");
    expect(payload.repositoryTarget).toEqual({
      kind: "github",
      githubInstallationRepositoryId: "11111111-1111-4111-8111-111111111111",
    });
    expect(payload.toolConfig.github).toMatchObject({
      enabled: true,
      validation: true,
    });
    expect(payload.toolConfig.github).not.toHaveProperty("projectId");
    expect(payload.toolConfig.slack).toEqual({
      enabled: true,
      channelId: "C123",
    });
    expect(payload.toolConfig.email).toEqual({
      enabled: true,
      recipients: ["ops@example.com"],
    });
  });

  it("maps knowledge memories tool into the API payload", () => {
    const form = {
      ...createDefaultWorkspaceAutomationFormState(),
      name: "Knowledge-aware sync",
      instructions: "Follow brand guidance.",
      githubEnabled: true,
      githubMode: "agent" as const,
      githubInstallationRepositoryId: "11111111-1111-4111-8111-111111111111",
      knowledgeEnabled: true,
    };

    expect(formStateToWorkspaceAutomationPayload(form).toolConfig.knowledge).toEqual({
      enabled: true,
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

  it("prefills the summarize changes daily template", () => {
    const form = createWorkspaceAutomationFormStateFromTemplate(
      "summarize-changes-daily",
      mergedTemplates,
    );

    expect(form).toMatchObject({
      name: "Summarize changes daily",
      triggerMode: "scheduled",
      scheduledCadence: "daily",
      githubEnabled: true,
      githubMode: "agent",
      slackEnabled: true,
      pushSourceEnabled: false,
      pullTranslationsEnabled: false,
      validationEnabled: false,
    });
    expect(form?.instructions).toContain("daily engineering digest");
  });

  it("validates GitHub agent mode without a Hyperlocalise project", () => {
    const form = {
      ...createDefaultWorkspaceAutomationFormState(),
      name: "Daily digest",
      instructions: "Summarize recent commits.",
      triggerMode: "scheduled" as const,
      githubEnabled: true,
      githubMode: "agent" as const,
      githubInstallationRepositoryId: "11111111-1111-4111-8111-111111111111",
    };

    expect(validateWorkspaceAutomationFormState(form)).toEqual({});
    expect(formStateToWorkspaceAutomationPayload(form).toolConfig.github).toMatchObject({
      enabled: true,
      mode: "agent",
      pushSource: false,
      pullTranslations: false,
      validation: false,
    });
    expect(formStateToWorkspaceAutomationPayload(form).projectId).toBeUndefined();
    expect(formStateToWorkspaceAutomationPayload(form).toolConfig.github).not.toHaveProperty(
      "projectId",
    );
  });

  it("maps Contentful tool settings to API payload", () => {
    const form = {
      ...createDefaultWorkspaceAutomationFormState(),
      name: "Translate Contentful updates",
      instructions: "Translate updates.",
      triggerMode: "contentful" as const,
      projectId: "project-1",
      contentfulEnabled: true,
      contentfulConnectionId: "11111111-1111-4111-8111-111111111111",
      contentfulSourceLocale: "de-DE",
      contentfulTargetLocales: ["fr-FR", "de-DE"],
      contentfulContentTypeIds: ["helpCenterArticle"],
      contentfulRunQa: true,
      contentfulWriteDrafts: true,
    };

    expect(validateWorkspaceAutomationFormState(form)).toEqual({});
    const payload = formStateToWorkspaceAutomationPayload(form);
    expect(payload.projectId).toBe("project-1");
    expect(payload.triggerConfig).toEqual({ mode: "contentful" });
    expect(payload.toolConfig.contentful).toMatchObject({
      enabled: true,
      connectionId: "11111111-1111-4111-8111-111111111111",
      sourceLocale: "de-DE",
      targetLocales: ["fr-FR", "de-DE"],
      contentTypeIds: ["helpCenterArticle"],
      runQa: true,
      writeDrafts: true,
    });
    expect(payload.toolConfig.contentful).not.toHaveProperty("projectId");
  });

  it("requires Contentful connection, project, and locales when enabled", () => {
    const form = {
      ...createDefaultWorkspaceAutomationFormState(),
      contentfulEnabled: true,
    };

    expect(validateWorkspaceAutomationFormState(form)).toMatchObject({
      contentfulConnectionId: "Choose a Contentful connection.",
      projectId: "Choose a Hyperlocalise project.",
      contentfulTargetLocales: "Add at least one target locale.",
    });
  });

  it("maps source upload translation settings to API payload", () => {
    const form = {
      ...createDefaultWorkspaceAutomationFormState(),
      name: "Translate uploads",
      instructions: "Queue jobs after each upload.",
      triggerMode: "source_upload" as const,
      projectId: "project-1",
      translationEnabled: true,
      translationUseProjectTargetLocales: true,
    };

    expect(validateWorkspaceAutomationFormState(form)).toEqual({});
    const payload = formStateToWorkspaceAutomationPayload(form);
    expect(payload.projectId).toBe("project-1");
    expect(payload.triggerConfig).toEqual({ mode: "source_upload" });
    expect(payload.toolConfig.translation).toEqual({
      enabled: true,
      useProjectTargetLocales: true,
      targetLocales: [],
    });
    expect(payload.toolConfig.translation).not.toHaveProperty("projectId");
  });

  it("requires translation tool when source upload trigger is selected", () => {
    const form = {
      ...createDefaultWorkspaceAutomationFormState(),
      triggerMode: "source_upload" as const,
    };

    expect(validateWorkspaceAutomationFormState(form)).toMatchObject({
      trigger: "Source upload triggers require translation jobs to be enabled.",
    });
  });
});
