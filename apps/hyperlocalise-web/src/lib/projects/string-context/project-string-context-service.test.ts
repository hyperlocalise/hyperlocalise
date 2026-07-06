import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { and, eq } from "drizzle-orm";

const {
  createRepositorySandboxMock,
  resolveWebProjectRepositoryGitHubContextMock,
  runSubagentMock,
  stopRepositorySandboxMock,
  reserveAgentRuntimeUsageMock,
  trackSucceededAgentRuntimeUsageMock,
} = vi.hoisted(() => ({
  createRepositorySandboxMock: vi.fn(),
  resolveWebProjectRepositoryGitHubContextMock: vi.fn(),
  runSubagentMock: vi.fn(),
  stopRepositorySandboxMock: vi.fn(),
  reserveAgentRuntimeUsageMock: vi.fn(),
  trackSucceededAgentRuntimeUsageMock: vi.fn(),
}));

vi.mock("@/lib/agents/repository-context", () => ({
  buildRepositoryGitHubContextInstructions: vi.fn(
    (context: { repositoryFullName: string }) => `repository: ${context.repositoryFullName}`,
  ),
  resolveWebProjectRepositoryGitHubContext: resolveWebProjectRepositoryGitHubContextMock,
}));

vi.mock("@/lib/agent-runtime/workspaces/repository-sandbox", () => ({
  createRepositorySandbox: createRepositorySandboxMock,
  stopRepositorySandbox: stopRepositorySandboxMock,
}));

vi.mock("@/lib/agent-runtime/subagents/run-subagent", () => ({
  runSubagent: runSubagentMock,
}));

vi.mock("@/lib/billing/agent-runtime-usage", () => ({
  reserveAgentRuntimeUsage: reserveAgentRuntimeUsageMock,
  trackSucceededAgentRuntimeUsage: trackSucceededAgentRuntimeUsageMock,
}));

import { createProjectTestFixture } from "@/api/routes/project/project.fixture";
import { db, schema } from "@/lib/database";
import { isErr } from "@/lib/primitives/result/results";

import {
  lookupCachedProjectFileStringRepositoryContext,
  lookupProjectFileStringRepositoryContext,
} from "./project-string-context-service";

const fixture = createProjectTestFixture();

function baseInput(input: {
  organizationId: string;
  projectId: string;
  localUserId: string;
  repositoryFullName?: string | null;
}) {
  return {
    organizationId: input.organizationId,
    projectId: input.projectId,
    repositoryFullName: input.repositoryFullName ?? null,
    sourcePath: "locales/en.json",
    key: "home.hero.title",
    text: "Ship localized product experiences",
    context: null,
    localUserId: input.localUserId,
    membershipRole: "admin" as const,
    displayName: "Test User",
    email: "test@example.com",
  };
}

async function insertRepository(input: {
  organizationId: string;
  githubRepositoryId: string;
  fullName: string;
  enabled?: boolean;
  archived?: boolean;
}) {
  const [owner, name] = input.fullName.split("/");
  await db.insert(schema.githubInstallationRepositories).values({
    organizationId: input.organizationId,
    githubInstallationId: "12345",
    githubRepositoryId: input.githubRepositoryId,
    owner: owner ?? "hyperlocalise",
    name: name ?? "unknown",
    fullName: input.fullName,
    private: true,
    archived: input.archived ?? false,
    defaultBranch: "main",
    enabled: input.enabled ?? true,
  });
}

