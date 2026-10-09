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
  createContentfulAutomationFormFixture,
  createDetailAutomationFormFixture,
  createGithubAutomationFormFixture,
  createManualAutomationFormFixture,
  createMemoriesAutomationFormFixture,
  createScheduledAutomationFormFixture,
} from "@/app/[lang]/(authenticated)/org/[organizationSlug]/automations/_components/automation-editor.fixture";
import { automationsFixture } from "@/app/[lang]/(authenticated)/org/[organizationSlug]/automations/_components/automations.fixture";

import { workspaceAutomationFormStateSchema } from "./workspace-automation-form-schema";
import { WORKSPACE_AUTOMATION_TEMPLATES } from "./workspace-automation-templates";
import {
  applyTemplateToWorkspaceAutomationFormState,
  createDefaultWorkspaceAutomationFormState,
  createWorkspaceAutomationFormStateFromRecord,
} from "./workspace-automation-view-model";

describe("workspaceAutomationFormStateSchema", () => {
  it("accepts the default form unchanged", () => {
    const form = createDefaultWorkspaceAutomationFormState();

    expect(workspaceAutomationFormStateSchema.parse(form)).toEqual(form);
  });

  it.each(WORKSPACE_AUTOMATION_TEMPLATES.map((template) => [template.id, template] as const))(
    "accepts the form of template %s unchanged",
    (_id, template) => {
      const form = applyTemplateToWorkspaceAutomationFormState(
        createDefaultWorkspaceAutomationFormState(),
        template,
      );

      expect(workspaceAutomationFormStateSchema.parse(form)).toEqual(form);
    },
  );

  it.each(automationsFixture.map((automation) => [automation.name, automation] as const))(
    "accepts the form of saved automation %s unchanged",
    (_name, automation) => {
      const form = createWorkspaceAutomationFormStateFromRecord(automation);

      expect(workspaceAutomationFormStateSchema.parse(form)).toEqual(form);
    },
  );

  it.each([
    ["github", createGithubAutomationFormFixture],
    ["contentful", createContentfulAutomationFormFixture],
    ["detail", createDetailAutomationFormFixture],
    ["scheduled", createScheduledAutomationFormFixture],
    ["manual", createManualAutomationFormFixture],
    ["memories", createMemoriesAutomationFormFixture],
  ] as const)("accepts the %s editor fixture unchanged", (_name, createForm) => {
    const form = createForm();

    expect(workspaceAutomationFormStateSchema.parse(form)).toEqual(form);
  });

  it("drops keys the form does not have", () => {
    const form = createDefaultWorkspaceAutomationFormState();

    expect(workspaceAutomationFormStateSchema.parse({ ...form, extra: "value" })).toEqual(form);
  });

  it("rejects a form with a field missing or of the wrong type", () => {
    const { name: _name, ...withoutName } = createDefaultWorkspaceAutomationFormState();

    expect(workspaceAutomationFormStateSchema.safeParse(withoutName).success).toBe(false);
    expect(
      workspaceAutomationFormStateSchema.safeParse({
        ...createDefaultWorkspaceAutomationFormState(),
        slackEnabled: "yes",
      }).success,
    ).toBe(false);
  });
});
