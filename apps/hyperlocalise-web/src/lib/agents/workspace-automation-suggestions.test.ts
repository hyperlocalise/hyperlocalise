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

import { addSkillToWorkspaceAutomationForm } from "./workspace-automation-skill-form";
import {
  addSuggestedToolToWorkspaceAutomationForm,
  countWorkspaceAutomationKeywordMatches,
  MAX_WORKSPACE_AUTOMATION_SUGGESTIONS,
  suggestWorkspaceAutomationAdditions,
  type WorkspaceAutomationSuggestedToolConnections,
} from "./workspace-automation-suggestions";
import {
  createDefaultWorkspaceAutomationFormState,
  type WorkspaceAutomationFormState,
} from "./workspace-automation-view-model";

const ALL_CONNECTED: WorkspaceAutomationSuggestedToolConnections = {
  github: true,
  gitlab: true,
  semrush: true,
  ahrefs: true,
  zernio: true,
};

function formWith(
  instructions: string,
  overrides: Partial<WorkspaceAutomationFormState> = {},
): WorkspaceAutomationFormState {
  return { ...createDefaultWorkspaceAutomationFormState(), instructions, ...overrides };
}

function suggest(
  instructions: string,
  overrides: Partial<WorkspaceAutomationFormState> = {},
  connections = ALL_CONNECTED,
) {
  return suggestWorkspaceAutomationAdditions({
    form: formWith(instructions, overrides),
    connections,
  }).map((suggestion) => suggestion.key);
}

