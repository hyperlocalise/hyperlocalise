import { describe, expect, it, vi } from "vite-plus/test";

import { err, ok } from "@/lib/primitives/result/results";

// Mock environment and database before importing tools
vi.mock("@/lib/env", () => ({
  env: {
    DATABASE_URL: "postgres://localhost:5432/test",
    OPENAI_API_KEY: "test-openai-api-key",
  },
}));

vi.mock("@/lib/billing/usage-control", () => ({
  reserveUsageEvent: vi.fn(async () => ({ ok: true, value: { id: "usage_123" } })),
  usageFeatureIds: {
    translationJobs: "translation_jobs",
    agentRuns: "agent_runs",
  },
}));

const { assertOrganizationCanEnqueueTranslationJobMock } = vi.hoisted(() => ({
  assertOrganizationCanEnqueueTranslationJobMock: vi.fn(async () => ok(undefined)),
}));

vi.mock("@/lib/security/organization-operation-budget", () => ({
  assertOrganizationCanEnqueueTranslationJob: assertOrganizationCanEnqueueTranslationJobMock,
}));

vi.mock("@/lib/file-storage/records", () => ({
  ensureRepositorySourceFileVersionForStoredFile: vi.fn(),
  getStoredFileForJobScope: vi.fn(),
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
    projects: { id: "id", organizationId: "organizationId", teamId: "teamId" },
  },
}));

vi.mock("@/lib/agent-runtime/tools/tool-access", () => ({
  toolCanAccessProject: vi.fn(async () => ({ id: "project_123" })),
  toolCanAccessGlossary: vi.fn(async () => true),
  toolCanAccessMemory: vi.fn(async () => true),
  toolGetAccessibleGlossary: vi.fn(async () => ({ id: "glossary_123" })),
  toolGetAccessibleMemory: vi.fn(async () => ({ id: "memory_123" })),
  toolGlossaryOrgMutationWhere: vi.fn(() => ({})),
  toolMemoryOrgMutationWhere: vi.fn(() => ({})),
  toolCanAccessStoredFileProject: vi.fn(async () => true),
  toolAccessibleProjectsWhere: vi.fn(async () => ({})),
  toolAccessibleJobsWhere: vi.fn(async () => ({})),
  toolProjectLinkedGlossaryWhere: vi.fn(async () => ({})),
  toolProjectLinkedMemoryWhere: vi.fn(async () => ({})),
}));

import { createTranslationJobTool } from "@/lib/agent-runtime/tools/translation-tools";
import { getStoredFileForJobScope } from "@/lib/file-storage/records";
import { toolCanAccessStoredFileProject } from "@/lib/agent-runtime/tools/tool-access";
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
import type { ToolContext } from "@/lib/tools/types";

describe("Agent Tools RBAC", () => {
  const mockCtx = (role: "admin" | "member"): ToolContext => ({
    conversationId: "conv_123",
    organizationId: "org_123",
    localUserId: "user_123",
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

    it("denies job creation when the organization job budget is exceeded", async () => {
      assertOrganizationCanEnqueueTranslationJobMock.mockResolvedValueOnce(
        err({
          code: "organization_job_budget_exceeded",
          message: "Organization job creation rate limit exceeded. Try again later.",
        }),
      );

      const tool = createTranslationJobTool(mockCtx("admin"));
      const result = await executeTool(tool, {
        type: "string",
        sourceText: "hello",
        sourceLocale: "en",
        targetLocales: ["fr"],
      });

      expect(assertOrganizationCanEnqueueTranslationJobMock).toHaveBeenCalledWith("org_123");
      expect(result.success).toBe(false);
      expect(result.error).toContain("rate limit exceeded");
    });

    it("denies file translation jobs for inaccessible workspace source files", async () => {
      vi.mocked(getStoredFileForJobScope).mockResolvedValueOnce({
        id: "file_private",
        organizationId: "org_123",
        projectId: null,
        createdByUserId: "user_other",
        filename: "private.json",
      } as any);
      vi.mocked(toolCanAccessStoredFileProject).mockResolvedValueOnce(false);

      const tool = createTranslationJobTool(mockCtx("admin"));
      const result = await executeTool(tool, {
        type: "file",
        sourceFileId: "file_private",
        fileFormat: "json",
        sourceLocale: "en",
        targetLocales: ["fr"],
      });

      expect(toolCanAccessStoredFileProject).toHaveBeenCalledWith(
        expect.objectContaining({ localUserId: "user_123" }),
        null,
        "user_other",
      );
      expect(result.success).toBe(false);
      expect(result.error).toContain("Source file was not found");
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

    it("allows create access to admins", async () => {
      const tool = createCreateGlossaryTool(mockCtx("admin"));
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
