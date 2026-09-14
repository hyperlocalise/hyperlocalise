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

import type { RepositorySourceFileSegmentationSettings } from "@/lib/database/schema/files";
import { defaultRepositorySourceFileSegmentationSettings } from "@/lib/database/schema/files";
import {
  SRX_BUILTIN_TEMPLATES,
  SRX_CUSTOM_SANDBOX_FILENAME,
  type SrxBuiltinTemplate,
} from "@/lib/i18n/srx/srx-template-samples";

export const repositorySourceFileSegmentationSettingsSchema = z
  .object({
    enabled: z.boolean(),
    template: z.enum(["default", "html", "markdown", "custom"]),
    customSrxXml: z.string().max(500_000).nullable().optional(),
  })
  .superRefine((value, ctx) => {
    if (!value.enabled) {
      return;
    }
    if (value.template === "custom") {
      const xml = value.customSrxXml?.trim() ?? "";
      if (!xml.startsWith("<")) {
        ctx.addIssue({
          code: "custom",
          message: "Custom SRX rules must be XML",
          path: ["customSrxXml"],
        });
      }
    }
  });

export type RepositorySourceFileSegmentationSettingsInput = z.infer<
  typeof repositorySourceFileSegmentationSettingsSchema
>;

export function normalizeSegmentationSettings(
  raw: RepositorySourceFileSegmentationSettings | null | undefined,
): RepositorySourceFileSegmentationSettings {
  if (!raw) {
    return defaultRepositorySourceFileSegmentationSettings();
  }
  const template = SRX_BUILTIN_TEMPLATES.includes(raw.template as SrxBuiltinTemplate)
    ? raw.template
    : raw.template === "custom"
      ? "custom"
      : "default";
  return {
    enabled: Boolean(raw.enabled),
    template,
    customSrxXml: raw.customSrxXml ?? null,
  };
}

export function resolveSandboxSrxCliSpec(settings: RepositorySourceFileSegmentationSettings): {
  srxFlag?: string;
  customSandboxPath?: string;
  customSandboxContent?: string;
} {
  if (!settings.enabled) {
    return {};
  }
  if (settings.template === "custom") {
    const xml = settings.customSrxXml?.trim() ?? "";
    if (!xml) {
      return {};
    }
    return {
      srxFlag: SRX_CUSTOM_SANDBOX_FILENAME,
      customSandboxPath: SRX_CUSTOM_SANDBOX_FILENAME,
      customSandboxContent: xml,
    };
  }
  return { srxFlag: settings.template };
}
