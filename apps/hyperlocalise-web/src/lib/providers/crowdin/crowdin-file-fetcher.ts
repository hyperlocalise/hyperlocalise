import type { ExternalTmsFileKeyFetcher } from "@/lib/providers/external-tms-file-sync";

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

  const allFiles: Awaited<ReturnType<typeof client.listFiles>> = [];

  for (const branch of branches) {
    try {
      const directories = await client.listDirectories(projectId, branch.id);
      for (const directory of directories) {
        const parentPath = directory.directoryId
          ? (directoryPathById.get(directory.directoryId) ?? "")
          : "";
        directoryPathById.set(directory.id, `${parentPath}${directory.name}/`);
      }

      const files = await client.listFiles(projectId, branch.id);
      allFiles.push(...files);
    } catch (error) {
      if (error instanceof CrowdinApiError && error.status === 401) {
        throw new Error("crowdin_auth_invalid");
      }
      // Continue with other branches if one fails
    }
  }

  // Also fetch files not associated with any branch (default/root)
  try {
    const rootFiles = await client.listFiles(projectId);
    allFiles.push(...rootFiles);
  } catch (error) {
    if (error instanceof CrowdinApiError && error.status === 401) {
      throw new Error("crowdin_auth_invalid");
    }
  }

  const results: Awaited<ReturnType<ExternalTmsFileKeyFetcher>> = [];

  for (const file of allFiles) {
    const branchName = file.branchId ? (branchMap.get(file.branchId) ?? "") : "";
    const directoryPath = file.directoryId ? (directoryPathById.get(file.directoryId) ?? "") : "";
    const sourcePath = branchName
      ? `${branchName}/${directoryPath}${file.name}`
      : `${directoryPath}${file.name}`;

    let revision: string | undefined;
    try {
      const revisions = await client.listFileRevisions(projectId, file.id);
      if (revisions.length > 0) {
        revision = String(revisions[0]?.id ?? file.revisionId);
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
      externalUrl: `https://crowdin.com/project/${projectId}/files/${file.id}`,
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

  // Fetch source strings as "key" resources per file
  for (const file of allFiles) {
    try {
      const strings = await client.listSourceStrings(projectId, file.id);
      for (const str of strings) {
        const keyPath = `${sourcePathOf(file, branchMap, directoryPathById)}/keys/${str.identifier}`;
        results.push({
          externalResourceId: String(str.id),
          resourceType: "key",
          sourcePath: keyPath,
          displayName: str.identifier,
          providerPayload: {
            fileId: str.fileId,
            branchId: str.branchId,
            directoryId: str.directoryId,
            identifier: str.identifier,
            type: str.type,
            context: str.context,
            labelIds: str.labelIds,
          },
        });
      }
    } catch {
      // Skip strings for files that fail; do not abort entire scan
    }
  }

  return results;
};

function sourcePathOf(
  file: { branchId: number | null; directoryId: number | null; name: string },
  branchMap: Map<number, string>,
  directoryPathById: Map<number, string>,
): string {
  const branchName = file.branchId ? (branchMap.get(file.branchId) ?? "") : "";
  const directoryPath = file.directoryId ? (directoryPathById.get(file.directoryId) ?? "") : "";
  return branchName ? `${branchName}/${directoryPath}${file.name}` : `${directoryPath}${file.name}`;
}
