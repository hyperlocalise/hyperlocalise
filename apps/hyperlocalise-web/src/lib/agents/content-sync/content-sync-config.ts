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
import { buildContentSyncFingerprint } from "./content-sync-paths";
import {
  buildDefaultContentSyncTriggerMode,
  contentSyncNeedsProviderFolder,
  type ContentSyncConfig,
} from "./content-sync-types";
import { isSafeContentSyncFolder, normalizeContentSyncFolder } from "./content-sync-paths";
import type {
  WorkspaceAutomationConfigValidationError,
  WorkspaceAutomationRepositoryTarget,
  WorkspaceAutomationTriggerConfig,
} from "@/lib/agents/workspace-automation-types";
import { err, ok, type Result } from "@/lib/primitives/result/results";

export function normalizeStoredContentSyncConfig(config: ContentSyncConfig): ContentSyncConfig {
  return {
    ...config,
    providerFolder: normalizeContentSyncFolder(config.providerFolder),
    projectFolder: normalizeContentSyncFolder(config.projectFolder),
    resourceKey: config.resourceKey.trim(),
    connectionId: config.connectionId.trim(),
  };
}

export function contentSyncFingerprintFromConfig(config: ContentSyncConfig): string {
  const normalized = normalizeStoredContentSyncConfig(config);
  return buildContentSyncFingerprint({
    provider: normalized.provider,
    resourceKey: normalized.resourceKey,
    providerFolder: normalized.providerFolder,
  });
}

export function resolveContentSyncTriggerConfig(
  config: ContentSyncConfig,
): WorkspaceAutomationTriggerConfig {
  const mode = buildDefaultContentSyncTriggerMode(config.provider);
  if (mode === "github") {
    return {
      mode: "github",
      branches: ["**"],
      events: ["push"],
    };
  }
  if (mode === "contentful") {
    return { mode: "contentful" };
  }
  return { mode: "manual" };
}

export function resolveContentSyncRepositoryTarget(
  config: ContentSyncConfig,
): WorkspaceAutomationRepositoryTarget {
  if (config.provider === "github") {
    return {
      kind: "github",
      githubInstallationRepositoryId: config.connectionId,
    };
  }
  if (config.provider === "gitlab") {
    return {
      kind: "gitlab",
      gitlabPathWithNamespace: config.resourceKey,
    };
  }
  return { kind: "none" };
}

export function validateContentSyncConfig(
  config: ContentSyncConfig | null,
): Result<ContentSyncConfig, WorkspaceAutomationConfigValidationError> {
  if (!config) {
    return err({
      code: "content_sync_config_required",
      message: "Content sync requires a provider, resource, and project folder.",
    });
  }

  const normalized = normalizeStoredContentSyncConfig(config);
  if (!normalized.projectFolder) {
    return err({
      code: "content_sync_config_required",
      message: "Content sync requires a provider, resource, and project folder.",
    });
  }
  if (!isSafeContentSyncFolder(normalized.projectFolder)) {
    return err({
      code: "content_sync_folder_invalid",
      message: "Choose a safe relative folder path.",
    });
  }
  if (contentSyncNeedsProviderFolder(normalized.provider) && !normalized.providerFolder) {
    return err({
      code: "content_sync_provider_folder_required",
      message: "Git content sync requires a provider folder.",
    });
  }
  if (normalized.providerFolder.length > 0 && !isSafeContentSyncFolder(normalized.providerFolder)) {
    return err({
      code: "content_sync_folder_invalid",
      message: "Choose a safe relative folder path.",
    });
  }

  return ok(normalized);
}
