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
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

import type { ToolContext } from "@/lib/agent-contracts/tool-context";

import { createSearchNativeGlossaryTool } from "./search_native_glossary";

const {
  toolCanAccessProjectMock,
  toolProjectLinkedGlossaryWhereMock,
  buildNativeGlossaryTsQueryMock,
  sourceContainsTermMock,
  dbSelectMock,
} = vi.hoisted(() => ({
  toolCanAccessProjectMock: vi.fn(),
  toolProjectLinkedGlossaryWhereMock: vi.fn(),
  buildNativeGlossaryTsQueryMock: vi.fn(),
  sourceContainsTermMock: vi.fn(),
  dbSelectMock: vi.fn(),
}));

vi.mock("@/lib/tools/tool-access", () => ({
  toolCanAccessProject: (...args: unknown[]) => toolCanAccessProjectMock(...args),
  toolProjectLinkedGlossaryWhere: (...args: unknown[]) =>
    toolProjectLinkedGlossaryWhereMock(...args),
}));

vi.mock("./build-native-glossary-tsquery", () => ({
  buildNativeGlossaryTsQuery: (...args: unknown[]) => buildNativeGlossaryTsQueryMock(...args),
}));

vi.mock("@/lib/glossary/validate-glossary-terms-in-translation", () => ({
  sourceContainsTerm: (...args: unknown[]) => sourceContainsTermMock(...args),
}));

vi.mock("@/lib/database", () => ({
  schema: {
    projectGlossaries: {
      glossaryId: "project_glossaries.glossary_id",
      projectId: "project_glossaries.project_id",
      organizationId: "project_glossaries.organization_id",
    },
    glossaries: {
      id: "glossaries.id",
      source: "glossaries.source",
      sourceLocale: "glossaries.source_locale",
      targetLocale: "glossaries.target_locale",
      status: "glossaries.status",
      name: "glossaries.name",
    },
    glossaryTerms: {
      id: "glossary_terms.id",
      sourceTerm: "glossary_terms.source_term",
      targetTerm: "glossary_terms.target_term",
      description: "glossary_terms.description",
      forbidden: "glossary_terms.forbidden",
      caseSensitive: "glossary_terms.case_sensitive",
      glossaryId: "glossary_terms.glossary_id",
      searchVector: "glossary_terms.search_vector",
      reviewStatus: "glossary_terms.review_status",
    },
  },
  db: {},
}));

function createSelectBuilder(rows: unknown[]) {
  const builder = Promise.resolve(rows) as Promise<unknown[]> & {
    from: ReturnType<typeof vi.fn>;
    innerJoin: ReturnType<typeof vi.fn>;
    where: ReturnType<typeof vi.fn>;
    orderBy: ReturnType<typeof vi.fn>;
    limit: ReturnType<typeof vi.fn>;
  };
  builder.from = vi.fn(() => builder);
  builder.innerJoin = vi.fn(() => builder);
  builder.where = vi.fn(() => builder);
  builder.orderBy = vi.fn(() => builder);
  builder.limit = vi.fn(async () => rows);
  return builder;
}

function createToolContext(
  overrides: Partial<Pick<ToolContext, "projectId" | "glossarySearchEnabled" | "db">> = {},
): ToolContext {
  return {
    conversationId: "conv-1",
    organizationId: "org-1",
    localUserId: "user-1",
    membershipRole: "member",
    projectId: null,
    db: {
      select: dbSelectMock,
    } as never,
    glossarySearchEnabled: true,
    ...overrides,
  };
}

