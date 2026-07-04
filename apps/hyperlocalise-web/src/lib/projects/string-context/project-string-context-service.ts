import { createHash, randomUUID } from "node:crypto";

import { and, eq, inArray } from "drizzle-orm";

import {
  buildRepositoryGitHubContextInstructions,
  resolveWebProjectRepositoryGitHubContext,
} from "@/lib/agents/repository-context";
import { runSubagent } from "@/lib/agent-runtime/subagents/run-subagent";
import {
  createRepositorySandbox,
  stopRepositorySandbox,
} from "@/lib/agent-runtime/workspaces/repository-sandbox";
import { ensureAgentSession } from "@/lib/tools/types";
import type { ToolContext } from "@/lib/tools/types";
import { db, schema } from "@/lib/database";
import type { OrganizationMembershipRole } from "@/lib/database/types";
import { serializeErrorForLog } from "@/lib/log";
import { ProjectServiceBase } from "@/lib/projects/project-service-base";
import { err, isErr, ok, type Result } from "@/lib/primitives/result/results";

export type ProjectFileStringRepositoryContextRecord = {
  stringKey: string;
  repositoryFullName: string;
  sourceTextHash: string;
  summary: string;
  updatedAt: Date;
};

export type ProjectFileStringContextError =
  | { code: "repository_not_enabled"; message: string }
  | { code: "repository_context_ambiguous"; message: string }
  | { code: "repository_access_failed"; message: string }
  | { code: "agent_failed"; message: string };

export class ProjectStringContextService extends ProjectServiceBase {
  constructor(database: typeof db = db) {
    super(database, "projects.string-context");
  }

  hashSourceText(text: string): string {
    return createHash("sha256").update(text.trim()).digest("hex");
  }

  async getCached(input: {
    organizationId: string;
    projectId: string;
    sourcePath: string;
    stringKey: string;
    repositoryFullName: string;
    sourceText: string;
  }): Promise<string | null> {
    const [row] = await this.database
      .select({
        summary: schema.projectFileStringRepositoryContexts.summary,
        sourceTextHash: schema.projectFileStringRepositoryContexts.sourceTextHash,
      })
      .from(schema.projectFileStringRepositoryContexts)
      .where(
        and(
          eq(schema.projectFileStringRepositoryContexts.organizationId, input.organizationId),
          eq(schema.projectFileStringRepositoryContexts.projectId, input.projectId),
          eq(schema.projectFileStringRepositoryContexts.sourcePath, input.sourcePath),
          eq(schema.projectFileStringRepositoryContexts.stringKey, input.stringKey),
          eq(
            schema.projectFileStringRepositoryContexts.repositoryFullName,
            input.repositoryFullName,
          ),
        ),
      )
      .limit(1);

    if (!row) {
      this.log.debug(
        {
          organizationId: input.organizationId,
          projectId: input.projectId,
          stringKey: input.stringKey,
          outcome: "miss",
        },
        "project file string context cache lookup",
      );
      return null;
    }

    const sourceTextHash = this.hashSourceText(input.sourceText);
    if (row.sourceTextHash !== sourceTextHash) {
      this.log.debug(
        {
          organizationId: input.organizationId,
          projectId: input.projectId,
          stringKey: input.stringKey,
          outcome: "stale",
        },
        "project file string context cache lookup",
      );
      return null;
    }

    this.log.debug(
      {
        organizationId: input.organizationId,
        projectId: input.projectId,
        stringKey: input.stringKey,
        outcome: "hit",
      },
      "project file string context cache lookup",
    );

    return row.summary;
  }

