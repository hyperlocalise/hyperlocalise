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
import { hasSafeContentSyncTemplateWildcards } from "./content-sync-locale-paths";
import { buildContentSyncFingerprint } from "./content-sync-paths";
import {
  buildDefaultContentSyncTriggerMode,
  CONTENT_SYNC_LOCALE_PLACEHOLDER,
  contentSyncNeedsPathTemplate,
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
  const {
    branch: rawBranch,
    pathTemplate: rawPathTemplate,
    localeCodes: rawLocaleCodes,
    ...rest
  } = config;
  const branch = rawBranch?.trim();
  const pathTemplate = rawPathTemplate ? normalizeContentSyncFolder(rawPathTemplate) : "";
  const localeCodes = Object.fromEntries(
    Object.entries(rawLocaleCodes ?? {})
      .map(([locale, code]) => [locale.trim(), code.trim()])
      .filter(([locale, code]) => locale && code),
  );
  return {
    ...rest,
    providerFolder: normalizeContentSyncFolder(config.providerFolder),
    projectFolder: normalizeContentSyncFolder(config.projectFolder),
    resourceKey: config.resourceKey.trim(),
    connectionId: config.connectionId.trim(),
    ...(branch ? { branch } : {}),
    ...(pathTemplate ? { pathTemplate } : {}),
    ...(Object.keys(localeCodes).length > 0 ? { localeCodes } : {}),
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
  if (contentSyncNeedsPathTemplate(normalized.provider)) {
    if (!normalized.pathTemplate) {
      return err({
        code: "content_sync_path_template_required",
        message: "Say where each language's files are, for example {{locale}}.json.",
      });
    }
    if (!isSafeContentSyncFolder(normalized.pathTemplate.replace(/[*{}]/g, "x"))) {
      return err({
        code: "content_sync_folder_invalid",
        message: "Choose a safe relative folder path.",
      });
    }
    if (
      !normalized.pathTemplate.includes(CONTENT_SYNC_LOCALE_PLACEHOLDER) ||
      !hasSafeContentSyncTemplateWildcards(normalized.pathTemplate)
    ) {
      return err({
        code: "content_sync_path_template_invalid",
        message:
          "The language file paths need {{locale}}, with ** only as a whole folder (twice at most) and at most two * or {{locale}} in a name.",
      });
    }
  }

  return ok(normalized);
}
