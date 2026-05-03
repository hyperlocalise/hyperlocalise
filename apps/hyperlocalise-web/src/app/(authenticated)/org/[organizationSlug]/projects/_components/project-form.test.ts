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
    });
  });

  it("validates required name and supported field lengths", () => {
    const errors = validateProjectForm({
      name: "   ",
      description: "x".repeat(10_001),
      translationContext: "x".repeat(20_001),
    });

    expect(projectFormHasErrors(errors)).toBe(true);
    expect(errors).toEqual({
      name: "Project name is required.",
      description: "Description must be 10,000 characters or fewer.",
      translationContext: "Translation context must be 20,000 characters or fewer.",
    });
  });

  it("trims payload fields before sending them to the project API", () => {
    expect(
      toProjectPayload({
        name: "  Docs  ",
        description: "  Product docs  ",
        translationContext: "  Keep it crisp.  ",
      }),
    ).toEqual({
      name: "Docs",
      description: "Product docs",
      translationContext: "Keep it crisp.",
    });
  });
});