describe("lookupProjectFileStringRepositoryContext", () => {
  beforeEach(() => {
    createRepositorySandboxMock.mockResolvedValue("sandbox-test");
    resolveWebProjectRepositoryGitHubContextMock.mockImplementation(
      async (input: { repositoryFullName: string }) => ({
        status: "resolved",
        source: "workspace_config",
        context: {
          resolved: true,
          installationId: 12345,
          repositoryFullName: input.repositoryFullName,
        },
      }),
    );
    runSubagentMock.mockResolvedValue({ text: "Found this key in the homepage hero." });
    stopRepositorySandboxMock.mockResolvedValue(undefined);
    reserveAgentRuntimeUsageMock.mockResolvedValue(true);
    trackSucceededAgentRuntimeUsageMock.mockResolvedValue(undefined);
  });

  afterEach(async () => {
    vi.clearAllMocks();
    await fixture.cleanup();
  });

  it("returns cached repository context without invoking the repository agent", async () => {
    const { organization, project, user } = await fixture.createStoredProjectFixture();
    await insertRepository({
      organizationId: organization.id,
      githubRepositoryId: "1001",
      fullName: "hyperlocalise/selected",
    });

    const { saveProjectFileStringRepositoryContext } =
      await import("./project-string-context-service");
    await saveProjectFileStringRepositoryContext({
      organizationId: organization.id,
      projectId: project.id,
      sourcePath: "locales/en.json",
      stringKey: "home.hero.title",
      repositoryFullName: "hyperlocalise/selected",
      sourceText: "Ship localized product experiences",
      summary: "Cached hero headline context.",
      createdByUserId: user.id,
    });

    const result = await lookupProjectFileStringRepositoryContext(
      baseInput({
        organizationId: organization.id,
        projectId: project.id,
        localUserId: user.id,
      }),
    );

    expect(isErr(result)).toBe(false);
    if (!result.ok) {
      throw new Error("expected cached lookup to succeed");
    }
    expect(result.value).toEqual({
      summary: "Cached hero headline context.",
      cached: true,
    });
    expect(resolveWebProjectRepositoryGitHubContextMock).not.toHaveBeenCalled();
    expect(runSubagentMock).not.toHaveBeenCalled();
    expect(reserveAgentRuntimeUsageMock).not.toHaveBeenCalled();
    expect(trackSucceededAgentRuntimeUsageMock).not.toHaveBeenCalled();
  });

  it("uses an explicit repository name without auto-selecting from enabled repositories", async () => {
    const { organization, project, user } = await fixture.createStoredProjectFixture();

    const result = await lookupProjectFileStringRepositoryContext(
      baseInput({
        organizationId: organization.id,
        projectId: project.id,
        localUserId: user.id,
        repositoryFullName: "hyperlocalise/explicit",
      }),
    );

    expect(isErr(result)).toBe(false);
    if (!result.ok) {
      throw new Error("expected lookup to succeed");
    }
    expect(result.value.cached).toBe(false);
    expect(resolveWebProjectRepositoryGitHubContextMock).toHaveBeenCalledWith({
      organizationId: organization.id,
      repositoryFullName: "hyperlocalise/explicit",
    });
    expect(runSubagentMock).toHaveBeenCalledWith(
      "repository",
      expect.objectContaining({
        toolContext: expect.objectContaining({
          githubContext: expect.objectContaining({
            repositoryFullName: "hyperlocalise/explicit",
          }),
        }),
      }),
    );
    expect(stopRepositorySandboxMock).toHaveBeenCalledWith("sandbox-test");
    expect(reserveAgentRuntimeUsageMock).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: organization.id,
        source: "project_file_string_context_lookup",
      }),
    );
    expect(trackSucceededAgentRuntimeUsageMock).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: organization.id,
      }),
    );
  });

  it("caches context for an external project without materializing it", async () => {
    const { organization, user } = await fixture.createLocalWorkosIdentity();
    const projectId = "ext:crowdin:9";
    const input = baseInput({
      organizationId: organization.id,
      projectId,
      localUserId: user.id,
      repositoryFullName: "hyperlocalise/explicit",
    });

    const firstResult = await lookupProjectFileStringRepositoryContext(input);
    const secondResult = await lookupProjectFileStringRepositoryContext(input);

    expect(firstResult).toEqual({
      ok: true,
      value: {
        summary: "Found this key in the homepage hero.",
        cached: false,
      },
    });
    expect(secondResult).toEqual({
      ok: true,
      value: {
        summary: "Found this key in the homepage hero.",
        cached: true,
      },
    });
    expect(runSubagentMock).toHaveBeenCalledTimes(1);

    const projectRows = await db
      .select({ id: schema.projects.id })
      .from(schema.projects)
      .where(
        and(eq(schema.projects.organizationId, organization.id), eq(schema.projects.id, projectId)),
      );
    expect(projectRows).toEqual([]);
  });

  it("returns repository_not_enabled when no repository is specified and none are enabled", async () => {
    const { organization, project, user } = await fixture.createStoredProjectFixture();

    const result = await lookupProjectFileStringRepositoryContext(
      baseInput({
        organizationId: organization.id,
        projectId: project.id,
        localUserId: user.id,
      }),
    );

    expect(result).toEqual({
      ok: false,
      error: expect.objectContaining({
        code: "repository_not_enabled",
      }),
    });
    expect(resolveWebProjectRepositoryGitHubContextMock).not.toHaveBeenCalled();
    expect(runSubagentMock).not.toHaveBeenCalled();
  });

  it("auto-selects the only enabled, unarchived repository when no repository is specified", async () => {
    const { organization, project, user } = await fixture.createStoredProjectFixture();
    await insertRepository({
      organizationId: organization.id,
      githubRepositoryId: "1001",
      fullName: "hyperlocalise/selected",
    });
    await insertRepository({
      organizationId: organization.id,
      githubRepositoryId: "1002",
      fullName: "hyperlocalise/disabled",
      enabled: false,
    });
    await insertRepository({
      organizationId: organization.id,
      githubRepositoryId: "1003",
      fullName: "hyperlocalise/archived",
      archived: true,
    });

    const result = await lookupProjectFileStringRepositoryContext(
      baseInput({
        organizationId: organization.id,
        projectId: project.id,
        localUserId: user.id,
      }),
    );

    expect(isErr(result)).toBe(false);
    if (!result.ok) {
      throw new Error("expected lookup to succeed");
    }
    expect(result.value.cached).toBe(false);
    expect(resolveWebProjectRepositoryGitHubContextMock).toHaveBeenCalledWith({
      organizationId: organization.id,
      repositoryFullName: "hyperlocalise/selected",
    });
    expect(runSubagentMock).toHaveBeenCalledWith(
      "repository",
      expect.objectContaining({
        toolContext: expect.objectContaining({
          githubContext: expect.objectContaining({
            repositoryFullName: "hyperlocalise/selected",
          }),
        }),
      }),
    );
    expect(stopRepositorySandboxMock).toHaveBeenCalledWith("sandbox-test");
  });

  it("completes reserved usage when the repository agent returns only whitespace", async () => {
    const { organization, project, user } = await fixture.createStoredProjectFixture();
    runSubagentMock.mockResolvedValue({ text: " \n\t " });

    const result = await lookupProjectFileStringRepositoryContext(
      baseInput({
        organizationId: organization.id,
        projectId: project.id,
        localUserId: user.id,
        repositoryFullName: "hyperlocalise/explicit",
      }),
    );

    expect(result).toEqual({
      ok: false,
      error: expect.objectContaining({
        code: "agent_failed",
      }),
    });
    expect(reserveAgentRuntimeUsageMock).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: organization.id,
        source: "project_file_string_context_lookup",
      }),
    );
    expect(trackSucceededAgentRuntimeUsageMock).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: organization.id,
      }),
    );
    expect(stopRepositorySandboxMock).toHaveBeenCalledWith("sandbox-test");
  });

  it("returns repository_context_ambiguous when multiple enabled repositories match", async () => {
    const { organization, project, user } = await fixture.createStoredProjectFixture();
    await insertRepository({
      organizationId: organization.id,
      githubRepositoryId: "2001",
      fullName: "hyperlocalise/first",
    });
    await insertRepository({
      organizationId: organization.id,
      githubRepositoryId: "2002",
      fullName: "hyperlocalise/second",
    });

    const result = await lookupProjectFileStringRepositoryContext(
      baseInput({
        organizationId: organization.id,
        projectId: project.id,
        localUserId: user.id,
      }),
    );

    expect(result).toEqual({
      ok: false,
      error: expect.objectContaining({
        code: "repository_context_ambiguous",
      }),
    });
    expect(resolveWebProjectRepositoryGitHubContextMock).not.toHaveBeenCalled();
    expect(runSubagentMock).not.toHaveBeenCalled();
  });
});