describe("createSearchNativeGlossaryTool", () => {
  beforeEach(() => {
    toolCanAccessProjectMock.mockReset();
    toolProjectLinkedGlossaryWhereMock.mockReset();
    buildNativeGlossaryTsQueryMock.mockReset();
    sourceContainsTermMock.mockReset();
    dbSelectMock.mockReset();

    toolCanAccessProjectMock.mockResolvedValue({ id: "project-1" });
    toolProjectLinkedGlossaryWhereMock.mockResolvedValue("linked-glossary-where");
    buildNativeGlossaryTsQueryMock.mockReturnValue("login:*");
    sourceContainsTermMock.mockReturnValue(true);
  });

  it("fails closed when glossary search is disabled", async () => {
    const tool = createSearchNativeGlossaryTool(
      createToolContext({ glossarySearchEnabled: false }),
    );

    await expect(
      tool.execute?.(
        {
          sourceText: "Talk to Heidi",
          sourceLocale: "en",
          targetLocale: "vi",
          limit: 10,
        },
        {} as never,
      ),
    ).resolves.toEqual({
      success: false,
      error: "Glossary search is not enabled for this workspace.",
    });
    expect(buildNativeGlossaryTsQueryMock).not.toHaveBeenCalled();
    expect(dbSelectMock).not.toHaveBeenCalled();
  });

  it("rejects project-scoped search when the caller cannot access the project", async () => {
    toolCanAccessProjectMock.mockResolvedValue(null);
    const tool = createSearchNativeGlossaryTool(
      createToolContext({ projectId: "project-forbidden" }),
    );

    await expect(
      tool.execute?.(
        {
          sourceText: "Talk to Heidi",
          sourceLocale: "en",
          targetLocale: "vi",
          limit: 10,
        },
        {} as never,
      ),
    ).resolves.toEqual({
      success: false,
      error: "Project not found or not accessible.",
    });
    expect(dbSelectMock).not.toHaveBeenCalled();
  });

  it("returns empty terms when the source text yields no tsquery", async () => {
    buildNativeGlossaryTsQueryMock.mockReturnValue("");
    const tool = createSearchNativeGlossaryTool(createToolContext());

    await expect(
      tool.execute?.(
        {
          sourceText: "!!!",
          sourceLocale: "en",
          targetLocale: "vi",
          limit: 10,
        },
        {} as never,
      ),
    ).resolves.toEqual({ success: true, terms: [] });
    expect(dbSelectMock).not.toHaveBeenCalled();
  });

  it("returns empty terms when the project has no attached native glossaries", async () => {
    dbSelectMock.mockImplementationOnce(() => createSelectBuilder([]));
    const tool = createSearchNativeGlossaryTool(createToolContext({ projectId: "project-1" }));

    await expect(
      tool.execute?.(
        {
          sourceText: "Talk to Heidi",
          sourceLocale: "en",
          targetLocale: "vi",
          limit: 10,
        },
        {} as never,
      ),
    ).resolves.toEqual({ success: true, terms: [] });
    expect(toolCanAccessProjectMock).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: "org-1" }),
      "project-1",
    );
    expect(dbSelectMock).toHaveBeenCalledTimes(1);
  });

  it("post-filters SQL hits that fail sourceContainsTerm", async () => {
    dbSelectMock
      .mockImplementationOnce(() => createSelectBuilder([{ glossaryId: "glossary-1" }]))
      .mockImplementationOnce(() =>
        createSelectBuilder([
          {
            id: "term-keep",
            sourceTerm: "Login",
            targetTerm: "Connexion",
            description: null,
            forbidden: false,
            caseSensitive: false,
            glossaryId: "glossary-1",
            glossaryName: "Product",
            rank: 0.9,
          },
          {
            id: "term-drop",
            sourceTerm: "Log",
            targetTerm: "Journal",
            description: null,
            forbidden: false,
            caseSensitive: false,
            glossaryId: "glossary-1",
            glossaryName: "Product",
            rank: 0.4,
          },
        ]),
      );

    sourceContainsTermMock.mockImplementation((_source: string, term: { sourceTerm: string }) => {
      return term.sourceTerm === "Login";
    });

    const tool = createSearchNativeGlossaryTool(createToolContext({ projectId: "project-1" }));

    await expect(
      tool.execute?.(
        {
          sourceText: "Login button",
          sourceLocale: "en",
          targetLocale: "fr",
          limit: 10,
        },
        {} as never,
      ),
    ).resolves.toEqual({
      success: true,
      terms: [
        {
          id: "term-keep",
          sourceTerm: "Login",
          targetTerm: "Connexion",
          description: null,
          forbidden: false,
          glossaryId: "glossary-1",
          glossaryName: "Product",
          rank: 0.9,
        },
      ],
    });
  });
});
