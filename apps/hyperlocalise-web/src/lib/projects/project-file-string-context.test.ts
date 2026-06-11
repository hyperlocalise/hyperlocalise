import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

const {
  createRepositorySandboxMock,
  resolveWebProjectRepositoryGitHubContextMock,
  runSubagentMock,
  stopRepositorySandboxMock,
} = vi.hoisted(() => ({
  createRepositorySandboxMock: vi.fn(),
  resolveWebProjectRepositoryGitHubContextMock: vi.fn(),
  runSubagentMock: vi.fn(),
  stopRepositorySandboxMock: vi.fn(),
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

import { createProjectTestFixture } from "@/api/routes/project/project.fixture";
import { db, schema } from "@/lib/database";
import { isErr } from "@/lib/primitives/result/results";

import { lookupProjectFileStringRepositoryContext } from "./project-file-string-context";

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
  });

  afterEach(async () => {
    vi.clearAllMocks();
    await fixture.cleanup();
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
    expect(resolveWebProjectRepositoryGitHubContextMock).toHaveBeenCalledWith({
      organizationId: organization.id,
      repositoryFullName: "hyperlocalise/selected",
    });
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
