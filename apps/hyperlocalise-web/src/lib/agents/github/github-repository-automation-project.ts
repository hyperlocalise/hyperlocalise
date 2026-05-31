import { and, eq } from "drizzle-orm";

import { db, schema } from "@/lib/database";

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

async function findProjectIdFromConnectorConfigs(input: {
  organizationId: string;
  repositoryFullName: string;
}): Promise<string | null> {
  const connectors = await db
    .select({ config: schema.connectors.config })
    .from(schema.connectors)
    .where(eq(schema.connectors.organizationId, input.organizationId));

  const matches = new Set<string>();

  for (const connector of connectors) {
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
      continue;
    }

    for (const projectId of findProjectIdsForRepository(
      github.projectRepositories,
      input.repositoryFullName,
    )) {
      matches.add(projectId);
    }
  }

  if (matches.size === 1) {
    return [...matches][0] ?? null;
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

  return findProjectIdFromConnectorConfigs({
    organizationId: input.organizationId,
    repositoryFullName: input.repositoryFullName,
  });
}
