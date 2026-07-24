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
import { beforeEach, describe, expect, it } from "vite-plus/test";

import { clearAgentManifestCache, loadAgentSkill } from "@/agents/_runtime/loader";
import {
  buildConversationSkillPlan,
  filterAvailableConversationToolNames,
  isConversationSkillActivated,
  listConversationSkills,
  parseConversationSkillMetadata,
  toConversationSkillActivationContext,
} from "./conversation-skill-registry";

describe("conversation skill registry", () => {
  beforeEach(() => {
    clearAgentManifestCache();
  });

  it("loads the capability skills from frontmatter", () => {
    const skills = listConversationSkills();
    expect(skills.map((skill) => skill.id).sort()).toEqual(
      expect.arrayContaining([
        "conversation",
        "find-context",
        "repo-tools",
        "tms-tools",
        "translation-tools",
        "visual-mock",
      ]),
    );

    const conversationSkill = skills.find((skill) => skill.id === "conversation");
    expect(conversationSkill).toMatchObject({
      always: true,
      tools: ["list_projects", "get_project_context", "update_interaction_project"],
    });

    const tmsSkill = skills.find((skill) => skill.id === "tms-tools");
    expect(tmsSkill).toMatchObject({
      requiresTmsIntegration: true,
      tools: ["check_crowdin_progress"],
      sharedSkills: ["crowdin"],
    });

    const translationSkill = skills.find((skill) => skill.id === "translation-tools");
    expect(translationSkill).toMatchObject({
      always: true,
      tools: ["createTranslationJob", "translate_string"],
    });

    const findContextSkill = skills.find((skill) => skill.id === "find-context");
    expect(findContextSkill).toMatchObject({
      requiresSandbox: true,
      tools: [],
    });

    const repoToolsSkill = skills.find((skill) => skill.id === "repo-tools");
    expect(repoToolsSkill).toMatchObject({
      requiresSandbox: true,
      tools: ["grep", "fuzzySearch", "read", "glob", "detectRepoConfig", "gitHistory", "todoWrite"],
    });

    const visualMockSkill = skills.find((skill) => skill.id === "visual-mock");
    expect(visualMockSkill).toMatchObject({
      requiresSandbox: true,
      requiresVisualMockSkill: true,
      tools: [
        "grep",
        "fuzzySearch",
        "read",
        "glob",
        "todoWrite",
        "write",
        "applyPatch",
        "captureScreenshot",
        "fetch",
      ],
    });
  });

  it("activates tms-tools only when a TMS is integrated", () => {
    const tmsSkill = listConversationSkills().find((skill) => skill.id === "tms-tools");
    expect(tmsSkill).toBeDefined();

    expect(
      isConversationSkillActivated(
        tmsSkill!,
        toConversationSkillActivationContext({
          hasFileAttachments: false,
          hasTmsIntegration: false,
          toolContext: {
            conversationId: "conv_1",
            organizationId: "org_1",
            localUserId: "user_1",
            membershipRole: "member",
            projectId: null,
            db: {} as never,
          },
        }),
      ),
    ).toBe(false);

    expect(
      isConversationSkillActivated(
        tmsSkill!,
        toConversationSkillActivationContext({
          hasFileAttachments: false,
          hasTmsIntegration: true,
          toolContext: {
            conversationId: "conv_1",
            organizationId: "org_1",
            localUserId: "user_1",
            membershipRole: "member",
            projectId: null,
            db: {} as never,
          },
        }),
      ),
    ).toBe(true);
  });

  it("activates find-context when a sandbox is available", () => {
    const findContextSkill = listConversationSkills().find((skill) => skill.id === "find-context");
    expect(findContextSkill).toBeDefined();

    expect(
      isConversationSkillActivated(
        findContextSkill!,
        toConversationSkillActivationContext({
          hasFileAttachments: false,
          hasTmsIntegration: false,
          toolContext: {
            conversationId: "conv_1",
            organizationId: "org_1",
            localUserId: "user_1",
            membershipRole: "member",
            projectId: null,
            db: {} as never,
            sandboxId: "sbx_1",
          },
        }),
      ),
    ).toBe(true);
  });

  it("activates repo-tools when a sandbox is available", () => {
    const repoToolsSkill = listConversationSkills().find((skill) => skill.id === "repo-tools");
    expect(repoToolsSkill).toBeDefined();

    expect(
      isConversationSkillActivated(
        repoToolsSkill!,
        toConversationSkillActivationContext({
          hasFileAttachments: false,
          hasTmsIntegration: false,
          toolContext: {
            conversationId: "conv_1",
            organizationId: "org_1",
            localUserId: "user_1",
            membershipRole: "member",
            projectId: null,
            db: {} as never,
            sandboxId: "sbx_1",
          },
        }),
      ),
    ).toBe(true);
  });

  it("routes visual context requests to visual-mock in conversation skill instructions", () => {
    const conversationSkill = loadAgentSkill({
      agentId: "hyperlocalise",
      skillId: "conversation",
    });
    const visualMockSkill = loadAgentSkill({
      agentId: "hyperlocalise",
      skillId: "visual-mock",
    });

    expect(conversationSkill).toContain("Visual context / mock / screenshot");
    expect(conversationSkill).toContain("use **visual-mock** when it is enabled");
    expect(conversationSkill).toContain(
      "same What it is / Where/how it shows / Translation guidance sections as find-context",
    );
    expect(conversationSkill).toContain("for text-only context without an image request");
    expect(conversationSkill).not.toContain(
      "Prefer **visual-mock** instead when the user also asks",
    );
    expect(visualMockSkill).toContain("visual context for …");
    expect(visualMockSkill).toContain(
      "Still include the find-context textual sections beside the image",
    );
    expect(visualMockSkill).toContain('Do **not** use separate "Source state", "Viewport"');
    expect(visualMockSkill).toContain("**What it is:**");
    expect(visualMockSkill).toContain("**Where/how it shows:**");
    expect(visualMockSkill).toContain("**Translation guidance:**");
    expect(visualMockSkill).toContain("When the component has no Storybook story");
    expect(visualMockSkill).toContain("create a temporary CSF story");
    expect(visualMockSkill).toContain(
      "Call `captureScreenshot` with that `storyId` and `waitForText`",
    );
    expect(visualMockSkill).toContain("If `captureScreenshot` fails");
    expect(visualMockSkill).toContain("call `captureScreenshot` again once");
    expect(visualMockSkill).toContain("Never finish silently after a failed capture");
    expect(visualMockSkill).toContain("do not invent a Storybook setup");
    expect(visualMockSkill).toContain(
      "implement visual regression testing with it so component screenshots can be captured",
    );
    expect(conversationSkill).toContain(
      "When a tool fails, always leave a short user-facing explanation",
    );
  });

  it("activates visual-mock when a sandbox is available and the flag is enabled", () => {
    const visualMockSkill = listConversationSkills().find((skill) => skill.id === "visual-mock");
    expect(visualMockSkill).toBeDefined();

    expect(
      isConversationSkillActivated(
        visualMockSkill!,
        toConversationSkillActivationContext({
          hasFileAttachments: false,
          hasTmsIntegration: false,
          hasVisualMockSkill: true,
          toolContext: {
            conversationId: "conv_1",
            organizationId: "org_1",
            localUserId: "user_1",
            membershipRole: "member",
            projectId: null,
            db: {} as never,
            sandboxId: "sbx_1",
            workMode: "read_only",
          },
        }),
      ),
    ).toBe(true);
  });

  it("does not activate visual-mock when the flag is disabled", () => {
    const visualMockSkill = listConversationSkills().find((skill) => skill.id === "visual-mock");
    expect(visualMockSkill).toBeDefined();

    expect(
      isConversationSkillActivated(
        visualMockSkill!,
        toConversationSkillActivationContext({
          hasFileAttachments: false,
          hasTmsIntegration: false,
          hasVisualMockSkill: false,
          toolContext: {
            conversationId: "conv_1",
            organizationId: "org_1",
            localUserId: "user_1",
            membershipRole: "member",
            projectId: null,
            db: {} as never,
            sandboxId: "sbx_1",
            workMode: "read_only",
          },
        }),
      ),
    ).toBe(false);
  });

  it("always activates translation-tools", () => {
    const translationSkill = listConversationSkills().find(
      (skill) => skill.id === "translation-tools",
    );
    expect(translationSkill).toBeDefined();

    expect(
      isConversationSkillActivated(
        translationSkill!,
        toConversationSkillActivationContext({
          hasFileAttachments: false,
          hasTmsIntegration: false,
          toolContext: {
            conversationId: "conv_1",
            organizationId: "org_1",
            localUserId: "user_1",
            membershipRole: "member",
            projectId: null,
            db: {} as never,
          },
        }),
      ),
    ).toBe(true);
  });

  it("builds a skill plan without TMS tools when integration is missing", () => {
    const plan = buildConversationSkillPlan({
      hasFileAttachments: false,
      hasTmsIntegration: false,
      toolContext: {
        conversationId: "conv_1",
        organizationId: "org_1",
        localUserId: "user_1",
        membershipRole: "member",
        projectId: null,
        db: {} as never,
      },
    });

    expect(plan.instructionSkillIds).toEqual(
      expect.arrayContaining(["conversation", "translation-tools"]),
    );
    expect(plan.instructionSkillIds).not.toContain("tms-tools");
    expect(plan.toolNames).toEqual(expect.arrayContaining(["list_projects", "translate_string"]));
    expect(plan.toolNames).not.toContain("check_crowdin_progress");
  });

  it("exposes translate_string without a project but gates file jobs", () => {
    const toolNames = filterAvailableConversationToolNames(
      ["createTranslationJob", "translate_string", "list_projects"],
      {
        hasFileAttachments: false,
        toolContext: {
          conversationId: "conv_1",
          organizationId: "org_1",
          localUserId: "user_1",
          membershipRole: "member",
          projectId: null,
          db: {} as never,
        },
      },
    );

    expect(toolNames).toEqual(["translate_string", "list_projects"]);
  });

  it("gates repository write tools from read-only conversation runtimes", () => {
    const toolNames = filterAvailableConversationToolNames(
      ["grep", "write", "applyPatch", "captureScreenshot"],
      {
        hasFileAttachments: false,
        toolContext: {
          conversationId: "conv_1",
          organizationId: "org_1",
          localUserId: "user_1",
          membershipRole: "member",
          projectId: null,
          db: {} as never,
          sandboxId: "sbx_1",
          workMode: "read_only",
        },
      },
    );

    expect(toolNames).toEqual(["grep"]);
  });

  it("allows repository write tools for write-enabled conversation runtimes", () => {
    const toolNames = filterAvailableConversationToolNames(
      ["grep", "write", "applyPatch", "captureScreenshot"],
      {
        hasFileAttachments: false,
        toolContext: {
          conversationId: "conv_1",
          organizationId: "org_1",
          localUserId: "user_1",
          membershipRole: "admin",
          projectId: null,
          db: {} as never,
          sandboxId: "sbx_1",
          workMode: "write",
          repositorySource: "chat_ui",
          actor: { sourceUserId: "user_1", role: "admin" },
        },
      },
    );

    expect(toolNames).toEqual(["grep", "write", "applyPatch", "captureScreenshot"]);
  });

  it("hides repository write tools when the write gate rejects the actor", () => {
    const toolNames = filterAvailableConversationToolNames(
      ["grep", "write", "applyPatch", "captureScreenshot"],
      {
        hasFileAttachments: false,
        toolContext: {
          conversationId: "conv_1",
          organizationId: "org_1",
          localUserId: "user_1",
          membershipRole: "member",
          projectId: null,
          db: {} as never,
          sandboxId: "sbx_1",
          workMode: "write",
          repositorySource: "slack",
          actor: { sourceUserId: "U1", role: "member" },
        },
      },
    );

    expect(toolNames).toEqual(["grep"]);
  });

  it("hides repository write tools for chat members without job write access", () => {
    const toolNames = filterAvailableConversationToolNames(
      ["grep", "write", "applyPatch", "captureScreenshot"],
      {
        hasFileAttachments: false,
        toolContext: {
          conversationId: "conv_1",
          organizationId: "org_1",
          localUserId: "user_1",
          membershipRole: "member",
          projectId: null,
          db: {} as never,
          sandboxId: "sbx_1",
          workMode: "write",
          repositorySource: "chat_ui",
          actor: { sourceUserId: "user_1", role: "member" },
        },
      },
    );

    expect(toolNames).toEqual(["grep"]);
  });

  it("parses comma-separated frontmatter values", () => {
    expect(
      parseConversationSkillMetadata({
        id: "test",
        frontmatter: {
          tools: "list_projects, check_crowdin_progress",
          sharedSkills: "crowdin",
          requiresTmsIntegration: "true",
          requiresVisualMockSkill: "true",
        },
        body: "",
      }),
    ).toMatchObject({
      tools: ["list_projects", "check_crowdin_progress"],
      sharedSkills: ["crowdin"],
      requiresTmsIntegration: true,
      requiresVisualMockSkill: true,
    });
  });
});
