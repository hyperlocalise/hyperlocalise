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
import { describe, expect, it, vi } from "vite-plus/test";

vi.mock("@/lib/env", () => ({
  env: {
    DATABASE_URL: "postgres://localhost:5432/test",
  },
}));

const { toolGetAccessibleGlossaryMock } = vi.hoisted(() => ({
  toolGetAccessibleGlossaryMock: vi.fn(async () => ({
    id: "glossary_123",
    source: "native",
    controlLevel: "team",
    sourceLocale: "en",
    targetLocale: "fr",
  })),
}));

vi.mock("@/lib/agent-runtime/tools/tool-access", () => ({
  toolGetAccessibleGlossary: toolGetAccessibleGlossaryMock,
  toolGlossaryOrgMutationWhere: vi.fn(() => ({})),
  toolProjectLinkedGlossaryWhere: vi.fn(async () => ({})),
}));

import { schema } from "@/lib/database";
import { createCreateGlossaryTermTool, createUpdateGlossaryTermTool } from "./glossary-tools";
import type { ToolContext } from "./types";

describe("createCreateGlossaryTermTool", () => {
  it("inserts target locale rows using project context when glossary targetLocale is null", async () => {
    toolGetAccessibleGlossaryMock.mockResolvedValueOnce({
      id: "glossary_123",
      source: "native",
      controlLevel: "team",
      sourceLocale: "en",
      targetLocale: null,
    } as unknown as Awaited<ReturnType<typeof toolGetAccessibleGlossaryMock>>);

    const transaction = vi.fn(async (callback: (tx: unknown) => Promise<void>) =>
      callback({
        insert: vi.fn(() => ({
          values: vi.fn(() => ({
            returning: vi.fn(async () => [{ id: "concept_123" }]),
          })),
        })),
      }),
    );

    const selectMock = vi
      .fn()
      .mockImplementationOnce(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn(async () => [{ targetLocales: ["fr-FR"] }]),
          })),
        })),
      }))
      .mockImplementationOnce(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn(async () => []),
          })),
        })),
      }));

    const ctx = {
      conversationId: "conv_123",
      organizationId: "org_123",
      localUserId: "user_123",
      membershipRole: "translator",
      projectId: "project_123",
      db: {
        transaction,
        select: selectMock,
      },
    } as unknown as ToolContext;

    const tool = createCreateGlossaryTermTool(ctx);
    const result = (await tool.execute!(
      {
        glossaryId: "glossary_123",
        sourceTerm: "Hello",
        targetTerm: "Bonjour",
        caseSensitive: false,
        forbidden: false,
      },
      { toolCallId: "tool_1", messages: [], context: {} },
    )) as { success: boolean };

    expect(result.success).toBe(true);
    expect(transaction).toHaveBeenCalled();
  });

  it("returns an error when no target locale can be resolved", async () => {
    toolGetAccessibleGlossaryMock.mockResolvedValueOnce({
      id: "glossary_123",
      source: "native",
      controlLevel: "team",
      sourceLocale: "en",
      targetLocale: null,
    } as unknown as Awaited<ReturnType<typeof toolGetAccessibleGlossaryMock>>);

    const selectMock = vi.fn(() => ({
      from: vi.fn(() => ({
        innerJoin: vi.fn(() => ({
          where: vi.fn(async () => []),
        })),
      })),
    }));

    const ctx = {
      conversationId: "conv_123",
      organizationId: "org_123",
      localUserId: "user_123",
      membershipRole: "translator",
      projectId: null,
      db: {
        select: selectMock,
      },
    } as unknown as ToolContext;

    const tool = createCreateGlossaryTermTool(ctx);
    const result = (await tool.execute!(
      {
        glossaryId: "glossary_123",
        sourceTerm: "Hello",
        targetTerm: "Bonjour",
        caseSensitive: false,
        forbidden: false,
      },
      { toolCallId: "tool_1", messages: [], context: {} },
    )) as { success: boolean; error?: string };

    expect(result.success).toBe(false);
    expect(result.error).toContain("target locale");
  });
});

describe("createUpdateGlossaryTermTool", () => {
  it("updates canonical term fields for concept-backed rows", async () => {
    const termUpdateSet = vi.fn(() => ({
      where: vi.fn(async () => undefined),
    }));
    const conceptUpdateSet = vi.fn(() => ({
      where: vi.fn(async () => undefined),
    }));
    const transaction = vi.fn(async (callback: (tx: unknown) => Promise<void>) =>
      callback({
        update: vi.fn((table: unknown) => {
          if (table === schema.glossaryTerms) {
            return { set: termUpdateSet };
          }
          if (table === schema.glossaryConcepts) {
            return { set: conceptUpdateSet };
          }
          throw new Error("Unexpected table update");
        }),
      }),
    );

    const selectAfterUpdate = vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn(async () => [
            {
              id: "term_123",
              sourceTerm: "Bonjour",
              targetTerm: "Bonjour",
              description: "",
              partOfSpeech: "",
              caseSensitive: false,
              forbidden: false,
              reviewStatus: "approved",
              createdAt: new Date("2026-01-01T00:00:00.000Z"),
            },
          ]),
        })),
      })),
    }));

    const ctx = {
      conversationId: "conv_123",
      organizationId: "org_123",
      localUserId: "user_123",
      membershipRole: "translator",
      projectId: "project_123",
      db: {
        transaction,
        select: vi
          .fn()
          .mockImplementationOnce(() => ({
            from: vi.fn(() => ({
              innerJoin: vi.fn(() => ({
                where: vi.fn(() => ({
                  limit: vi.fn(async () => [
                    {
                      glossaryId: "glossary_123",
                      conceptId: "concept_123",
                      locale: "en",
                    },
                  ]),
                })),
              })),
            })),
          }))
          .mockImplementation(selectAfterUpdate),
      },
    } as unknown as ToolContext;

    const tool = createUpdateGlossaryTermTool(ctx);
    const result = (await tool.execute!(
      {
        termId: "term_123",
        targetTerm: "Bonjour",
      },
      { toolCallId: "tool_1", messages: [], context: {} },
    )) as { success: boolean };

    expect(result.success).toBe(true);
    expect(termUpdateSet).toHaveBeenCalledWith({
      term: "Bonjour",
      sourceTerm: "Bonjour",
      targetTerm: "Bonjour",
    });
    expect(conceptUpdateSet).toHaveBeenCalledWith({ primaryTerm: "Bonjour" });
  });
});
