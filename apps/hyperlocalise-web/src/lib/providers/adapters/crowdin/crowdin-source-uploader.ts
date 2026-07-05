import type { ExternalTmsSourceFileUploader } from "@/lib/providers/tms-provider-types";

import {
  providerFilename,
  providerSourcePath,
} from "@/lib/providers/adapters/source-file-upload-shared";
import { CrowdinApiClient, CrowdinApiError, type CrowdinDirectory } from "./crowdin-api";

export const uploadCrowdinSourceFile: ExternalTmsSourceFileUploader = async ({
  credential,
  externalProjectId,
  secretMaterial,
  file,
}) => {
  const client = new CrowdinApiClient({
    token: secretMaterial,
    baseUrl: credential.baseUrl ?? undefined,
  });
  const projectId = Number(externalProjectId);
  if (!Number.isInteger(projectId) || projectId <= 0) {
    throw new Error("invalid_crowdin_project_id");
  }

  const branchId = await resolveCrowdinBranchId(client, projectId, file.branch);
  const sourcePath = providerSourcePath(file);
  const pathSegments = sourcePath.split("/").filter(Boolean);
  const name = providerFilename(file);
  const directorySegments = pathSegments.length > 1 ? pathSegments.slice(0, -1) : [];
  const directoryId = await ensureCrowdinDirectory(client, projectId, branchId, directorySegments);
  const storage = await client.addStorage({
    fileName: name,
    content: file.content,
    contentType: file.contentType,
  });

  const files = await client.listFiles(
    projectId,
    branchId ?? undefined,
    directoryId ?? undefined,
  );
  const existing = files.find((item) => item.name === name);
  const uploaded = existing
    ? await client.updateSourceFile(projectId, existing.id, { storageId: storage.id, name })
    : await client.addSourceFile(projectId, {
        storageId: storage.id,
        name,
        branchId,
        directoryId,
      });

  return {
    sourcePath,
    externalResourceId: String(uploaded.id),
    revision: String(uploaded.revisionId),
    providerPayload: {
      storageId: storage.id,
      branchId: uploaded.branchId,
      directoryId: uploaded.directoryId,
      name: uploaded.name,
      path: uploaded.path,
      status: uploaded.status,
    },
  };
};

async function resolveCrowdinBranchId(
  client: CrowdinApiClient,
  projectId: number,
  branch?: string | null,
) {
  const normalizedBranch = branch?.trim();
  if (!normalizedBranch) {
    return null;
  }

  const branches = await client.listBranches(projectId);
  const match = branches.find((item) => item.name === normalizedBranch);
  if (!match) {
    throw new Error("crowdin_branch_not_found");
  }
  return match.id;
}

async function ensureCrowdinDirectory(
  client: CrowdinApiClient,
  projectId: number,
  branchId: number | null,
  segments: string[],
) {
  let parentId: number | null = null;
  for (const segment of segments) {
    const directories = await client.listDirectories(projectId, branchId ?? undefined);
    const existing = findCrowdinDirectory(directories, parentId, segment);
    if (existing) {
      parentId = existing.id;
      continue;
    }

    try {
      const created = await client.addDirectory(projectId, {
        name: segment,
        branchId: parentId ? null : branchId,
        directoryId: parentId,
      });
      parentId = created.id;
    } catch (error) {
      if (!(error instanceof CrowdinApiError) || error.status !== 409) {
        throw error;
      }
      const refreshed = await client.listDirectories(projectId, branchId ?? undefined);
      const existingAfterConflict = findCrowdinDirectory(refreshed, parentId, segment);
      if (!existingAfterConflict) {
        throw error;
      }
      parentId = existingAfterConflict.id;
    }
  }

  return parentId;
}

function findCrowdinDirectory(
  directories: CrowdinDirectory[],
  parentId: number | null,
  name: string,
) {
  return directories.find((directory) => {
    const candidateParent = directory.directoryId ?? null;
    return candidateParent === parentId && directory.name === name;
  });
}
