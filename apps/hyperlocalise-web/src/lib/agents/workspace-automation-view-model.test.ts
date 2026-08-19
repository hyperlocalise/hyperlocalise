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
import { createAutomationSummary } from "@/app/[lang]/(authenticated)/org/[organizationSlug]/automations/_components/automations.fixture";

import {
  getWorkspaceAutomationTemplate,
  WORKSPACE_AUTOMATION_TEMPLATES_BASE,
} from "./workspace-automation-templates";
import {
  createDefaultWorkspaceAutomationFormState,
  createWorkspaceAutomationFormStateFromRecord,
  createWorkspaceAutomationFormStateFromTemplate,
  formStateToWorkspaceAutomationPayload,
  mapWorkspaceAutomationApiErrorToFieldErrors,
  selectableAutomationRepositories,
  validateWorkspaceAutomationFormState,
  workspaceAutomationFormHasChanges,
  workspaceAutomationFormSupportsOnDemandRun,
} from "./workspace-automation-view-model";

const mergedTemplates = mergeWorkspaceTemplateSkills(WORKSPACE_AUTOMATION_TEMPLATES_BASE);

describe("workspace automation view model", () => {
  it("prefills the form from a template", () => {
    const template = getWorkspaceAutomationTemplate("translate-on-source-upload", mergedTemplates);
    expect(template).not.toBeNull();

    const form = createWorkspaceAutomationFormStateFromTemplate(
      "translate-on-source-upload",
      mergedTemplates,
    );
    expect(form).toMatchObject({
      name: "Translate on source upload",
      triggerMode: "source_upload",
      createNativeTmsJobEnabled: true,
      assignTranslateWithAgentEnabled: true,
    });
    expect(form?.instructions).toContain("You are a native TMS intake agent");
  });

  it("does not prefill coming-soon templates", () => {
    expect(
      getWorkspaceAutomationTemplate("validate-localisation-on-push", mergedTemplates)?.activatable,
    ).toBe(false);
    expect(
      createWorkspaceAutomationFormStateFromTemplate(
        "validate-localisation-on-push",
        mergedTemplates,
      ),
    ).toBe(null);
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
      slackChannelId: "C01234567",
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
      channelId: "C01234567",
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
      allowUpdates: false,
    });
  });

  it("maps knowledgeAllowUpdates into the API payload alongside knowledgeEnabled", () => {
    const form = {
      ...createDefaultWorkspaceAutomationFormState(),
      name: "Memory-writing sync",
      instructions: "Remember reviewer preferences.",
      githubEnabled: true,
      githubMode: "agent" as const,
      githubInstallationRepositoryId: "11111111-1111-4111-8111-111111111111",
      knowledgeEnabled: true,
      knowledgeAllowUpdates: true,
    };

    expect(formStateToWorkspaceAutomationPayload(form).toolConfig.knowledge).toEqual({
      enabled: true,
      allowUpdates: true,
    });
  });

  it("never serializes allowUpdates as true when knowledge itself is disabled", () => {
    // Defense in depth: a stale/inconsistent form state (allowUpdates true but enabled false)
    // must not leak through to the API payload — the UI keeps these in sync, but the serializer
    // doesn't trust that alone.
    const form = {
      ...createDefaultWorkspaceAutomationFormState(),
      name: "Inconsistent state",
      githubEnabled: true,
      githubMode: "agent" as const,
      githubInstallationRepositoryId: "11111111-1111-4111-8111-111111111111",
      knowledgeEnabled: false,
      knowledgeAllowUpdates: true,
    };

    expect(formStateToWorkspaceAutomationPayload(form).toolConfig.knowledge).toBeUndefined();
  });

  it("hydrates knowledgeAllowUpdates from an existing automation record", () => {
    const state = createWorkspaceAutomationFormStateFromRecord({
      ...createAutomationSummary(),
      toolConfig: { knowledge: { enabled: true, allowUpdates: true } },
    });

    expect(state.knowledgeEnabled).toBe(true);
    expect(state.knowledgeAllowUpdates).toBe(true);
  });

  it("hydrates Web Search provider from an existing automation record", () => {
    const state = createWorkspaceAutomationFormStateFromRecord({
      ...createAutomationSummary(),
      toolConfig: { webSearch: { enabled: true, provider: "exa" } },
    });

    expect(state.webSearchEnabled).toBe(true);
    expect(state.webSearchProvider).toBe("exa");
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
    expect(form?.instructions).toContain("You are a Contentful localisation editor");
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
    expect(form?.instructions).toContain("You are a daily localisation briefing agent");
    expect(form?.instructions).toContain("Digest focus:");
  });

  it("prefills the daily code-review template", () => {
    const form = createWorkspaceAutomationFormStateFromTemplate(
      "review-code-daily",
      mergedTemplates,
    );

    expect(form).toMatchObject({
      name: "Review code daily",
      triggerMode: "scheduled",
      scheduledCadence: "daily",
      githubEnabled: true,
      githubMode: "agent",
      slackEnabled: true,
      webSearchEnabled: false,
    });
    expect(form?.instructions).toContain("You are a localisation-focused code reviewer");
    expect(form?.instructions).toContain(
      "Code-layer review focus (in addition to translation review):",
    );
    expect(
      validateWorkspaceAutomationFormState({
        ...form!,
        githubInstallationRepositoryId: "11111111-1111-4111-8111-111111111111",
        slackChannelId: "C01234567",
      }),
    ).toEqual({});
  });

  it("prefills the daily web-research template", () => {
    const form = createWorkspaceAutomationFormStateFromTemplate(
      "daily-web-research",
      mergedTemplates,
    );

    expect(form).toMatchObject({
      name: "Daily web research",
      triggerMode: "scheduled",
      scheduledCadence: "daily",
      webSearchEnabled: true,
      webSearchProvider: "auto",
      slackEnabled: true,
      githubEnabled: false,
    });
    expect(form?.instructions).toContain("You are a localisation research analyst");
    expect(formStateToWorkspaceAutomationPayload(form!).toolConfig.webSearch).toEqual({
      enabled: true,
      provider: "auto",
    });
  });

  it("prefills the notify on push blockers template", () => {
    const form = createWorkspaceAutomationFormStateFromTemplate(
      "notify-on-push-blockers",
      mergedTemplates,
    );

    expect(form).toMatchObject({
      name: "Notify on push blockers",
      triggerMode: "github",
      pushBranches: ["main"],
      githubEnabled: true,
      githubMode: "agent",
      githubCommentEnabled: true,
      slackEnabled: false,
      validationEnabled: false,
    });
    expect(form?.instructions).toContain("You are a localisation-focused code reviewer");
    expect(form?.instructions).toContain(
      "Code-layer review focus (in addition to translation review):",
    );
    expect(
      validateWorkspaceAutomationFormState({
        ...form!,
        githubInstallationRepositoryId: "11111111-1111-4111-8111-111111111111",
      }),
    ).toEqual({});
    expect(formStateToWorkspaceAutomationPayload(form!).toolConfig.githubComment).toEqual({
      enabled: true,
    });
  });

  it("allows GitHub agent mode with a GitHub push trigger", () => {
    const form = {
      ...createDefaultWorkspaceAutomationFormState(),
      name: "Notify on push blockers",
      instructions: "Review localisation risk on this push.",
      triggerMode: "github" as const,
      pushBranches: ["main"],
      githubEnabled: true,
      githubMode: "agent" as const,
      githubInstallationRepositoryId: "11111111-1111-4111-8111-111111111111",
      githubCommentEnabled: true,
    };

    expect(validateWorkspaceAutomationFormState(form)).toEqual({});
    expect(formStateToWorkspaceAutomationPayload(form)).toMatchObject({
      triggerConfig: { mode: "github", branches: ["main"] },
      repositoryTarget: {
        kind: "github",
        githubInstallationRepositoryId: "11111111-1111-4111-8111-111111111111",
      },
      toolConfig: {
        github: {
          enabled: true,
          mode: "agent",
          pushSource: false,
          pullTranslations: false,
          validation: false,
        },
        githubComment: { enabled: true },
      },
    });
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

  it("maps source upload create job and translate-with-agent tools to API payload", () => {
    const form = {
      ...createDefaultWorkspaceAutomationFormState(),
      name: "Translate uploads",
      instructions: "Queue jobs after each upload.",
      triggerMode: "source_upload" as const,
      projectId: "project-1",
      createNativeTmsJobEnabled: true,
      createNativeTmsJobUseProjectTargetLocales: true,
      assignTranslateWithAgentEnabled: true,
    };

    expect(validateWorkspaceAutomationFormState(form)).toEqual({});
    const payload = formStateToWorkspaceAutomationPayload(form);
    expect(payload.projectId).toBe("project-1");
    expect(payload.triggerConfig).toEqual({ mode: "source_upload" });
    expect(payload.toolConfig.createNativeTmsJob).toEqual({
      enabled: true,
      useProjectTargetLocales: true,
      targetLocales: [],
    });
    expect(payload.toolConfig.assignTranslateWithAgent).toEqual({
      enabled: true,
    });
    expect(payload.toolConfig.createNativeTmsJob).not.toHaveProperty("projectId");
  });

  it("maps list and create issue tools to API payload and requires a project", () => {
    const form = {
      ...createDefaultWorkspaceAutomationFormState(),
      name: "Triage issues",
      instructions: "List open issues and file new findings.",
      listIssuesEnabled: true,
      createIssueEnabled: true,
    };

    expect(validateWorkspaceAutomationFormState(form)).toMatchObject({
      projectId: "Choose a Hyperlocalise project.",
    });

    const readyForm = { ...form, projectId: "project-1" };
    expect(validateWorkspaceAutomationFormState(readyForm)).toEqual({});
    expect(formStateToWorkspaceAutomationPayload(readyForm).toolConfig).toEqual({
      listIssues: { enabled: true },
      createIssue: { enabled: true },
    });
  });

  it("prefills and maps the translate-on-source-upload template", () => {
    const form = createWorkspaceAutomationFormStateFromTemplate(
      "translate-on-source-upload",
      mergedTemplates,
    );
    expect(form).toMatchObject({
      name: "Translate on source upload",
      triggerMode: "source_upload",
      createNativeTmsJobEnabled: true,
      createNativeTmsJobUseProjectTargetLocales: true,
      assignTranslateWithAgentEnabled: true,
    });
    expect(form?.instructions).toContain("Translate with agent");

    const readyForm = {
      ...form!,
      projectId: "project-1",
    };
    expect(validateWorkspaceAutomationFormState(readyForm)).toEqual({});
    expect(formStateToWorkspaceAutomationPayload(readyForm)).toMatchObject({
      projectId: "project-1",
      triggerConfig: { mode: "source_upload" },
      toolConfig: {
        createNativeTmsJob: {
          enabled: true,
          useProjectTargetLocales: true,
          targetLocales: [],
        },
        assignTranslateWithAgent: {
          enabled: true,
        },
      },
    });
  });

  it("requires Create job when source upload trigger is selected", () => {
    const form = {
      ...createDefaultWorkspaceAutomationFormState(),
      triggerMode: "source_upload" as const,
    };

    expect(validateWorkspaceAutomationFormState(form)).toMatchObject({
      trigger: "Source upload triggers require Create job to be enabled.",
    });
  });

  it("requires Create job when Translate with agent is enabled alone", () => {
    const form = {
      ...createDefaultWorkspaceAutomationFormState(),
      assignTranslateWithAgentEnabled: true,
    };

    expect(validateWorkspaceAutomationFormState(form)).toMatchObject({
      form: "Translate with agent requires Create job to be enabled.",
    });
  });

  it("maps Web Search provider into the API payload", () => {
    const form = {
      ...createDefaultWorkspaceAutomationFormState(),
      name: "Market research",
      instructions: "Search live SERPs for the target market.",
      webSearchEnabled: true,
      webSearchProvider: "perplexity" as const,
    };

    expect(validateWorkspaceAutomationFormState(form)).toEqual({});
    expect(formStateToWorkspaceAutomationPayload(form).toolConfig).toEqual({
      webSearch: { enabled: true, provider: "perplexity" },
    });
  });

  it("requires Semrush and Ahrefs connection IDs when those tools are enabled", () => {
    const form = {
      ...createDefaultWorkspaceAutomationFormState(),
      semrushEnabled: true,
      ahrefsEnabled: true,
    };

    expect(validateWorkspaceAutomationFormState(form)).toMatchObject({
      semrushConnectionId: "Choose a Semrush connection.",
      ahrefsConnectionId: "Choose an Ahrefs connection.",
    });
  });

  it("maps Semrush and Ahrefs API errors onto connection fields", () => {
    expect(mapWorkspaceAutomationApiErrorToFieldErrors("semrush_connection_required")).toEqual({
      semrushConnectionId: "Choose a Semrush connection.",
    });
    expect(mapWorkspaceAutomationApiErrorToFieldErrors("semrush_connection_not_found")).toEqual({
      semrushConnectionId:
        "The selected Semrush connection was not found. Choose another connection.",
    });
    expect(mapWorkspaceAutomationApiErrorToFieldErrors("semrush_not_connected")).toEqual({
      semrushConnectionId:
        "Enable the selected Semrush connection in Integrations before using it.",
    });
    expect(mapWorkspaceAutomationApiErrorToFieldErrors("ahrefs_connection_required")).toEqual({
      ahrefsConnectionId: "Choose an Ahrefs connection.",
    });
    expect(mapWorkspaceAutomationApiErrorToFieldErrors("ahrefs_connection_not_found")).toEqual({
      ahrefsConnectionId:
        "The selected Ahrefs connection was not found. Choose another connection.",
    });
    expect(mapWorkspaceAutomationApiErrorToFieldErrors("ahrefs_not_connected")).toEqual({
      ahrefsConnectionId: "Enable the selected Ahrefs connection in Integrations before using it.",
    });
  });

  it("requires a Crowdin project when the Crowdin tool is enabled", () => {
    const form = {
      ...createDefaultWorkspaceAutomationFormState(),
      crowdinEnabled: true,
    };

    expect(validateWorkspaceAutomationFormState(form)).toMatchObject({
      crowdinProjectId: "Choose a Crowdin-linked project.",
    });
  });

  it("maps Crowdin API errors onto the Crowdin project field", () => {
    expect(mapWorkspaceAutomationApiErrorToFieldErrors("crowdin_project_required")).toEqual({
      crowdinProjectId: "Choose a Crowdin-linked project for Crowdin review.",
    });
    expect(mapWorkspaceAutomationApiErrorToFieldErrors("crowdin_project_not_found")).toEqual({
      crowdinProjectId: "The selected Crowdin project was not found. Choose another project.",
    });
    expect(mapWorkspaceAutomationApiErrorToFieldErrors("crowdin_project_not_linked")).toEqual({
      crowdinProjectId: "The selected project is not linked to Crowdin. Choose a Crowdin project.",
    });
    expect(mapWorkspaceAutomationApiErrorToFieldErrors("crowdin_not_connected")).toEqual({
      crowdinProjectId: "Connect Crowdin in Integrations before using Crowdin review tools.",
    });
  });

  it("maps Crowdin project into the API payload", () => {
    const form = {
      ...createDefaultWorkspaceAutomationFormState(),
      name: "Code review",
      instructions: "Review strings against Crowdin.",
      crowdinEnabled: true,
      crowdinProjectId: "ext:crowdin:42",
    };

    expect(validateWorkspaceAutomationFormState(form)).toEqual({});
    expect(formStateToWorkspaceAutomationPayload(form).toolConfig).toEqual({
      crowdin: { enabled: true, projectId: "ext:crowdin:42" },
    });
  });

  it("offers only enabled repositories, keeping a selected disabled repository visible", () => {
    const repositories = [
      { id: "enabled", fullName: "acme/web", enabled: true, archived: false },
      { id: "disabled", fullName: "acme/old", enabled: false, archived: false },
      { id: "archived", fullName: "acme/archive", enabled: true, archived: true },
    ];

    expect(
      selectableAutomationRepositories(repositories).map((repository) => repository.id),
    ).toEqual(["enabled"]);
    expect(
      selectableAutomationRepositories(repositories, "disabled").map((repository) => repository.id),
    ).toEqual(["enabled", "disabled"]);
  });

  it("shows on-demand runs for scheduled and manual triggers only", () => {
    expect(workspaceAutomationFormSupportsOnDemandRun("manual")).toBe(true);
    expect(workspaceAutomationFormSupportsOnDemandRun("scheduled")).toBe(true);
    expect(workspaceAutomationFormSupportsOnDemandRun("github")).toBe(false);
    expect(workspaceAutomationFormSupportsOnDemandRun("contentful")).toBe(false);
    expect(workspaceAutomationFormSupportsOnDemandRun("source_upload")).toBe(false);
  });

  it("detects unsaved automation form changes", () => {
    const saved = createWorkspaceAutomationFormStateFromRecord(createAutomationSummary());
    expect(workspaceAutomationFormHasChanges(saved, saved)).toBe(false);
    expect(workspaceAutomationFormHasChanges({ ...saved, name: "Renamed automation" }, saved)).toBe(
      true,
    );
  });
});
