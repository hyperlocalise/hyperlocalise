import { beforeEach, describe, expect, it } from "vite-plus/test";

import { clearAgentManifestCache } from "@/agents/_runtime/loader";

import {
  buildConversationSkillPlan,
  isConversationSkillActivated,
  listConversationSkills,
  parseConversationSkillMetadata,
} from "./conversation-skill-registry";

describe("conversation skill registry", () => {
  beforeEach(() => {
    clearAgentManifestCache();
  });

  it("loads crowdin-tms-read metadata from skill frontmatter", () => {
    const crowdinSkill = listConversationSkills().find((skill) => skill.id === "crowdin-tms-read");

    expect(crowdinSkill).toEqual({
      id: "crowdin-tms-read",
      always: false,
      activationIntents: ["translation"],
      excludeIntents: ["repository"],
      requiresFileAttachments: undefined,
      requiresNoFileAttachments: true,
      tools: [
        "list_projects",
        "get_project_context",
        "update_interaction_project",
        "check_crowdin_progress",
      ],
      sharedSkills: ["crowdin"],
      delegate: false,
    });
  });

  it("treats orchestration and repository-handoff as always-on base skills", () => {
    const alwaysSkills = listConversationSkills().filter((skill) => skill.always);

    expect(alwaysSkills.map((skill) => skill.id)).toEqual(
      expect.arrayContaining(["orchestration", "repository-handoff"]),
    );
  });

  it("activates crowdin-tms-read for translation-only requests without attachments", () => {
    const crowdinSkill = listConversationSkills().find((skill) => skill.id === "crowdin-tms-read");
    expect(crowdinSkill).toBeDefined();

    expect(
      isConversationSkillActivated(crowdinSkill!, {
        suggestedIntents: ["translation"],
        hasFileAttachments: false,
      }),
    ).toBe(true);
  });

  it("does not activate crowdin-tms-read when repository intent is present", () => {
    const crowdinSkill = listConversationSkills().find((skill) => skill.id === "crowdin-tms-read");
    expect(crowdinSkill).toBeDefined();

    expect(
      isConversationSkillActivated(crowdinSkill!, {
        suggestedIntents: ["translation", "repository"],
        hasFileAttachments: false,
      }),
    ).toBe(false);
  });

  it("builds a direct-tool plan for translation-only Crowdin requests", () => {
    const plan = buildConversationSkillPlan({
      suggestedIntents: ["translation"],
      hasFileAttachments: false,
    });

    expect(plan.instructionSkillIds).toEqual([
      "orchestration",
      "repository-handoff",
      "crowdin-tms-read",
    ]);
    expect(plan.sharedSkillIds).toEqual(["crowdin"]);
    expect(plan.toolNames).toEqual([
      "list_projects",
      "get_project_context",
      "update_interaction_project",
      "check_crowdin_progress",
    ]);
    expect(plan.skipDelegation).toBe(true);
  });

  it("parses comma-separated frontmatter values", () => {
    expect(
      parseConversationSkillMetadata({
        id: "test",
        frontmatter: {
          activationIntents: "translation, repository",
          tools: "list_projects, check_crowdin_progress",
          delegate: "false",
        },
        body: "",
      }),
    ).toMatchObject({
      activationIntents: ["translation", "repository"],
      tools: ["list_projects", "check_crowdin_progress"],
      delegate: false,
    });
  });
});
