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
      "Validate localisation on every push to protected branches. Run repository checks and optional agent review when validation is enabled.",
    );
    expect(validateTemplate?.instructions).toContain("protected branches");
  });

  it("reads executor agent and category from skill frontmatter", () => {
    expect(getTemplateExecutorAgent("translate-contentful-article")).toBe("contentful");
    expect(getTemplateExecutorAgent("validate-localisation-on-push")).toBe("github-repository");
    expect(getTemplateCategoryFromSkill("validate-localisation-on-push")).toBe("quality");
  });
});
