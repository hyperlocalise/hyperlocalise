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

const { assertOrganizationCanEnqueueTranslationJobInTransactionMock } = vi.hoisted(() => ({
  assertOrganizationCanEnqueueTranslationJobInTransactionMock: vi.fn(async () => ok(undefined)),
}));

vi.mock("@/lib/security/organization-operation-budget", () => ({
  assertOrganizationCanEnqueueTranslationJobInTransaction:
    assertOrganizationCanEnqueueTranslationJobInTransactionMock,
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
        returning: vi.fn(() => [{ id: "job_123", status: "queued" }]),
      })),
    })),
  },
  schema: {
    jobs: { id: "jobs" },
    translationJobDetails: { jobId: "jobId" },
    reviewJobDetails: { jobId: "reviewJobId" },
    syncJobDetails: { jobId: "syncJobId" },
    assetManagementJobDetails: { jobId: "assetJobId" },
    glossaries: { id: "glossaries" },
    glossaryConcepts: { id: "glossaryConcepts" },
    glossaryTerms: { id: "glossaryTerms" },
    memories: { id: "memories" },
    memoryEntries: { id: "memoryEntries" },
    projects: { id: "id", organizationId: "organizationId", teamId: "teamId" },
  },
}));

vi.mock("@/lib/workflow/queues", () => ({
  createTranslationJobEventQueue: () => ({
    enqueue: vi.fn(async () => ({ ids: ["run_translation_1"] })),
  }),
  createReviewJobEventQueue: () => ({
    enqueue: vi.fn(async () => ({ ids: ["run_review_1"] })),
  }),
}));

vi.mock("@/lib/agent-runtime/tools/tool-access", () => ({
  toolCanAccessProject: vi.fn(async () => ({ id: "project_123" })),
  toolCanAccessGlossary: vi.fn(async () => true),
  toolCanAccessMemory: vi.fn(async () => true),
  toolGetAccessibleGlossary: vi.fn(async () => ({
    id: "glossary_123",
    source: "native",
    controlLevel: "team",
    sourceLocale: "en",
    targetLocale: "fr",
  })),
  toolGetAccessibleMemory: vi.fn(async () => ({ id: "memory_123" })),
  toolGlossaryOrgMutationWhere: vi.fn(() => ({})),
  toolMemoryOrgMutationWhere: vi.fn(() => ({})),
  toolCanAccessStoredFileProject: vi.fn(async () => true),
  toolAccessibleProjectsWhere: vi.fn(async () => ({})),
  toolAccessibleJobsWhere: vi.fn(async () => ({})),
  toolProjectLinkedGlossaryWhere: vi.fn(async () => ({})),
  toolProjectLinkedMemoryWhere: vi.fn(async () => ({})),
}));

import {
  createAssetManagementJobTool,
  createGetJobStatusTool,
  createListJobsTool,
  createResearchJobTool,
  createReviewJobTool,
  createSyncJobTool,
  createTranslationJobTool,
} from "@/lib/agent-runtime/tools/translation-tools";
import { getStoredFileForJobScope } from "@/lib/file-storage/records";
import {
  toolAccessibleJobsWhere,
  toolCanAccessProject,
  toolCanAccessStoredFileProject,
} from "@/lib/agent-runtime/tools/tool-access";
import type { OrganizationMembershipRole } from "@/lib/database/types";
import {
  createCreateGlossaryTool,
  createDeleteGlossaryTool,
  createUpdateGlossaryTool,
} from "./glossary-tools";
import {
  createCreateMemoryEntryTool,
  createCreateTranslationMemoryTool,
  createDeleteMemoryEntryTool,
  createDeleteTranslationMemoryTool,
  createUpdateMemoryEntryTool,
  createUpdateTranslationMemoryTool,
} from "./memory-tools";
import type { ToolContext } from "@/lib/tools/types";

