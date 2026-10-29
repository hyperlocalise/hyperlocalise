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

export function normalizeIterableSourcePath(value: string): string {
  return value
    .replace(/\\/g, "/")
    .replace(/^(?:\.\/)+/, "")
    .replace(/\/+/g, "/");
}

export function isIterableSourcePath(sourcePath: string): boolean {
  return normalizeIterableSourcePath(sourcePath).startsWith("iterable/");
}

export function slugifyIterablePathSegment(value: string, fallback: string): string {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || fallback.trim() || "item";
}

export function buildIterableEmailSourcePath(input: { templateId: number; name: string }): string {
  const slug = slugifyIterablePathSegment(input.name, String(input.templateId));
  return normalizeIterableSourcePath(`iterable/templates/email/${slug}.html`);
}

export function buildIterableInAppSourcePath(input: { templateId: number; name: string }): string {
  const slug = slugifyIterablePathSegment(input.name, String(input.templateId));
  return normalizeIterableSourcePath(`iterable/templates/in-app/${slug}.html`);
}

export function buildIterablePushSourcePath(input: { templateId: number; name: string }): string {
  const slug = slugifyIterablePathSegment(input.name, String(input.templateId));
  return normalizeIterableSourcePath(`iterable/templates/push/${slug}.json`);
}

export function buildIterableSmsSourcePath(input: { templateId: number; name: string }): string {
  const slug = slugifyIterablePathSegment(input.name, String(input.templateId));
  return normalizeIterableSourcePath(`iterable/templates/sms/${slug}.json`);
}

export function buildIterableSnippetSourcePath(input: { name: string }): string {
  const slug = slugifyIterablePathSegment(input.name, input.name);
  return normalizeIterableSourcePath(`iterable/snippets/${slug}.html`);
}

export function iterableSnippetLocaleCopyName(sourceName: string, projectLocale: string): string {
  return `${sourceName.trim()}_${projectLocale.trim()}`;
}

export function isIterableLocaleSuffixSnippetName(
  name: string,
  localeSuffixes: readonly string[],
): boolean {
  const trimmed = name.trim();
  for (const suffix of localeSuffixes) {
    const expected = `_${suffix.trim()}`;
    if (expected.length > 1 && trimmed.endsWith(expected)) {
      return true;
    }
  }
  return false;
}
