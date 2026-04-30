import { describe, expect, it } from "vite-plus/test";

import { mapProjectToPortfolioRow, type ApiProject } from "./projects-portfolio";

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

describe("mapProjectToPortfolioRow", () => {
  it("maps API project fields into the portfolio row model", () => {
    const row = mapProjectToPortfolioRow(createProject());

    expect(row).toMatchObject({
      id: "project_1234abcd",
      name: "Website Launch",
      key: "WL",
      status: "Ready",
      locales: "—",
      jobs: "—",
      progress: 0,
      source: "Marketing site refresh",
      next: "Use a concise launch voice.",
      tone: "info",
    });
    expect(row.updated).toContain("2026");
  });

  it("falls back when optional display fields are empty", () => {
    const row = mapProjectToPortfolioRow(
      createProject({
        name: "",
        description: "",
        translationContext: "",
        updatedAt: "not-a-date",
      }),
    );

    expect(row.key).toBe("1234");
    expect(row.source).toBe("Project API");
    expect(row.next).toBe("Create translation jobs");
    expect(row.updated).toBe("Updated recently");
  });
});
