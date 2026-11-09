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

const nameListSchema = (maxItems: number, maxLength: number) =>
  z.array(z.string().trim().min(1).max(maxLength)).max(maxItems);

const htmlTagNameSchema = z
  .string()
  .trim()
  .min(1)
  .max(40)
  .regex(/^[A-Za-z][\w-]*$/, "Use an HTML tag name");

const excelColumnIndexSchema = z.number().int().min(0).max(255);

export const htmlImportSettingsSchema = z.object({
  excludedElements: z.array(htmlTagNameSchema).max(20).default([]),
  icuSubfilter: z.boolean().default(false),
});

export const jsonImportSettingsSchema = z.object({
  keyPaths: nameListSchema(50, 200).default([]),
  excludeKeyPaths: nameListSchema(50, 200).default([]),
  contextFields: nameListSchema(10, 64).default([]),
  characterLimitFields: nameListSchema(10, 64).default([]),
  htmlSubfilter: z.boolean().default(false),
  icuSubfilter: z.boolean().default(false),
});

export const excelColumnSchemeSchema = z.object({
  identifier: excelColumnIndexSchema.nullable().optional(),
  source: excelColumnIndexSchema.nullable().optional(),
  context: excelColumnIndexSchema.nullable().optional(),
  maxLength: excelColumnIndexSchema.nullable().optional(),
});

export const excelImportSettingsSchema = z.object({
  firstLineContainsHeader: z.boolean().nullable().optional(),
  columns: excelColumnSchemeSchema.default({}),
});

export const repositorySourceFileImportSettingsSchema = z.object({
  html: htmlImportSettingsSchema.default({ excludedElements: [], icuSubfilter: false }),
  json: jsonImportSettingsSchema.default({
    keyPaths: [],
    excludeKeyPaths: [],
    contextFields: [],
    characterLimitFields: [],
    htmlSubfilter: false,
    icuSubfilter: false,
  }),
  excel: excelImportSettingsSchema.default({ columns: {} }),
});

export type RepositorySourceFileImportSettings = z.infer<
  typeof repositorySourceFileImportSettingsSchema
>;
export type HtmlImportSettings = z.infer<typeof htmlImportSettingsSchema>;
export type JsonImportSettings = z.infer<typeof jsonImportSettingsSchema>;
export type ExcelImportSettings = z.infer<typeof excelImportSettingsSchema>;

export function defaultRepositorySourceFileImportSettings(): RepositorySourceFileImportSettings {
  return repositorySourceFileImportSettingsSchema.parse({});
}

export function normalizeImportSettings(
  raw: RepositorySourceFileImportSettings | null | undefined,
): RepositorySourceFileImportSettings {
  const parsed = repositorySourceFileImportSettingsSchema.safeParse(raw ?? {});
  return parsed.success ? parsed.data : defaultRepositorySourceFileImportSettings();
}

export function importSettingsAreActive(settings: RepositorySourceFileImportSettings): boolean {
  return (
    settings.html.excludedElements.length > 0 ||
    settings.html.icuSubfilter ||
    settings.json.keyPaths.length > 0 ||
    settings.json.excludeKeyPaths.length > 0 ||
    settings.json.contextFields.length > 0 ||
    settings.json.characterLimitFields.length > 0 ||
    settings.json.htmlSubfilter ||
    settings.json.icuSubfilter ||
    settings.excel.firstLineContainsHeader != null ||
    settings.excel.columns.identifier != null ||
    settings.excel.columns.source != null ||
    settings.excel.columns.context != null ||
    settings.excel.columns.maxLength != null
  );
}

export function sourcePathImportKind(sourcePath: string): "html" | "json" | "excel" | null {
  const ext = sourcePath.split(".").pop()?.toLowerCase() ?? "";
  if (ext === "html" || ext === "htm") {
    return "html";
  }
  if (ext === "json" || ext === "jsonc") {
    return "json";
  }
  if (ext === "xlsx" || ext === "xls") {
    return "excel";
  }
  return null;
}