describe("workspace automation suggestions", () => {
  it("suggests nothing for empty or unrelated text", () => {
    expect(suggest("")).toEqual([]);
    expect(suggest("Be concise and friendly.")).toEqual([]);
  });

  it("suggests an item from one strong term", () => {
    expect(suggest("Post the result to Slack.")).toEqual(["skill:post-to-slack"]);
    expect(suggest("Use Crowdin to check wording.")).toEqual(["skill:check-crowdin-concordance"]);
    expect(suggest("Find backlinks for our domain.")).toEqual(["tool:ahrefs"]);
  });

  it("suggests the issue skill, not the separate Queries tools", () => {
    expect(suggest("File an issue for every blocker.")).toEqual(["skill:file-issues-for-findings"]);
    expect(suggest("Create a ticket for each issue found.")).toEqual([
      "skill:file-issues-for-findings",
    ]);
  });

  it("matches whole words in any case, with plurals and hyphens", () => {
    expect(suggest("Comment on new PRs.")).toContain("skill:comment-on-pull-request");
    expect(suggest("Plan the next sprint.")).toEqual([]);
    expect(suggest("Send an E-Mail when done.")).toEqual(["skill:email-results"]);
    expect(suggest("Flag hard-coded strings.")).toEqual(["skill:review-translation-changes"]);
    expect(suggest("Track our competitors.")).toContain("skill:research-web");
  });

  it("treats an email address and a channel name as strong signals", () => {
    expect(suggest("Send it to ops@example.com")).toEqual(["skill:email-results"]);
    expect(suggest("Post in #l10n-alerts")).toEqual(["skill:post-to-slack"]);
    expect(suggest("Fix issue #42 first")).toEqual([]);
  });

  it("needs two different weak terms when no strong term matches", () => {
    expect(suggest("Review everything carefully.")).toEqual([]);
    expect(suggest("Look at the GitHub repository.")).toEqual([]);
    expect(suggest("Review my GitHub repo every day.")).toEqual([
      "skill:review-translation-changes",
    ]);
    expect(suggest("Summarise the repo changes.")).toEqual([
      "skill:summarize-localisation-changes",
    ]);
  });

  it("puts the strongest match first and suggests several items together", () => {
    expect(
      suggest(
        "Do a translation review of each pull request and comment with missing translations.",
      ),
    ).toEqual(["skill:review-translation-changes", "skill:comment-on-pull-request"]);
    expect(suggest("Research competitors and email a digest to the team.")).toEqual([
      "skill:research-web",
      "skill:email-results",
    ]);
  });

  it("reads the automation name as well as the instructions", () => {
    expect(suggest("", { name: "Daily Slack briefing" })).toEqual(["skill:post-to-slack"]);
  });

  it("leaves out attached skills and tools that are already on", () => {
    const withSlack = addSkillToWorkspaceAutomationForm(
      formWith("Post to Slack and check Semrush search volume."),
      "post-to-slack",
    );

    expect(
      suggestWorkspaceAutomationAdditions({ form: withSlack, connections: ALL_CONNECTED }).map(
        (suggestion) => suggestion.key,
      ),
    ).toEqual(["tool:semrush"]);
    expect(suggest("Post to Slack.", { slackEnabled: true })).toEqual([]);
    expect(suggest("Check Semrush search volume.", { semrushEnabled: true })).toEqual([]);
  });

  it("still suggests a skill that shares a tool with an attached skill", () => {
    const reviewing = addSkillToWorkspaceAutomationForm(
      formWith("Also write a changelog."),
      "review-translation-changes",
    );

    expect(
      suggestWorkspaceAutomationAdditions({ form: reviewing }).map((suggestion) => suggestion.key),
    ).toEqual(["skill:summarize-localisation-changes"]);
  });

  it("marks skills that do not fit the trigger and tools that are not connected", () => {
    expect(
      suggestWorkspaceAutomationAdditions({
        form: formWith("Comment on the pull request. Check Semrush.", { triggerMode: "scheduled" }),
      }),
    ).toMatchObject([
      { key: "skill:comment-on-pull-request", availability: "trigger_mismatch" },
      { key: "tool:semrush", availability: "connect_first" },
    ]);
  });

  it("does not suggest a repository tool that conflicts with the one in use", () => {
    expect(suggest("Sync with GitLab.", { githubEnabled: true, githubMode: "agent" })).toEqual([]);
    expect(suggest("Sync with GitLab.")).toEqual(["tool:github_sync", "tool:gitlab"]);
  });

  it("skips dismissed suggestions and caps the list", () => {
    expect(
      suggestWorkspaceAutomationAdditions({
        form: formWith("Post to Slack and email me."),
        dismissed: new Set(["skill:post-to-slack"]),
      }).map((suggestion) => suggestion.key),
    ).toEqual(["skill:email-results"]);
    expect(
      suggest(
        "Research competitors, check Crowdin, post to Slack, email me, comment on the PR, sync GitLab, use Semrush and Ahrefs.",
      ),
    ).toHaveLength(MAX_WORKSPACE_AUTOMATION_SUGGESTIONS);
  });

  it("counts alternatives for the same idea once", () => {
    expect(
      countWorkspaceAutomationKeywordMatches("summary, digest and recap", {
        strong: [],
        weak: [["summary", "digest", "recap"]],
      }),
    ).toEqual({ strong: 0, weak: 1 });
  });

  it("switches a suggested tool on with defaults only where the form has no value", () => {
    expect(
      addSuggestedToolToWorkspaceAutomationForm(formWith(""), "github_sync", {
        githubInstallationRepositoryId: "repo-1",
      }),
    ).toMatchObject({
      githubEnabled: true,
      githubMode: "sync",
      repositoryTargetKind: "github",
      githubInstallationRepositoryId: "repo-1",
      validationEnabled: true,
    });
    expect(
      addSuggestedToolToWorkspaceAutomationForm(
        formWith("", { semrushConnectionId: "mine" }),
        "semrush",
        { semrushConnectionId: "other" },
      ),
    ).toMatchObject({ semrushEnabled: true, semrushConnectionId: "mine" });
    expect(
      addSuggestedToolToWorkspaceAutomationForm(formWith(""), "gitlab", {
        gitlabPathWithNamespace: "acme/web",
      }),
    ).toMatchObject({
      gitlabEnabled: true,
      repositoryTargetKind: "gitlab",
      gitlabPathWithNamespace: "acme/web",
      githubEnabled: false,
    });
  });
});
