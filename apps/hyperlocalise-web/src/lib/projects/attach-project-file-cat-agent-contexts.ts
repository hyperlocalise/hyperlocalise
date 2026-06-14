import type { ProjectFileCatResponse } from "@/api/routes/project/project.schema";

import { listCachedProjectFileStringRepositoryContexts } from "./project-file-string-context-store";

export async function attachProjectFileCatAgentContexts(input: {
  organizationId: string;
  projectId: string;
  catFile: ProjectFileCatResponse["catFile"];
  preferredRepositoryFullName?: string | null;
}): Promise<ProjectFileCatResponse["catFile"]> {
  if (input.catFile.segments.length === 0) {
    return input.catFile;
  }

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
    return input.catFile;
  }

  return {
    ...input.catFile,
    segments: input.catFile.segments.map((segment) => {
      const repositoryContext = cachedSummaries.get(segment.key);
      if (!repositoryContext) {
        return segment;
      }

      return {
        ...segment,
        repositoryContext,
      };
    }),
  };
}
