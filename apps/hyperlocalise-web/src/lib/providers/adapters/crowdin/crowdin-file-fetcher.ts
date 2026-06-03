import type { ExternalTmsFileKeyFetcher } from "@/lib/providers/sync/external-tms-file-sync";

import { CrowdinApiClient, CrowdinApiError } from "./crowdin-api";

export const fetchCrowdinFileKeys: ExternalTmsFileKeyFetcher = async ({
  credential,
  externalProjectId,
  secretMaterial,
}) => {
  const client = new CrowdinApiClient({
    token: secretMaterial,
    baseUrl: credential.baseUrl ?? undefined,
  });
  const webOrigin = crowdinWebOrigin(credential.baseUrl);

  const projectId = Number(externalProjectId);
  if (Number.isNaN(projectId)) {
    throw new Error("invalid_crowdin_project_id");
  }

  let branches: Awaited<ReturnType<typeof client.listBranches>>;
  try {
    branches = await client.listBranches(projectId);
  } catch (error) {
    if (error instanceof CrowdinApiError && error.status === 401) {
      throw new Error("crowdin_auth_invalid");
    }
    throw error;
  }

  // Include a synthetic "default" branch for files not scoped to any branch
  const branchMap = new Map<number, string>();
  branchMap.set(0, "");
  for (const branch of branches) {
    branchMap.set(branch.id, branch.name);
  }

  // Build directory path lookups per branch
  const directoryPathById = new Map<number, string>();

  // Also fetch directories not associated with any branch (default/root)
  try {
    const rootDirectories = await client.listDirectories(projectId);
    buildDirectoryPaths(rootDirectories, directoryPathById);
  } catch (error) {
    if (error instanceof CrowdinApiError && error.status === 401) {
      throw new Error("crowdin_auth_invalid");
    }
    throw error;
  }

  const allFiles: Awaited<ReturnType<typeof client.listFiles>> = [];

  for (const branch of branches) {
    try {
      const directories = await client.listDirectories(projectId, branch.id);
      buildDirectoryPaths(directories, directoryPathById);

      const files = await client.listFiles(projectId, branch.id);
      allFiles.push(...files);
    } catch (error) {
      if (error instanceof CrowdinApiError && error.status === 401) {
        throw new Error("crowdin_auth_invalid");
      }
      throw error;
    }
  }

  // Also fetch files not associated with any branch (default/root)
  try {
    const rootFiles = await client.listFiles(projectId);
    allFiles.push(...rootFiles.filter((f) => f.branchId === null));
  } catch (error) {
    if (error instanceof CrowdinApiError && error.status === 401) {
      throw new Error("crowdin_auth_invalid");
    }
    throw error;
  }

  const results: Awaited<ReturnType<ExternalTmsFileKeyFetcher>> = [];

  for (const file of allFiles) {
    const sourcePath = sourcePathOf(file, branchMap, directoryPathById);

    let revision: string | undefined;
    try {
      const revisions = await client.listFileRevisions(projectId, file.id);
      if (revisions.length > 0) {
        revision = String(revisions[0]?.id ?? file.revisionId);
      } else {
        // Fall back to file.revisionId when the revisions list is empty
        revision = String(file.revisionId);
      }
    } catch {
      // Fall back to file.revisionId if revision listing fails
      revision = String(file.revisionId);
    }

    results.push({
      externalResourceId: String(file.id),
      resourceType: "file",
      sourcePath,
      displayName: file.title ?? file.name,
      format: file.type,
      revision,
      externalUrl: `${webOrigin}/project/${projectId}/files/${file.id}`,
      syncState: file.status === "active" ? "synced" : "pending",
      providerPayload: {
        branchId: file.branchId,
        directoryId: file.directoryId,
        name: file.name,
        path: file.path,
        status: file.status,
        revisionId: file.revisionId,
      },
    });
  }

  return results;
};

function buildDirectoryPaths(
  directories: Array<{ id: number; directoryId: number | null; name: string }>,
  directoryPathById: Map<number, string>,
): void {
  const infoById = new Map<number, { directoryId: number | null; name: string }>();
  for (const directory of directories) {
    infoById.set(directory.id, { directoryId: directory.directoryId, name: directory.name });
  }

  for (const directory of directories) {
    directoryPathById.set(directory.id, resolveDirectoryPath(directory.id, infoById));
  }
}

function resolveDirectoryPath(
  directoryId: number,
  infoById: Map<number, { directoryId: number | null; name: string }>,
): string {
  const parts: string[] = [];
  let currentId: number | null = directoryId;
  const visited = new Set<number>();

  while (currentId !== null) {
    if (visited.has(currentId)) break;
    visited.add(currentId);

    const info = infoById.get(currentId);
    if (!info) break;
    parts.unshift(info.name);
    currentId = info.directoryId;
  }

  return parts.length > 0 ? `${parts.join("/")}/` : "";
}

function sourcePathOf(
  file: { branchId: number | null; directoryId: number | null; name: string },
  branchMap: Map<number, string>,
  directoryPathById: Map<number, string>,
): string {
  const branchName = file.branchId ? (branchMap.get(file.branchId) ?? "") : "";
  const directoryPath = file.directoryId ? (directoryPathById.get(file.directoryId) ?? "") : "";
  return branchName ? `${branchName}/${directoryPath}${file.name}` : `${directoryPath}${file.name}`;
}

function crowdinWebOrigin(baseUrl: string | null): string {
  const url = new URL(baseUrl ?? "https://api.crowdin.com/api/v2");
  if (url.hostname === "api.crowdin.com") {
    url.hostname = "crowdin.com";
  }
  url.pathname = "";
  url.search = "";
  url.hash = "";
  return url.toString().replace(/\/$/g, "");
}
