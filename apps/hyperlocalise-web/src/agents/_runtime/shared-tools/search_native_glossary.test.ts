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
  searchGlossaryConcordanceMock,
  dbSelectMock,
} = vi.hoisted(() => ({
  toolCanAccessProjectMock: vi.fn(),
  toolProjectLinkedGlossaryWhereMock: vi.fn(),
  searchGlossaryConcordanceMock: vi.fn(),
  dbSelectMock: vi.fn(),
}));

vi.mock("@/lib/tools/tool-access", () => ({
  toolCanAccessProject: (...args: unknown[]) => toolCanAccessProjectMock(...args),
  toolProjectLinkedGlossaryWhere: (...args: unknown[]) =>
    toolProjectLinkedGlossaryWhereMock(...args),
}));

vi.mock("@/lib/glossary/glossary-concordance", () => ({
  searchGlossaryConcordance: (...args: unknown[]) => searchGlossaryConcordanceMock(...args),
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
      status: "glossaries.status",
    },
  },
  db: {},
}));

function createSelectBuilder(rows: unknown[]) {
  const builder = Promise.resolve(rows) as Promise<unknown[]> & {
    from: ReturnType<typeof vi.fn>;
    innerJoin: ReturnType<typeof vi.fn>;
    where: ReturnType<typeof vi.fn>;
  };
  builder.from = vi.fn(() => builder);
  builder.innerJoin = vi.fn(() => builder);
  builder.where = vi.fn(async () => rows);
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
    searchGlossaryConcordanceMock.mockReset();
    dbSelectMock.mockReset();

    toolCanAccessProjectMock.mockResolvedValue({ id: "project-1" });
    toolProjectLinkedGlossaryWhereMock.mockResolvedValue("linked-glossary-where");
    searchGlossaryConcordanceMock.mockResolvedValue([]);
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
    expect(searchGlossaryConcordanceMock).not.toHaveBeenCalled();
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
    expect(searchGlossaryConcordanceMock).not.toHaveBeenCalled();
  });

  it("returns empty terms when concordance finds no matches", async () => {
    dbSelectMock.mockImplementationOnce(() => createSelectBuilder([{ glossaryId: "glossary-1" }]));
    searchGlossaryConcordanceMock.mockResolvedValue([]);
    const tool = createSearchNativeGlossaryTool(createToolContext({ projectId: "project-1" }));

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
    expect(searchGlossaryConcordanceMock).not.toHaveBeenCalled();
  });

  it("searches native concept glossaries and maps status-derived forbidden flags", async () => {
    dbSelectMock.mockImplementationOnce(() => createSelectBuilder([{ glossaryId: "glossary-1" }]));
    searchGlossaryConcordanceMock.mockResolvedValue([
      {
        id: "term-keep:fr",
        glossaryId: "glossary-1",
        glossaryName: "Product",
        sourceTerm: "Login",
        targetTerm: "Connexion",
        description: "Sign in",
        termStatus: { preferred: true, forbidden: false },
        rank: 0.9,
      },
      {
        id: "term-drop:fr",
        glossaryId: "glossary-1",
        glossaryName: "Product",
        sourceTerm: "Logout",
        targetTerm: "Deconnexion",
        description: null,
        termStatus: { preferred: false, forbidden: true },
        rank: 0.4,
      },
    ]);

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
          id: "term-keep:fr",
          sourceTerm: "Login",
          targetTerm: "Connexion",
          description: "Sign in",
          forbidden: false,
          glossaryId: "glossary-1",
          glossaryName: "Product",
          rank: 0.9,
        },
        {
          id: "term-drop:fr",
          sourceTerm: "Logout",
          targetTerm: "Deconnexion",
          description: null,
          forbidden: true,
          glossaryId: "glossary-1",
          glossaryName: "Product",
          rank: 0.4,
        },
      ],
    });

    expect(searchGlossaryConcordanceMock).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: "org-1",
        projectId: "project-1",
        sourceLocale: "en",
        targetLocales: ["fr"],
        sourceText: "Login button",
      }),
    );
  });
});
