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
      description: "Marketing site refresh",
      translationContext: "Use a concise launch voice.",
    });
    expect(row.created).toContain("2026");
    expect(row.updated).toContain("2026");
  });

  it("falls back when optional database fields are empty or missing", () => {
    const row = mapProjectToPortfolioRow(
      createProject({
        name: "",
        description: null,
        translationContext: undefined,
        createdAt: null,
        updatedAt: "not-a-date",
      }),
    );

    expect(row.key).toBe("1234");
    expect(row.description).toBe("No description");
    expect(row.translationContext).toBe("No translation context");
    expect(row.created).toBe("Created date unavailable");
    expect(row.updated).toBe("Updated date unavailable");
  });

  it("accepts date objects from database rows", () => {
    const row = mapProjectToPortfolioRow(
      createProject({
        createdAt: new Date("2026-04-29T00:00:00.000Z"),
        updatedAt: new Date("2026-04-30T03:20:00.000Z"),
      }),
    );

    expect(row.created).toContain("2026");
    expect(row.updated).toContain("2026");
  });
});
