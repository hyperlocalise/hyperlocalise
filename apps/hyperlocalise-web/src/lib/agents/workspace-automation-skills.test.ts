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

import { getAgentManifest, loadSharedSkill } from "@/agents/_runtime/loader";
import { WORKSPACE_ORCHESTRATOR_TOOL_NAMES } from "@/agents/automations/workspace/agent/plan";

import {
  listWorkspaceAutomationSkillNamesByTool,
  listWorkspaceAutomationSkillTools,
  resolveWorkspaceAutomationSkills,
  WORKSPACE_AUTOMATION_SKILLS,
  workspaceAutomationSkillToolEnabled,
} from "./workspace-automation-skills";

describe("workspace automation skills", () => {
  it("has unique ids", () => {
    const ids = WORKSPACE_AUTOMATION_SKILLS.map((skill) => skill.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it.each(WORKSPACE_AUTOMATION_SKILLS.map((skill) => [skill.id, skill] as const))(
    "%s has a procedure, orchestrator tools, triggers and shared skills that exist",
    (_id, skill) => {
      const procedure = getAgentManifest({ automationId: "workspace" }).skills[skill.id];
      expect(procedure?.body.trim()).toBeTruthy();
      expect(skill.tools.length).toBeGreaterThan(0);
      expect(skill.triggers.length).toBeGreaterThan(0);
      for (const tool of skill.tools) {
        expect(WORKSPACE_ORCHESTRATOR_TOOL_NAMES).toContain(tool);
      }
      for (const sharedSkill of skill.sharedSkills) {
        expect(loadSharedSkill(sharedSkill)).toBeTruthy();
      }
    },
  );

  it("resolves known skills once and drops unknown ids", () => {
    expect(
      resolveWorkspaceAutomationSkills(["post-to-slack", "missing", "post-to-slack"]).map(
        (skill) => skill.id,
      ),
    ).toEqual(["post-to-slack"]);
  });

  it("names the attached skills that need each tool", () => {
    const namesByTool = listWorkspaceAutomationSkillNamesByTool([
      "review-translation-changes",
      "summarize-localisation-changes",
      "post-to-slack",
    ]);

    expect(namesByTool.get("use_github_repository")).toEqual([
      "Review translation changes",
      "Summarise localisation changes",
    ]);
    expect(namesByTool.get("notify_slack")).toEqual(["Post results to Slack"]);
    expect(namesByTool.get("notify_email")).toBeUndefined();
  });

  it("marks only the email skill as risky", () => {
    expect(
      WORKSPACE_AUTOMATION_SKILLS.filter((skill) => skill.risk).map((skill) => skill.id),
    ).toEqual(["email-results"]);
  });

  it("lists the tools of several skills without duplicates", () => {
    expect(
      listWorkspaceAutomationSkillTools([
        "review-translation-changes",
        "summarize-localisation-changes",
        "post-to-slack",
      ]),
    ).toEqual(["use_github_repository", "notify_slack"]);
  });

  it("treats the GitHub repository tool as enabled only in agent mode", () => {
    const github = { enabled: true, pushSource: false, pullTranslations: false, validation: true };
    expect(
      workspaceAutomationSkillToolEnabled("use_github_repository", {
        github: { ...github, mode: "sync" },
      }),
    ).toBe(false);
    expect(
      workspaceAutomationSkillToolEnabled("use_github_repository", {
        github: { ...github, mode: "agent" },
      }),
    ).toBe(true);
  });
});
