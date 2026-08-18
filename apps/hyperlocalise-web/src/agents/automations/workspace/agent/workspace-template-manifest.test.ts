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

import { WORKSPACE_AUTOMATION_TEMPLATES_BASE } from "@/lib/agents/workspace-automation-templates";

import {
  getTemplateCategoryFromSkill,
  getTemplateExecutorAgent,
  mergeWorkspaceTemplateSkills,
} from "./workspace-template-manifest";

describe("workspace template manifest", () => {
  it("merges skill frontmatter and body onto base templates", () => {
    const [validateTemplate] = mergeWorkspaceTemplateSkills(
      WORKSPACE_AUTOMATION_TEMPLATES_BASE,
    ).filter((template) => template.id === "validate-localisation-on-push");

    expect(validateTemplate).toMatchObject({
      name: "Validate localisation on push",
      category: "quality",
      activatable: true,
    });
    expect(validateTemplate?.description).toBe(
      "Check localisation changes on every push and notify the team when blockers are found.",
    );
    expect(validateTemplate?.instructions).toContain("You are a localisation quality reviewer");
  });

  it("merges translate-on-source-upload skill onto the gallery template", () => {
    const [template] = mergeWorkspaceTemplateSkills(WORKSPACE_AUTOMATION_TEMPLATES_BASE).filter(
      (entry) => entry.id === "translate-on-source-upload",
    );

    expect(template).toMatchObject({
      name: "Translate on source upload",
      category: "popular",
      activatable: true,
      defaultForm: {
        triggerMode: "source_upload",
        createNativeTmsJobEnabled: true,
        createNativeTmsJobUseProjectTargetLocales: true,
        assignTranslateWithAgentEnabled: true,
      },
    });
    expect(template?.description).toContain("native translation job");
    expect(template?.instructions).toContain("You are a native TMS intake agent");
  });

  it("reads executor agent and category from skill frontmatter", () => {
    expect(getTemplateExecutorAgent("translate-contentful-article")).toBe("contentful");
    expect(getTemplateExecutorAgent("validate-localisation-on-push")).toBe("github-repository");
    expect(getTemplateExecutorAgent("translate-on-source-upload")).toBeNull();
    expect(getTemplateCategoryFromSkill("validate-localisation-on-push")).toBe("quality");
    expect(getTemplateCategoryFromSkill("translate-on-source-upload")).toBe("popular");
  });

  it("keeps summarize changes daily template content from base definition", () => {
    const [template] = mergeWorkspaceTemplateSkills(WORKSPACE_AUTOMATION_TEMPLATES_BASE).filter(
      (entry) => entry.id === "summarize-changes-daily",
    );

    expect(template).toMatchObject({
      name: "Summarize changes daily",
      category: "popular",
      activatable: true,
      defaultForm: expect.objectContaining({
        githubMode: "agent",
        triggerMode: "scheduled",
        scheduledCadence: "daily",
      }),
    });
    expect(template?.description).toContain("GitHub repository");
    expect(template?.instructions).toContain("You are a daily engineering briefing agent");
  });

  it("merges daily code-review and web-research skills onto gallery templates", () => {
    const merged = mergeWorkspaceTemplateSkills(WORKSPACE_AUTOMATION_TEMPLATES_BASE);
    const review = merged.find((entry) => entry.id === "review-code-daily");
    const research = merged.find((entry) => entry.id === "daily-web-research");

    expect(review).toMatchObject({
      name: "Review code daily",
      category: "popular",
      activatable: true,
    });
    expect(review?.instructions).toContain("You are a staff code reviewer");
    expect(research).toMatchObject({
      name: "Daily web research",
      category: "popular",
      activatable: true,
    });
    expect(research?.instructions).toContain("You are a localisation research analyst");
  });
});