const WRITE_DENIED_ROLES = [
  "developer",
  "reviewer",
  "translator",
  "member",
] as const satisfies readonly OrganizationMembershipRole[];

const WRITE_ALLOWED_ROLES = [
  "admin",
  "localization_manager",
] as const satisfies readonly OrganizationMembershipRole[];

const JOB_CREATE_DENIED_ROLES = ["member"] as const satisfies readonly OrganizationMembershipRole[];

const JOB_CREATE_ALLOWED_ROLES = [
  "admin",
  "localization_manager",
  "developer",
  "reviewer",
  "translator",
] as const satisfies readonly OrganizationMembershipRole[];

describe("Agent Tools RBAC", () => {
  const mockCtx = (role: OrganizationMembershipRole): ToolContext => ({
    conversationId: "conv_123",
    organizationId: "org_123",
    localUserId: "user_123",
    membershipRole: role,
    projectId: "project_123",
    db: {
      transaction: vi.fn(async (cb) =>
        cb({
          execute: vi.fn(async () => undefined),
          insert: vi.fn(() => ({
            values: vi.fn(() => ({
              returning: vi.fn(() => [{ id: "mutated_123", status: "queued" }]),
              onConflictDoNothing: vi.fn(() => ({
                returning: vi.fn(() => [{ id: "mutated_123", status: "queued" }]),
              })),
            })),
          })),
          update: vi.fn(() => ({
            set: vi.fn(() => ({
              where: vi.fn(() => ({
                returning: vi.fn(() => [{ id: "mutated_123", status: "queued" }]),
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
          returning: vi.fn(() => [{ id: "mutated_123", status: "queued" }]),
          onConflictDoNothing: vi.fn(() => ({
            returning: vi.fn(() => [{ id: "mutated_123" }]),
          })),
        })),
      })),
      update: vi.fn(() => ({
        set: vi.fn(() => ({
          where: vi.fn(() => ({
            returning: vi.fn(() => [{ id: "mutated_123", status: "queued" }]),
          })),
        })),
      })),
      delete: vi.fn(() => ({
        where: vi.fn(() => ({
          returning: vi.fn(() => [{ id: "mutated_123" }]),
        })),
      })),
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn(async () => []),
          })),
          innerJoin: vi.fn(() => ({
            where: vi.fn(() => ({
              limit: vi.fn(async () => [
                {
                  glossaryId: "g_123",
                  glossaryOrgId: "org_123",
                  memoryOrgId: "org_123",
                  controlLevel: "team",
                  source: "native",
                },
              ]),
            })),
          })),
        })),
      })),
    } as any,
  });

  const toolCallInfo = { toolCallId: "test-tool-call", messages: [], context: {} };

  async function executeTool(tool: any, input: any) {
    if (!tool.execute) {
      throw new Error("Tool is missing execute");
    }
    return tool.execute(input, toolCallInfo);
  }

  function dbSpy(
    ctx: ToolContext,
    method: "insert" | "select" | "update" | "delete" | "transaction",
  ) {
    return ctx.db[method] as ReturnType<typeof vi.fn>;
  }

  describe("Translation Job Tools", () => {
    it.each(JOB_CREATE_DENIED_ROLES)("denies translation job create for %s", async (role) => {
      const ctx = mockCtx(role);
      const tool = createTranslationJobTool(ctx);
      const result = await executeTool(tool, {
        type: "string",
        sourceText: "hello",
        sourceLocale: "en",
        targetLocales: ["fr"],
      });
      expect(result.success).toBe(false);
      expect(result.error).toContain("permission");
      expect(dbSpy(ctx, "transaction")).not.toHaveBeenCalled();
    });

    it.each(JOB_CREATE_ALLOWED_ROLES)(
      "allows translation job create past the capability gate for %s",
      async (role) => {
        const tool = createTranslationJobTool(mockCtx(role));
        const result = await executeTool(tool, {
          type: "string",
          sourceText: "hello",
          sourceLocale: "en",
          targetLocales: ["fr"],
        });
        expect(result.success).toBe(true);
        expect(result.error).toBeUndefined();
      },
    );

    it("denies job creation when the organization job budget is exceeded", async () => {
      assertOrganizationCanEnqueueTranslationJobInTransactionMock.mockResolvedValueOnce(
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

      expect(assertOrganizationCanEnqueueTranslationJobInTransactionMock).toHaveBeenCalledWith(
        expect.anything(),
        "org_123",
      );
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

  describe("List / Get Job Tools access filtering", () => {
    it("returns no jobs when list_jobs projectId is outside tool access", async () => {
      vi.mocked(toolCanAccessProject).mockResolvedValueOnce(null as never);

      const ctx = mockCtx("translator");
      const tool = createListJobsTool(ctx);
      const result = await executeTool(tool, {
        projectId: "project_outside_access",
        limit: 20,
      });

      expect(toolCanAccessProject).toHaveBeenCalledWith(
        expect.objectContaining({
          organizationId: "org_123",
          localUserId: "user_123",
        }),
        "project_outside_access",
      );
      expect(result).toEqual({ jobs: [] });
      expect(dbSpy(ctx, "select")).not.toHaveBeenCalled();
    });

    it("hides get_job_status details when the job is outside accessible jobs", async () => {
      const limitMock = vi.fn(async () => []);
      const whereMock = vi.fn(() => ({ limit: limitMock }));
      const leftJoinMock = vi.fn(() => ({
        leftJoin: leftJoinMock,
        where: whereMock,
      }));
      const fromMock = vi.fn(() => ({
        leftJoin: leftJoinMock,
      }));
      const selectMock = vi.fn(() => ({
        from: fromMock,
      }));

      const ctx = mockCtx("translator");
      (ctx.db as any).select = selectMock;

      const tool = createGetJobStatusTool(ctx);
      const result = await executeTool(tool, { jobId: "job_hidden" });

      expect(toolAccessibleJobsWhere).toHaveBeenCalledWith(
        expect.objectContaining({
          organizationId: "org_123",
          localUserId: "user_123",
        }),
      );
      expect(result).toEqual({
        job: null,
        error: "Job job_hidden not found.",
      });
      expect(limitMock).toHaveBeenCalledWith(1);
    });
  });

  describe("Review / Research / Sync / Asset Job Tools", () => {
    it.each(JOB_CREATE_DENIED_ROLES)("denies review job create for %s", async (role) => {
      const ctx = mockCtx(role);
      const tool = createReviewJobTool(ctx);
      const result = await executeTool(tool, {
        criteria: "tone and consistency",
        targetLocale: "ja",
      });
      expect(result.success).toBe(false);
      expect(result.error).toContain("permission");
      expect(dbSpy(ctx, "transaction")).not.toHaveBeenCalled();
    });

    it.each(JOB_CREATE_ALLOWED_ROLES)(
      "allows review job create past the capability gate for %s",
      async (role) => {
        const tool = createReviewJobTool(mockCtx(role));
        const result = await executeTool(tool, {
          criteria: "tone and consistency",
          targetLocale: "ja",
        });
        expect(result.success).toBe(true);
        expect(result.jobId).toBe("mutated_123");
        expect(result.error).toBeUndefined();
      },
    );

    it("requires a project before creating a review job", async () => {
      const ctx = mockCtx("admin");
      ctx.projectId = null;
      const tool = createReviewJobTool(ctx);
      const result = await executeTool(tool, {
        criteria: "terminology compliance",
      });
      expect(result.success).toBe(false);
      expect(result.error).toContain("Attach a project");
      expect(dbSpy(ctx, "transaction")).not.toHaveBeenCalled();
    });

    it.each(JOB_CREATE_DENIED_ROLES)("denies research job create for %s", async (role) => {
      const ctx = mockCtx(role);
      const tool = createResearchJobTool(ctx);
      const result = await executeTool(tool, {
        scope: "cultural reference viability",
        targetLocales: ["pt-BR"],
      });
      expect(result.success).toBe(false);
      expect(result.error).toContain("permission");
      expect(dbSpy(ctx, "transaction")).not.toHaveBeenCalled();
    });

    it.each(JOB_CREATE_ALLOWED_ROLES)(
      "allows research job create past the capability gate for %s",
      async (role) => {
        const tool = createResearchJobTool(mockCtx(role));
        const result = await executeTool(tool, {
          scope: "cultural reference viability",
          targetLocales: ["pt-BR"],
        });
        expect(result.success).toBe(true);
        expect(result.jobId).toBe("mutated_123");
        expect(result.status).toBe("queued");
      },
    );

    it.each(JOB_CREATE_DENIED_ROLES)("denies sync job create for %s", async (role) => {
      const ctx = mockCtx(role);
      const tool = createSyncJobTool(ctx);
      const result = await executeTool(tool, {
        connectorKind: "github",
        direction: "pull",
        externalIdentifiers: { repository: "owner/repo" },
      });
      expect(result.success).toBe(false);
      expect(result.error).toContain("permission");
      expect(dbSpy(ctx, "transaction")).not.toHaveBeenCalled();
    });

    it.each(JOB_CREATE_ALLOWED_ROLES)(
      "allows sync job create past the capability gate for %s",
      async (role) => {
        const tool = createSyncJobTool(mockCtx(role));
        const result = await executeTool(tool, {
          connectorKind: "github",
          direction: "pull",
          externalIdentifiers: { repository: "owner/repo" },
        });
        expect(result.success).toBe(true);
        expect(result.jobId).toBe("mutated_123");
      },
    );

    it.each(JOB_CREATE_DENIED_ROLES)("denies asset-management job create for %s", async (role) => {
      const ctx = mockCtx(role);
      const tool = createAssetManagementJobTool(ctx);
      const result = await executeTool(tool, {
        assetType: "glossary",
        operation: "import",
      });
      expect(result.success).toBe(false);
      expect(result.error).toContain("permission");
      expect(dbSpy(ctx, "transaction")).not.toHaveBeenCalled();
    });

    it.each(JOB_CREATE_ALLOWED_ROLES)(
      "allows asset-management job create past the capability gate for %s",
      async (role) => {
        const tool = createAssetManagementJobTool(mockCtx(role));
        const result = await executeTool(tool, {
          assetType: "glossary",
          operation: "import",
        });
        expect(result.success).toBe(true);
        expect(result.jobId).toBe("mutated_123");
      },
    );

    it("denies research job creation when the organization job budget is exceeded", async () => {
      assertOrganizationCanEnqueueTranslationJobInTransactionMock.mockResolvedValueOnce(
        err({
          code: "organization_job_budget_exceeded",
          message: "Organization job creation rate limit exceeded. Try again later.",
        }),
      );

      const tool = createResearchJobTool(mockCtx("developer"));
      const result = await executeTool(tool, {
        scope: "competitor wording",
        targetLocales: ["ja-JP"],
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain("rate limit exceeded");
    });
  });

  describe("Glossary Tools", () => {
    it.each(WRITE_DENIED_ROLES)("denies glossary create for %s", async (role) => {
      const tool = createCreateGlossaryTool(mockCtx(role));
      const result = await executeTool(tool, {
        name: "Test",
        sourceLocale: "en",
      });
      expect(result.success).toBe(false);
      expect(result.error).toContain("permission");
    });

    it.each(WRITE_ALLOWED_ROLES)("allows glossary create for %s", async (role) => {
      const tool = createCreateGlossaryTool(mockCtx(role));
      const result = await executeTool(tool, {
        name: "Test",
        sourceLocale: "en",
      });
      expect(result.success).not.toBe(false);
      expect(result.error).toBeUndefined();
    });

    it.each(WRITE_DENIED_ROLES)("denies glossary update for %s", async (role) => {
      const tool = createUpdateGlossaryTool(mockCtx(role));
      const result = await executeTool(tool, {
        glossaryId: "g_123",
        name: "New Name",
      });
      expect(result.success).toBe(false);
      expect(result.error).toContain("permission");
    });

    it.each(WRITE_DENIED_ROLES)("denies glossary delete for %s", async (role) => {
      const tool = createDeleteGlossaryTool(mockCtx(role));
      const result = await executeTool(tool, {
        glossaryId: "g_123",
      });
      expect(result.success).toBe(false);
      expect(result.error).toContain("permission");
    });
  });

  describe("Translation Memory Tools", () => {
    it.each(WRITE_DENIED_ROLES)("denies memory create for %s", async (role) => {
      const tool = createCreateTranslationMemoryTool(mockCtx(role));
      const result = await executeTool(tool, {
        name: "Test",
      });
      expect(result.success).toBe(false);
      expect(result.error).toContain("permission");
    });

    it.each(WRITE_DENIED_ROLES)("denies memory update for %s", async (role) => {
      const tool = createUpdateTranslationMemoryTool(mockCtx(role));
      const result = await executeTool(tool, {
        memoryId: "m_123",
        name: "New Name",
      });
      expect(result.success).toBe(false);
      expect(result.error).toContain("permission");
    });

    it.each(WRITE_DENIED_ROLES)("denies memory delete for %s", async (role) => {
      const tool = createDeleteTranslationMemoryTool(mockCtx(role));
      const result = await executeTool(tool, {
        memoryId: "m_123",
      });
      expect(result.success).toBe(false);
      expect(result.error).toContain("permission");
    });

    it.each(WRITE_DENIED_ROLES)("denies memory entry create for %s", async (role) => {
      const ctx = mockCtx(role);
      const tool = createCreateMemoryEntryTool(ctx);
      const result = await executeTool(tool, {
        memoryId: "m_123",
        sourceLocale: "en",
        targetLocale: "fr",
        sourceText: "Hello",
        targetText: "Bonjour",
      });
      expect(result.success).toBe(false);
      expect(result.error).toContain("permission");
      expect(dbSpy(ctx, "insert")).not.toHaveBeenCalled();
    });

    it.each(WRITE_DENIED_ROLES)("denies memory entry update for %s", async (role) => {
      const ctx = mockCtx(role);
      const tool = createUpdateMemoryEntryTool(ctx);
      const result = await executeTool(tool, {
        entryId: "entry_123",
        targetText: "Salut",
      });
      expect(result.success).toBe(false);
      expect(result.error).toContain("permission");
      expect(dbSpy(ctx, "select")).not.toHaveBeenCalled();
      expect(dbSpy(ctx, "update")).not.toHaveBeenCalled();
    });

    it.each(WRITE_DENIED_ROLES)("denies memory entry delete for %s", async (role) => {
      const ctx = mockCtx(role);
      const tool = createDeleteMemoryEntryTool(ctx);
      const result = await executeTool(tool, {
        entryId: "entry_123",
      });
      expect(result.success).toBe(false);
      expect(result.error).toContain("permission");
      expect(dbSpy(ctx, "select")).not.toHaveBeenCalled();
      expect(dbSpy(ctx, "delete")).not.toHaveBeenCalled();
    });

    it.each(WRITE_ALLOWED_ROLES)(
      "allows memory entry create past the capability gate for %s",
      async (role) => {
        const tool = createCreateMemoryEntryTool(mockCtx(role));
        const result = await executeTool(tool, {
          memoryId: "m_123",
          sourceLocale: "en",
          targetLocale: "fr",
          sourceText: "Hello",
          targetText: "Bonjour",
        });
        expect(result.success).toBe(true);
        expect(result.error).toBeUndefined();
      },
    );
  });
});
