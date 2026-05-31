import { and, eq } from "drizzle-orm";

import { db, schema } from "@/lib/database";

/** Slack connector stores project→repository mappings under `repository.github`. */
const GITHUB_REPOSITORY_PROJECT_CONNECTOR_KIND = "slack" as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function repositoryFullNameFromConfigValue(value: unknown): string | null {
  if (typeof value === "string" && value.trim().length > 0) {
    return value.trim();
  }

  if (!isRecord(value)) {
    return null;
  }

  const fullName = value.repositoryFullName ?? value.fullName;
  return typeof fullName === "string" && fullName.trim().length > 0 ? fullName.trim() : null;
}

function findProjectIdsForRepository(
  projectRepositories: unknown,
  repositoryFullName: string,
): string[] {
  if (!isRecord(projectRepositories)) {
    return [];
  }

  const normalizedRepository = repositoryFullName.toLowerCase();
  const matches: string[] = [];

  for (const [projectId, configuredRepository] of Object.entries(projectRepositories)) {
    const configuredFullName = repositoryFullNameFromConfigValue(configuredRepository);
    if (configuredFullName?.toLowerCase() === normalizedRepository) {
      matches.push(projectId);
    }
  }

  return matches;
}

async function findProjectIdFromConnectorConfig(input: {
  organizationId: string;
  repositoryFullName: string;
}): Promise<string | null> {
  const [connector] = await db
    .select({ config: schema.connectors.config })
    .from(schema.connectors)
    .where(
      and(
        eq(schema.connectors.organizationId, input.organizationId),
        eq(schema.connectors.kind, GITHUB_REPOSITORY_PROJECT_CONNECTOR_KIND),
      ),
    )
    .limit(1);

  if (!connector) {
    return null;
  }

  const root = isRecord(connector.config) ? connector.config : null;
  const repository = root ? (isRecord(root.repository) ? root.repository : null) : null;
  const github = repository
    ? isRecord(repository.github)
      ? repository.github
      : null
    : isRecord(root?.github)
      ? root.github
      : null;

  if (!github) {
    return null;
  }

  const matches = findProjectIdsForRepository(github.projectRepositories, input.repositoryFullName);

  if (matches.length === 1) {
    return matches[0] ?? null;
  }

  return null;
}

export async function resolveGithubRepositoryAutomationProjectId(input: {
  organizationId: string;
  repositoryFullName: string;
  configuredProjectId?: string | null;
}): Promise<string | null> {
  if (input.configuredProjectId) {
    const [project] = await db
      .select({ id: schema.projects.id })
      .from(schema.projects)
      .where(
        and(
          eq(schema.projects.id, input.configuredProjectId),
          eq(schema.projects.organizationId, input.organizationId),
        ),
      )
      .limit(1);

    return project?.id ?? null;
  }

  return findProjectIdFromConnectorConfig({
    organizationId: input.organizationId,
    repositoryFullName: input.repositoryFullName,
  });
}
