import { describe, expect, it } from "vite-plus/test";

import {
  createProjectFormFromRow,
  projectFormHasErrors,
  toProjectPayload,
  validateProjectForm,
} from "./project-form";
import { mapProjectToListRow, type ApiProject } from "./project-list";

function createProject(overrides: Partial<ApiProject> = {}): ApiProject {
  return {
    id: "project_1234abcd",
    name: "Website Launch",
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
      description: "Marketing site refresh",
      translationContext: "Use a concise launch voice.",
      sourceLocale: "en-US",
      targetLocales: ["fr-FR", "de-DE"],
    });
  });

  it("validates required name and supported field lengths", () => {
    const errors = validateProjectForm({
      name: "   ",
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
});