  async listCached(input: {
    organizationId: string;
    projectId: string;
    sourcePath: string;
    stringKeys: string[];
    preferredRepositoryFullName?: string | null;
    sourceTextByKey: ReadonlyMap<string, string>;
  }): Promise<Map<string, string>> {
    if (input.stringKeys.length === 0) {
      return new Map();
    }

    const log = this.log.child({
      organizationId: input.organizationId,
      projectId: input.projectId,
      requestedKeyCount: input.stringKeys.length,
    });
    log.debug("listing cached project file string contexts");

    const sourceTextHashByKey = new Map<string, string>();
    for (const [stringKey, sourceText] of input.sourceTextByKey) {
      sourceTextHashByKey.set(stringKey, this.hashSourceText(sourceText));
    }

    const rows = await this.database
      .select({
        stringKey: schema.projectFileStringRepositoryContexts.stringKey,
        repositoryFullName: schema.projectFileStringRepositoryContexts.repositoryFullName,
        sourceTextHash: schema.projectFileStringRepositoryContexts.sourceTextHash,
        summary: schema.projectFileStringRepositoryContexts.summary,
        updatedAt: schema.projectFileStringRepositoryContexts.updatedAt,
      })
      .from(schema.projectFileStringRepositoryContexts)
      .where(
        and(
          eq(schema.projectFileStringRepositoryContexts.organizationId, input.organizationId),
          eq(schema.projectFileStringRepositoryContexts.projectId, input.projectId),
          eq(schema.projectFileStringRepositoryContexts.sourcePath, input.sourcePath),
          inArray(schema.projectFileStringRepositoryContexts.stringKey, input.stringKeys),
        ),
      );

    const matchesByKey = new Map<string, ProjectFileStringRepositoryContextRecord[]>();
    for (const row of rows) {
      const sourceTextHash = sourceTextHashByKey.get(row.stringKey);
      if (!sourceTextHash) {
        continue;
      }

      if (row.sourceTextHash !== sourceTextHash) {
        continue;
      }

      const existing = matchesByKey.get(row.stringKey) ?? [];
      existing.push(row);
      matchesByKey.set(row.stringKey, existing);
    }

    const summaries = new Map<string, string>();
    for (const [stringKey, matches] of matchesByKey) {
      const preferred = input.preferredRepositoryFullName
        ? matches.find((match) => match.repositoryFullName === input.preferredRepositoryFullName)
        : undefined;
      const selected =
        preferred ??
        [...matches].sort((left, right) => right.updatedAt.getTime() - left.updatedAt.getTime())[0];
      if (selected) {
        summaries.set(stringKey, selected.summary);
      }
    }

    log.debug(
      {
        rowCount: rows.length,
        matchedKeyCount: summaries.size,
      },
      "listed cached project file string contexts",
    );

    return summaries;
  }

  async save(input: {
    organizationId: string;
    projectId: string;
    sourcePath: string;
    stringKey: string;
    repositoryFullName: string;
    sourceText: string;
    summary: string;
    createdByUserId: string;
  }): Promise<void> {
    const sourceTextHash = this.hashSourceText(input.sourceText);
    const now = new Date();

    await this.database
      .insert(schema.projectFileStringRepositoryContexts)
      .values({
        organizationId: input.organizationId,
        projectId: input.projectId,
        sourcePath: input.sourcePath,
        stringKey: input.stringKey,
        repositoryFullName: input.repositoryFullName,
        sourceTextHash,
        summary: input.summary,
        createdByUserId: input.createdByUserId,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: [
          schema.projectFileStringRepositoryContexts.organizationId,
          schema.projectFileStringRepositoryContexts.projectId,
          schema.projectFileStringRepositoryContexts.sourcePath,
          schema.projectFileStringRepositoryContexts.stringKey,
          schema.projectFileStringRepositoryContexts.repositoryFullName,
        ],
        set: {
          sourceTextHash,
          summary: input.summary,
          createdByUserId: input.createdByUserId,
          updatedAt: now,
        },
      });

    this.log.debug(
      {
        organizationId: input.organizationId,
        projectId: input.projectId,
        stringKey: input.stringKey,
        summaryLength: input.summary.length,
      },
      "saved project file string context cache entry",
    );
  }

