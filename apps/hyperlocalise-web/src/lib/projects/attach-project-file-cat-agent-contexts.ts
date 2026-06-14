import type { ProjectFileCatResponse } from "@/api/routes/project/project.schema";
import { createLogger } from "@/lib/log";

import { listCachedProjectFileStringRepositoryContexts } from "./project-file-string-context-store";

const logger = createLogger("project-file-cat-context");

export async function attachProjectFileCatAgentContexts(input: {
  organizationId: string;
  projectId: string;
  catFile: ProjectFileCatResponse["catFile"];
  preferredRepositoryFullName?: string | null;
}): Promise<ProjectFileCatResponse["catFile"]> {
  const log = logger.child({
    organizationId: input.organizationId,
    projectId: input.projectId,
    segmentCount: input.catFile.segments.length,
  });

  if (input.catFile.segments.length === 0) {
    log.debug("skipping CAT context hydration for empty segment list");
    return input.catFile;
  }

  log.debug("hydrating CAT file with cached repository context");

  const sourceTextByKey = new Map(
    input.catFile.segments.map((segment) => [segment.key, segment.sourceText] as const),
  );
  const cachedSummaries = await listCachedProjectFileStringRepositoryContexts({
    organizationId: input.organizationId,
    projectId: input.projectId,
    sourcePath: input.catFile.sourcePath,
    stringKeys: input.catFile.segments.map((segment) => segment.key),
    preferredRepositoryFullName: input.preferredRepositoryFullName,
    sourceTextByKey,
  });

  if (cachedSummaries.size === 0) {
    log.debug("no cached repository context matched CAT segments");
    return input.catFile;
  }

  const hydratedSegments = input.catFile.segments.map((segment) => {
    const repositoryContext = cachedSummaries.get(segment.key);
    if (!repositoryContext) {
      return segment;
    }

    return {
      ...segment,
      repositoryContext,
    };
  });
  const hydratedSegmentCount = hydratedSegments.filter((segment) =>
    Boolean(segment.repositoryContext?.trim()),
  ).length;

  log.debug(
    {
      cachedKeyCount: cachedSummaries.size,
      hydratedSegmentCount,
    },
    "hydrated CAT file with cached repository context",
  );

  return {
    ...input.catFile,
    segments: hydratedSegments,
  };
}
