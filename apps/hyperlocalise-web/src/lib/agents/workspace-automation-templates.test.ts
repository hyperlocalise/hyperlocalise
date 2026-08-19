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

import {
  formatWorkspaceAutomationTemplateInstructions,
  getWorkspaceAutomationTemplate,
  getWorkspaceAutomationTemplateFlow,
  WORKSPACE_AUTOMATION_TEMPLATES_BASE,
} from "./workspace-automation-templates";

describe("workspace automation templates", () => {
  it("formats who, capabilities, and goal into customer instructions", () => {
    expect(
      formatWorkspaceAutomationTemplateInstructions({
        role: "a localisation research analyst",
        capabilities: ["Search the live web", "Cite sources"],
        goal: "Post a sourced brief.",
        extraSections: [{ heading: "Research focus", items: ["Competitor shipping"] }],
      }),
    ).toBe(
      [
        "You are a localisation research analyst.",
        "",
        "What you can do:",
        "",
        "- Search the live web",
        "- Cite sources",
        "",
        "Goal:",
        "",
        "- Post a sourced brief.",
        "",
        "Research focus:",
        "",
        "- Competitor shipping",
      ].join("\n"),
    );
  });

  it("gives every gallery template a who, capabilities, and goal section", () => {
    for (const template of WORKSPACE_AUTOMATION_TEMPLATES_BASE) {
      expect(template.instructions, template.id).toContain("You are ");
      expect(template.instructions, template.id).toContain("What you can do:");
      expect(template.instructions, template.id).toContain("Goal:");
    }
  });

  it("only activates templates that have been tested", () => {
    expect(
      WORKSPACE_AUTOMATION_TEMPLATES_BASE.filter((template) => template.activatable).map(
        (template) => template.id,
      ),
    ).toEqual([
      "translate-on-source-upload",
      "translate-contentful-article",
      "summarize-changes-daily",
      "review-code-daily",
      "daily-web-research",
      "notify-on-push-blockers",
    ]);
  });

  it("exposes an activatable source-upload translation template", () => {
    const template = getWorkspaceAutomationTemplate(
      "translate-on-source-upload",
      WORKSPACE_AUTOMATION_TEMPLATES_BASE,
    );

    expect(template).toMatchObject({
      id: "translate-on-source-upload",
      category: "popular",
      activatable: true,
      defaultForm: {
        triggerMode: "source_upload",
        createNativeTmsJobEnabled: true,
        createNativeTmsJobUseProjectTargetLocales: true,
        assignTranslateWithAgentEnabled: true,
      },
    });
  });

  it("builds the source-upload template flow with create job and translate tools", () => {
    const template = getWorkspaceAutomationTemplate(
      "translate-on-source-upload",
      WORKSPACE_AUTOMATION_TEMPLATES_BASE,
    );
    expect(template).not.toBeNull();

    expect(getWorkspaceAutomationTemplateFlow(template!)).toEqual({
      trigger: { id: "source-upload", label: "Source upload" },
      tools: [
        { id: "create-job", label: "Create job" },
        { id: "translate-with-agent", label: "Translate with agent" },
      ],
    });
  });

  it("exposes an activatable daily localisation digest template", () => {
    const template = getWorkspaceAutomationTemplate(
      "summarize-changes-daily",
      WORKSPACE_AUTOMATION_TEMPLATES_BASE,
    );

    expect(template).toMatchObject({
      id: "summarize-changes-daily",
      category: "popular",
      activatable: true,
      defaultForm: {
        triggerMode: "scheduled",
        scheduledCadence: "daily",
        githubEnabled: true,
        githubMode: "agent",
        slackEnabled: true,
      },
    });
    expect(template?.instructions).toContain("You are a daily localisation briefing agent");
    expect(template?.instructions).toContain("Digest focus:");
    expect(template?.instructions).toContain("last 24 hours");
    expect(template?.instructions).toContain("i18n.yml");
    expect(getWorkspaceAutomationTemplateFlow(template!)).toEqual({
      trigger: { id: "scheduled", label: "Daily" },
      tools: [
        { id: "github", label: "GitHub" },
        { id: "slack", label: "Slack" },
      ],
    });
  });

  it("exposes an activatable daily code-review template", () => {
    const template = getWorkspaceAutomationTemplate(
      "review-code-daily",
      WORKSPACE_AUTOMATION_TEMPLATES_BASE,
    );

    expect(template).toMatchObject({
      id: "review-code-daily",
      category: "popular",
      activatable: true,
      defaultForm: {
        triggerMode: "scheduled",
        scheduledCadence: "daily",
        githubEnabled: true,
        githubMode: "agent",
        slackEnabled: true,
      },
    });
    expect(template?.instructions).toContain("You are a localisation-focused code reviewer");
    expect(template?.instructions).toContain("Review scope");
    expect(template?.instructions).toContain("Translation review");
    expect(template?.instructions).toContain("Slack delivery");
    expect(template?.instructions).toContain("last 24 hours");
    expect(template?.instructions).toContain("i18n.yml");
    expect(getWorkspaceAutomationTemplateFlow(template!)).toEqual({
      trigger: { id: "scheduled", label: "Daily" },
      tools: [
        { id: "github", label: "GitHub" },
        { id: "slack", label: "Slack" },
      ],
    });
  });

  it("exposes an activatable daily web-research template", () => {
    const template = getWorkspaceAutomationTemplate(
      "daily-web-research",
      WORKSPACE_AUTOMATION_TEMPLATES_BASE,
    );

    expect(template).toMatchObject({
      id: "daily-web-research",
      category: "popular",
      activatable: true,
      defaultForm: {
        triggerMode: "scheduled",
        scheduledCadence: "daily",
        webSearchEnabled: true,
        webSearchProvider: "auto",
        slackEnabled: true,
      },
    });
    expect(getWorkspaceAutomationTemplateFlow(template!)).toEqual({
      trigger: { id: "scheduled", label: "Daily" },
      tools: [
        { id: "slack", label: "Slack" },
        { id: "web-search", label: "Web Search" },
      ],
    });
  });

  it("exposes an activatable push localisation-review template", () => {
    const template = getWorkspaceAutomationTemplate(
      "notify-on-push-blockers",
      WORKSPACE_AUTOMATION_TEMPLATES_BASE,
    );

    expect(template).toMatchObject({
      id: "notify-on-push-blockers",
      category: "popular",
      activatable: true,
      defaultForm: {
        triggerMode: "github",
        pushBranches: ["main"],
        githubEvents: ["pull_request"],
        githubEnabled: true,
        githubMode: "agent",
        githubCommentEnabled: true,
        validationEnabled: false,
      },
    });
    expect(template?.defaultForm.slackEnabled).toBeUndefined();
    expect(template?.instructions).toContain("You are a localisation-focused code reviewer");
    expect(template?.instructions).toContain("sticky GitHub pull request comment");
    expect(template?.instructions).toContain("Review focus:");
    expect(template?.instructions).toContain("i18n.yml");
    expect(getWorkspaceAutomationTemplateFlow(template!)).toEqual({
      trigger: { id: "github-pull-request", label: "GitHub pull request" },
      tools: [
        { id: "github", label: "GitHub" },
        { id: "github-comment", label: "GitHub comment" },
      ],
    });
  });
});