  async resolveRepositoryFullName(input: {
    organizationId: string;
    repositoryFullName: string | null;
  }): Promise<Result<string, ProjectFileStringContextError>> {
    if (input.repositoryFullName) {
      return ok(input.repositoryFullName);
    }

    const repositories = await this.database
      .select({ fullName: schema.githubInstallationRepositories.fullName })
      .from(schema.githubInstallationRepositories)
      .where(
        and(
          eq(schema.githubInstallationRepositories.organizationId, input.organizationId),
          eq(schema.githubInstallationRepositories.enabled, true),
          eq(schema.githubInstallationRepositories.archived, false),
        ),
      )
      .limit(2);

    if (repositories.length === 0) {
      return err({
        code: "repository_not_enabled",
        message: "Enable one GitHub repository in Agent → GitHub before looking up string context.",
      });
    }

    if (repositories.length > 1) {
      return err({
        code: "repository_context_ambiguous",
        message:
          "More than one GitHub repository is enabled. Disable the extra repositories or specify the repository before looking up string context.",
      });
    }

    return ok(repositories[0].fullName);
  }

  async lookup(input: {
    organizationId: string;
    projectId: string;
    repositoryFullName: string | null;
    sourcePath: string;
    key: string;
    text: string;
    context: string | null;
    localUserId: string;
    membershipRole: OrganizationMembershipRole;
    displayName: string | null;
    email: string | null;
    forceRefresh?: boolean;
  }): Promise<Result<{ summary: string; cached: boolean }, ProjectFileStringContextError>> {
    const log = this.log.child({
      organizationId: input.organizationId,
      projectId: input.projectId,
      stringKey: input.key,
      forceRefresh: input.forceRefresh ?? false,
    });
    log.debug("project file string context lookup started");

    const repositoryResult = await this.resolveRepositoryFullName({
      organizationId: input.organizationId,
      repositoryFullName: input.repositoryFullName,
    });
    if (isErr(repositoryResult)) {
      log.warn(
        { code: repositoryResult.error.code },
        "project file string context repository resolution failed",
      );
      return repositoryResult;
    }

    const repositoryFullName = repositoryResult.value;

    if (!input.forceRefresh) {
      const cachedSummary = await this.getCached({
        organizationId: input.organizationId,
        projectId: input.projectId,
        sourcePath: input.sourcePath,
        stringKey: input.key,
        repositoryFullName,
        sourceText: input.text,
      });

      if (cachedSummary) {
        log.info({ cached: true }, "project file string context lookup completed");
        return ok({ summary: cachedSummary, cached: true });
      }
    } else {
      log.debug({ forceRefresh: true }, "project file string context cache bypassed");
    }

    log.info({ cached: false }, "project file string context cache miss; running repository agent");

    const resolution = await resolveWebProjectRepositoryGitHubContext({
      organizationId: input.organizationId,
      repositoryFullName,
    });

    if (resolution.status === "unresolved") {
      log.warn(
        { code: "repository_not_enabled" },
        "project file string context github context unresolved",
      );
      return err({
        code: "repository_not_enabled",
        message: resolution.followUp,
      });
    }

    if (resolution.status !== "resolved" || !resolution.context.resolved) {
      log.warn(
        { code: "repository_not_enabled" },
        "project file string context github context not resolved",
      );
      return err({
        code: "repository_not_enabled",
        message:
          "Connect and enable a GitHub repository in Agent → GitHub before looking up string context.",
      });
    }

    const githubContext = resolution.context;
    let sandboxId: string | null = null;

    try {
      sandboxId = await createRepositorySandbox(githubContext);
    } catch (error) {
      log.warn(
        { code: "repository_access_failed", err: serializeErrorForLog(error) },
        "project file string context sandbox creation failed",
      );
      return err({
        code: "repository_access_failed",
        message:
          "The GitHub App could not access this repository. Check that it is installed and enabled for this workspace.",
      });
    }

    const conversationId = `project-file-context:${randomUUID()}`;
    const toolContext: ToolContext = {
      conversationId,
      agentSession: { todos: [] },
      organizationId: input.organizationId,
      localUserId: input.localUserId,
      membershipRole: input.membershipRole,
      projectId: input.projectId,
      db: this.database,
      workMode: "read_only",
      repositorySource: "chat_ui",
      actor: {
        sourceUserId: input.localUserId,
        userId: input.localUserId,
        email: input.email ?? undefined,
        displayName: input.displayName ?? undefined,
        role: input.membershipRole,
      },
      sandboxId,
      githubContext,
    };

    ensureAgentSession(toolContext);
    log.debug(
      { conversationId, sandboxId },
      "project file string context repository agent starting",
    );

    const instructions = [
      buildRepositoryGitHubContextInstructions(githubContext),
      `Source file path in the TMS project: ${input.sourcePath}`,
      `String key: ${input.key}`,
      `Source text: ${input.text}`,
      input.context ? `Crowdin/context note: ${input.context}` : null,
      "Find where this string appears in the connected repository and explain localization-relevant context for translators.",
    ]
      .filter((line): line is string => line !== null)
      .join("\n\n");

    try {
      const result = await runSubagent("repository", {
        toolContext,
        task: `Find repository context for localization key "${input.key}".`,
        instructions,
      });

      const summary = result.text.trim();
      if (!summary) {
        log.warn(
          { code: "agent_failed" },
          "project file string context agent returned empty summary",
        );
        return err({
          code: "agent_failed",
          message: "The repository agent did not return any context for this string.",
        });
      }

      await this.save({
        organizationId: input.organizationId,
        projectId: input.projectId,
        sourcePath: input.sourcePath,
        stringKey: input.key,
        repositoryFullName,
        sourceText: input.text,
        summary,
        createdByUserId: input.localUserId,
      });

      log.info(
        { cached: false, summaryLength: summary.length },
        "project file string context lookup completed",
      );
      return ok({ summary, cached: false });
    } catch (error) {
      log.error(
        { code: "agent_failed", err: serializeErrorForLog(error) },
        "project file string context agent lookup failed",
      );
      return err({
        code: "agent_failed",
        message: "Failed to look up repository context. Try again in a moment.",
      });
    } finally {
      if (sandboxId) {
        await stopRepositorySandbox(sandboxId).catch(() => undefined);
      }
    }
  }

