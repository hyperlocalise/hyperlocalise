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
import { z } from "zod";

export const workspaceAutomationKindSchema = z.enum(["agent", "content_sync"]);
export type WorkspaceAutomationKind = z.infer<typeof workspaceAutomationKindSchema>;

export const DEFAULT_WORKSPACE_AUTOMATION_KIND: WorkspaceAutomationKind = "agent";

export const contentSyncProviderSchema = z.enum(["github", "gitlab", "contentful", "intercom"]);
export type ContentSyncProvider = z.infer<typeof contentSyncProviderSchema>;

const folderPathSchema = z
  .string()
  .trim()
  .max(512)
  .regex(/^[^\\:*?"<>|]*$/, "invalid_folder_path");

export const contentSyncConfigSchema = z.object({
  provider: contentSyncProviderSchema,
  connectionId: z.string().trim().min(1).max(256),
  resourceKey: z.string().trim().min(1).max(512),
  providerFolder: folderPathSchema.default(""),
  projectFolder: folderPathSchema.min(1),
  contentTypeIds: z.array(z.string().trim().min(1).max(128)).max(50).optional(),
});
export type ContentSyncConfig = z.infer<typeof contentSyncConfigSchema>;

export function resolveWorkspaceAutomationKind(value: unknown): WorkspaceAutomationKind {
  const parsed = workspaceAutomationKindSchema.safeParse(value);
  return parsed.success ? parsed.data : DEFAULT_WORKSPACE_AUTOMATION_KIND;
}

export function normalizeContentSyncConfig(
  value: Record<string, unknown> | null | undefined,
): ContentSyncConfig | null {
  if (!value || Object.keys(value).length === 0) {
    return null;
  }
  const parsed = contentSyncConfigSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export function contentSyncNeedsProviderFolder(provider: ContentSyncProvider): boolean {
  return provider === "github" || provider === "gitlab";
}

export function defaultContentSyncProjectFolder(input: {
  provider: ContentSyncProvider;
  resourceKey: string;
}): string {
  const resource = input.resourceKey
    .trim()
    .replace(/\\/g, "/")
    .replace(/^\/+|\/+$/g, "")
    .replace(/[^A-Za-z0-9._\-/]+/g, "-")
    .replace(/\/+/g, "/")
    .slice(0, 180);
  return resource.length > 0 ? `${input.provider}/${resource}` : input.provider;
}

export function defaultContentSyncName(input: {
  provider: ContentSyncProvider;
  resourceKey: string;
}): string {
  return `Sync ${input.resourceKey}`;
}

export function buildDefaultContentSyncTriggerMode(
  provider: ContentSyncProvider,
): "github" | "contentful" | "manual" {
  if (provider === "github") {
    return "github";
  }
  if (provider === "contentful") {
    return "contentful";
  }
  return "manual";
}
