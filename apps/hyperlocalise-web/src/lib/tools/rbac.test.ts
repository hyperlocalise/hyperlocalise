import { describe, expect, it, vi } from "vitest";

// Mock environment and database before importing tools
vi.mock("@/lib/env", () => ({
  env: {
    DATABASE_URL: "postgres://localhost:5432/test",
  },
}));

vi.mock("@/lib/database", () => ({
  db: {
    transaction: vi.fn(),
    insert: vi.fn(() => ({
      values: vi.fn(() => ({
        returning: vi.fn(() => [{ id: "job_123" }]),
      })),
    })),
  },
  schema: {
    jobs: { id: "jobs" },
    translationJobDetails: { jobId: "jobId" },
    glossaries: { id: "glossaries" },
    glossaryTerms: { id: "glossaryTerms" },
    memories: { id: "memories" },
    memoryEntries: { id: "memoryEntries" },
  },
}));

import { createTranslationJobTool } from "./job-tools";
import {
  createCreateGlossaryTool,
  createUpdateGlossaryTool,
  createDeleteGlossaryTool,
} from "./glossary-tools";
import {
  createCreateTranslationMemoryTool,
  createUpdateTranslationMemoryTool,
  createDeleteTranslationMemoryTool,
} from "./memory-tools";
import type { ToolContext } from "./types";

describe("Agent Tools RBAC", () => {
  const mockCtx = (role: "owner" | "admin" | "member"): ToolContext => ({
    conversationId: "conv_123",
    organizationId: "org_123",
    membershipRole: role,
    projectId: "project_123",
    db: {
      transaction: vi.fn(async (cb) =>
        cb({
          insert: vi.fn(() => ({
            values: vi.fn(() => ({
              returning: vi.fn(() => [{ id: "mutated_123" }]),
            })),
          })),
          update: vi.fn(() => ({
            set: vi.fn(() => ({
              where: vi.fn(() => ({
                returning: vi.fn(() => [{ id: "mutated_123" }]),
              })),
            })),
          })),
          delete: vi.fn(() => ({
            where: vi.fn(() => ({
              returning: vi.fn(() => [{ id: "mutated_123" }]),
            })),
          })),
        }),
      ),
      insert: vi.fn(() => ({
        values: vi.fn(() => ({
          returning: vi.fn(() => [{ id: "mutated_123" }]),
        })),
      })),
      update: vi.fn(() => ({
        set: vi.fn(() => ({
          where: vi.fn(() => ({
            returning: vi.fn(() => [{ id: "mutated_123" }]),
          })),
        })),
      })),
      delete: vi.fn(() => ({
        where: vi.fn(() => ({
          returning: vi.fn(() => [{ id: "mutated_123" }]),
        })),
      })),
    } as any,
  });

  const toolCallInfo = { toolCallId: "test-tool-call", messages: [] };

  async function executeTool(tool: any, input: any) {
    if (!tool.execute) {
      throw new Error("Tool is missing execute");
    }
    return tool.execute(input, toolCallInfo);
  }

  describe("Translation Job Tools", () => {
    it("denies access to members", async () => {
      const tool = createTranslationJobTool(mockCtx("member"));
      const result = await executeTool(tool, {
        type: "string",
        sourceText: "hello",
        sourceLocale: "en",
        targetLocales: ["fr"],
      });
      expect(result.success).toBe(false);
      expect(result.error).toContain("permission");
    });

    it("allows access to admins", async () => {
      const tool = createTranslationJobTool(mockCtx("admin"));
      const result = await executeTool(tool, {
        type: "string",
        sourceText: "hello",
        sourceLocale: "en",
        targetLocales: ["fr"],
      });
      // It fails later because of enqueuing/db, but we check that it didn't fail at the RBAC check
      expect(result.error).not.toContain("permission");
    });
  });

  describe("Glossary Tools", () => {
    it("denies create access to members", async () => {
      const tool = createCreateGlossaryTool(mockCtx("member"));
      const result = await executeTool(tool, {
        name: "Test",
        sourceLocale: "en",
        targetLocale: "fr",
      });
      expect(result.success).toBe(false);
      expect(result.error).toContain("permission");
    });

    it("allows create access to owners", async () => {
      const tool = createCreateGlossaryTool(mockCtx("owner"));
      const result = await executeTool(tool, {
        name: "Test",
        sourceLocale: "en",
        targetLocale: "fr",
      });
      expect(result.success).not.toBe(false);
      expect(result.error).toBeUndefined();
    });

    it("denies update access to members", async () => {
      const tool = createUpdateGlossaryTool(mockCtx("member"));
      const result = await executeTool(tool, {
        glossaryId: "g_123",
        name: "New Name",
      });
      expect(result.success).toBe(false);
      expect(result.error).toContain("permission");
    });

    it("denies delete access to members", async () => {
      const tool = createDeleteGlossaryTool(mockCtx("member"));
      const result = await executeTool(tool, {
        glossaryId: "g_123",
      });
      expect(result.success).toBe(false);
      expect(result.error).toContain("permission");
    });
  });

  describe("Translation Memory Tools", () => {
    it("denies create access to members", async () => {
      const tool = createCreateTranslationMemoryTool(mockCtx("member"));
      const result = await executeTool(tool, {
        name: "Test",
      });
      expect(result.success).toBe(false);
      expect(result.error).toContain("permission");
    });

    it("denies update access to members", async () => {
      const tool = createUpdateTranslationMemoryTool(mockCtx("member"));
      const result = await executeTool(tool, {
        memoryId: "m_123",
        name: "New Name",
      });
      expect(result.success).toBe(false);
      expect(result.error).toContain("permission");
    });

    it("denies delete access to members", async () => {
      const tool = createDeleteTranslationMemoryTool(mockCtx("member"));
      const result = await executeTool(tool, {
        memoryId: "m_123",
      });
      expect(result.success).toBe(false);
      expect(result.error).toContain("permission");
    });
  });
});