  async lookupCached(input: {
    organizationId: string;
    projectId: string;
    repositoryFullName: string | null;
    sourcePath: string;
    key: string;
    text: string;
  }): Promise<Result<{ summary: string | null; cached: true }, ProjectFileStringContextError>> {
    const log = this.log.child({
      organizationId: input.organizationId,
      projectId: input.projectId,
      stringKey: input.key,
    });
    log.debug("project file string cached context lookup started");

    const repositoryResult = await this.resolveRepositoryFullName({
      organizationId: input.organizationId,
      repositoryFullName: input.repositoryFullName,
    });
    if (isErr(repositoryResult)) {
      log.warn(
        { code: repositoryResult.error.code },
        "project file string cached context repository resolution failed",
      );
      return repositoryResult;
    }

    const summary = await this.getCached({
      organizationId: input.organizationId,
      projectId: input.projectId,
      sourcePath: input.sourcePath,
      stringKey: input.key,
      repositoryFullName: repositoryResult.value,
      sourceText: input.text,
    });

    log.debug(
      {
        cached: summary !== null,
        summaryLength: summary?.length ?? 0,
      },
      "project file string cached context lookup completed",
    );

    return ok({ summary, cached: true });
  }
}

export const projectStringContextService = new ProjectStringContextService();

export const hashProjectFileStringSourceText = (text: string) =>
  projectStringContextService.hashSourceText(text);

export const getCachedProjectFileStringRepositoryContext = (
  input: Parameters<ProjectStringContextService["getCached"]>[0],
) => projectStringContextService.getCached(input);

export const listCachedProjectFileStringRepositoryContexts = (
  input: Parameters<ProjectStringContextService["listCached"]>[0],
) => projectStringContextService.listCached(input);

export const saveProjectFileStringRepositoryContext = (
  input: Parameters<ProjectStringContextService["save"]>[0],
) => projectStringContextService.save(input);

export const resolveProjectFileStringRepositoryFullName = (
  input: Parameters<ProjectStringContextService["resolveRepositoryFullName"]>[0],
) => projectStringContextService.resolveRepositoryFullName(input);

export const lookupProjectFileStringRepositoryContext = (
  input: Parameters<ProjectStringContextService["lookup"]>[0],
) => projectStringContextService.lookup(input);

export const lookupCachedProjectFileStringRepositoryContext = (
  input: Parameters<ProjectStringContextService["lookupCached"]>[0],
) => projectStringContextService.lookupCached(input);
