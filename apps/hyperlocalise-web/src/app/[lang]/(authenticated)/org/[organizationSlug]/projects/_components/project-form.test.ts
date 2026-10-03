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
  applyProjectSettingsSection,
  createProjectFormFromRow,
  projectFormHasErrors,
  projectSettingsSectionIsDirty,
  reconcileProjectForm,
  toProjectPayload,
  toProjectSectionPayload,
  validateProjectForm,
  validateProjectSettingsSection,
} from "./project-form";
import { mapProjectToListRow, type ApiProject } from "./project-list";

function createProject(overrides: Partial<ApiProject> = {}): ApiProject {
  return {
    id: "project_1234abcd",
    name: "Website Launch",
    identifier: "WL",
    description: "Marketing site refresh",
    translationContext: "Use a concise launch voice.",
    sourceLocale: "en-US",
    targetLocales: ["fr-FR", "de-DE"],
    createdAt: "2026-04-29T00:00:00.000Z",
    updatedAt: "2026-04-30T03:20:00.000Z",
    ...overrides,
  };
}

describe("project form helpers", () => {
  it("builds editable values from a project list row", () => {
    const values = createProjectFormFromRow(mapProjectToListRow(createProject()));

    expect(values).toEqual({
      name: "Website Launch",
      identifier: "WL",
      description: "Marketing site refresh",
      translationContext: "Use a concise launch voice.",
      sourceLocale: "en-US",
      targetLocales: ["fr-FR", "de-DE"],
    });
  });

  it("validates required name and supported field lengths", () => {
    const errors = validateProjectForm({
      name: "   ",
      identifier: "",
      description: "x".repeat(10_001),
      translationContext: "x".repeat(20_001),
      sourceLocale: "en-US",
      targetLocales: ["fr-FR"],
    });

    expect(projectFormHasErrors(errors)).toBe(true);
    expect(errors).toEqual({
      name: "Project name is required.",
      description: "Description must be 10,000 characters or fewer.",
      translationContext: "Translation context must be 20,000 characters or fewer.",
    });
  });

  it("rejects source locale in target locales", () => {
    const errors = validateProjectForm({
      name: "Docs",
      identifier: "DOCS",
      description: "",
      translationContext: "",
      sourceLocale: "en-US",
      targetLocales: ["fr-FR", "en-us"],
    });

    expect(errors.targetLocales).toBe("Remove the source locale from target locales.");
  });

  it("trims payload fields and canonicalizes locales before sending them to the API", () => {
    expect(
      toProjectPayload(
        {
          name: "  Docs  ",
          identifier: "",
          description: "  Product docs  ",
          translationContext: "  Keep it crisp.  ",
          sourceLocale: "en",
          targetLocales: ["fr-fr", "de-DE"],
        },
        { mode: "create" },
      ),
    ).toEqual({
      name: "Docs",
      description: "Product docs",
      translationContext: "Keep it crisp.",
      sourceLocale: "en",
      targetLocales: ["fr-FR", "de-DE"],
    });
  });

  it("omits locales for external TMS edits", () => {
    expect(
      toProjectPayload(
        {
          name: "Docs",
          identifier: "",
          description: "",
          translationContext: "",
          sourceLocale: "en-US",
          targetLocales: ["fr-FR"],
        },
        { mode: "edit", includeLocales: false },
      ),
    ).toEqual({
      name: "Docs",
      description: "",
      translationContext: "",
    });
  });

  it("sends only the identifier when metadata is provider-managed", () => {
    expect(
      toProjectPayload(
        {
          name: "Stale provider name",
          identifier: "ext",
          description: "Stale description",
          translationContext: "Stale context",
          sourceLocale: "en-US",
          targetLocales: ["fr-FR"],
        },
        { mode: "edit", includeLocales: false, includeMetadata: false },
      ),
    ).toEqual({
      identifier: "EXT",
    });
  });

  it("builds a payload for only the dirty settings section", () => {
    const values = {
      name: "  Docs  ",
      identifier: "docs",
      description: "  Product docs  ",
      translationContext: "  Keep it crisp.  ",
      sourceLocale: "en",
      targetLocales: ["fr-fr", "de-DE"],
    };

    expect(toProjectSectionPayload(values, "general")).toEqual({
      name: "Docs",
      description: "Product docs",
      identifier: "DOCS",
    });
    expect(toProjectSectionPayload(values, "styleGuide")).toEqual({
      translationContext: "Keep it crisp.",
    });
    expect(toProjectSectionPayload(values, "locales")).toEqual({
      sourceLocale: "en",
      targetLocales: ["fr-FR", "de-DE"],
    });
    expect(toProjectSectionPayload(values, "general", { identifierOnly: true })).toEqual({
      identifier: "DOCS",
    });
  });

  it("tracks dirty state per settings section", () => {
    const baseline = createProjectFormFromRow(mapProjectToListRow(createProject()));
    const values = {
      ...baseline,
      name: "Renamed",
      translationContext: "New voice",
      targetLocales: ["ja-JP"],
    };

    expect(projectSettingsSectionIsDirty("general", values, baseline)).toBe(true);
    expect(projectSettingsSectionIsDirty("styleGuide", values, baseline)).toBe(true);
    expect(projectSettingsSectionIsDirty("locales", values, baseline)).toBe(true);
    expect(projectSettingsSectionIsDirty("general", baseline, baseline)).toBe(false);
    expect(
      projectSettingsSectionIsDirty("general", { ...baseline, name: "Renamed" }, baseline, {
        identifierOnly: true,
      }),
    ).toBe(false);
  });

  it("validates only the fields in the settings section being saved", () => {
    const values = {
      name: "   ",
      identifier: "123",
      description: "",
      translationContext: "x".repeat(20_001),
      sourceLocale: "en-US",
      targetLocales: ["en-us"],
    };

    expect(validateProjectSettingsSection("general", values)).toEqual({
      name: "Project name is required.",
      identifier: "Use 1–10 letters or numbers, starting with a letter (e.g. HL).",
    });
    expect(validateProjectSettingsSection("styleGuide", values)).toEqual({
      translationContext: "Translation context must be 20,000 characters or fewer.",
    });
    expect(validateProjectSettingsSection("locales", values)).toEqual({
      targetLocales: "Remove the source locale from target locales.",
    });
  });

  it("keeps dirty fields when reconciling a newer project snapshot", () => {
    const project = mapProjectToListRow(createProject());
    const baseline = createProjectFormFromRow(project);
    const current = {
      ...baseline,
      name: "Local rename",
      identifier: "EDIT",
    };
    const nextProject = mapProjectToListRow(
      createProject({
        name: "Website Launch",
        identifier: "WL",
        sourceLocale: "ja-JP",
        targetLocales: ["ko-KR"],
        translationContext: "Server style guide",
      }),
    );

    const reconciled = reconcileProjectForm(current, baseline, nextProject);

    expect(reconciled.values.name).toBe("Local rename");
    expect(reconciled.values.identifier).toBe("EDIT");
    expect(reconciled.values.sourceLocale).toBe("ja-JP");
    expect(reconciled.values.targetLocales).toEqual(["ko-KR"]);
    expect(reconciled.values.translationContext).toBe("Server style guide");
    expect(reconciled.baseline.sourceLocale).toBe("ja-JP");
  });

  it("applies a saved section without clearing other drafts", () => {
    const baseline = createProjectFormFromRow(mapProjectToListRow(createProject()));
    const current = {
      ...baseline,
      name: "Local rename",
      targetLocales: ["ja-JP"],
    };

    expect(applyProjectSettingsSection(current, current, "locales")).toEqual({
      ...current,
      targetLocales: ["ja-JP"],
    });
  });
});
