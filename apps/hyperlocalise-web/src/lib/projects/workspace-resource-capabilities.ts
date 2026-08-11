/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in this application's LICENSE file.
 *
 * Change Date: Four years after publication of the applicable version.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
import {
  parseProviderJobId,
  parseProviderProjectId,
} from "@/lib/providers/jobs/tms-provider-resource-id";

export type WorkspaceProjectSource = "native" | "external_tms";

export type ProjectWorkspaceCapabilities = {
  source: WorkspaceProjectSource;
  isProviderProject: boolean;
  canUploadFiles: boolean;
  canEditProjectSettings: boolean;
  canDeleteProject: boolean;
  canSyncProviderJobs: boolean;
};

export function getProjectWorkspaceCapabilities(input: {
  projectId: string;
  source?: WorkspaceProjectSource;
}): ProjectWorkspaceCapabilities {
  const isProviderProject = Boolean(parseProviderProjectId(input.projectId));
  const source = input.source ?? (isProviderProject ? "external_tms" : "native");

  return {
    source,
    isProviderProject,
    canUploadFiles: !isProviderProject && source === "native",
    canEditProjectSettings: source === "native",
    canDeleteProject: source === "native",
    canSyncProviderJobs: false,
  };
}

export function isProviderBackedWorkspaceJob(job: {
  id: string;
  externalProviderKind: string | null;
}) {
  return Boolean(job.externalProviderKind || parseProviderJobId(job.id));
}

export function isNativeWorkspaceJob(job: { id: string; externalProviderKind: string | null }) {
  return !isProviderBackedWorkspaceJob(job);
}

export function canOpenProviderJobCat(job: {
  id: string;
  kind: "translation" | "research" | "review" | "proofread" | "sync" | "asset_management";
  externalProviderKind: string | null;
}) {
  if (job.kind !== "translation" && job.kind !== "review" && job.kind !== "proofread") {
    return false;
  }

  return isProviderBackedWorkspaceJob(job);
}

export function canOpenNativeJobCat(job: {
  id: string;
  kind: "translation" | "research" | "review" | "proofread" | "sync" | "asset_management";
  type: "string" | "file" | null;
  externalProviderKind: string | null;
  inputPayload: unknown;
}) {
  if (isProviderBackedWorkspaceJob(job)) {
    return false;
  }

  if (job.kind !== "translation" || job.type !== "file") {
    return false;
  }

  if (
    typeof job.inputPayload !== "object" ||
    !job.inputPayload ||
    !("sourceFileId" in job.inputPayload)
  ) {
    return false;
  }

  const sourceFileId = (job.inputPayload as Record<string, unknown>).sourceFileId;
  return typeof sourceFileId === "string" && sourceFileId.length > 0;
}