describe("lookupCachedProjectFileStringRepositoryContext", () => {
  afterEach(async () => {
    vi.clearAllMocks();
    await fixture.cleanup();
  });

  it("returns cached context without requiring a repository selection", async () => {
    const { organization, project, user } = await fixture.createStoredProjectFixture();
    await insertRepository({
      organizationId: organization.id,
      githubRepositoryId: "2001",
      fullName: "hyperlocalise/first",
    });
    await insertRepository({
      organizationId: organization.id,
      githubRepositoryId: "2002",
      fullName: "hyperlocalise/second",
    });

    const { saveProjectFileStringRepositoryContext } =
      await import("./project-string-context-service");
    await saveProjectFileStringRepositoryContext({
      organizationId: organization.id,
      projectId: project.id,
      sourcePath: "locales/en.json",
      stringKey: "home.hero.title",
      repositoryFullName: "hyperlocalise/second",
      sourceText: "Ship localized product experiences",
      summary: "Cached hero headline context.",
      createdByUserId: user.id,
    });

    const result = await lookupCachedProjectFileStringRepositoryContext(
      baseInput({
        organizationId: organization.id,
        projectId: project.id,
        localUserId: user.id,
      }),
    );

    expect(isErr(result)).toBe(false);
    if (!result.ok) {
      throw new Error("expected cached lookup to succeed");
    }
    expect(result.value).toEqual({
      summary: "Cached hero headline context.",
      cached: true,
    });
  });

  it("prefers the explicitly selected repository when multiple caches exist", async () => {
    const { organization, project, user } = await fixture.createStoredProjectFixture();

    const { saveProjectFileStringRepositoryContext } =
      await import("./project-string-context-service");
    await saveProjectFileStringRepositoryContext({
      organizationId: organization.id,
      projectId: project.id,
      sourcePath: "locales/en.json",
      stringKey: "home.hero.title",
      repositoryFullName: "hyperlocalise/web",
      sourceText: "Ship localized product experiences",
      summary: "Web repository context.",
      createdByUserId: user.id,
    });
    await saveProjectFileStringRepositoryContext({
      organizationId: organization.id,
      projectId: project.id,
      sourcePath: "locales/en.json",
      stringKey: "home.hero.title",
      repositoryFullName: "hyperlocalise/legacy",
      sourceText: "Ship localized product experiences",
      summary: "Legacy repository context.",
      createdByUserId: user.id,
    });

    const result = await lookupCachedProjectFileStringRepositoryContext({
      ...baseInput({
        organizationId: organization.id,
        projectId: project.id,
        localUserId: user.id,
      }),
      repositoryFullName: "hyperlocalise/web",
    });

    expect(isErr(result)).toBe(false);
    if (!result.ok) {
      throw new Error("expected cached lookup to succeed");
    }
    expect(result.value.summary).toBe("Web repository context.");
  });
});
