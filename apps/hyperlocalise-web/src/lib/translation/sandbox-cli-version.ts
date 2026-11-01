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

/** Pinned hyperlocalise CLI release installed into every sandbox. */
export const sandboxHyperlocaliseReleaseVersion = "1.13.7";

/**
 * First CLI release whose `hl entries` and `hl run` read and write `.xlsx`, `.docx`, and
 * `.pptx`. `.xls` reaches the CLI converted to `.xlsx`.
 */
export const hyperlocaliseCliOfficeReleaseVersion = "1.13.4";

function parseReleaseVersion(version: string): number[] {
  return version
    .trim()
    .replace(/^v/, "")
    .split("-")[0]!
    .split(".")
    .map((part) => Number.parseInt(part, 10) || 0);
}

export function isReleaseVersionAtLeast(version: string, minimum: string): boolean {
  const actual = parseReleaseVersion(version);
  const required = parseReleaseVersion(minimum);
  for (let index = 0; index < Math.max(actual.length, required.length); index += 1) {
    const difference = (actual[index] ?? 0) - (required[index] ?? 0);
    if (difference !== 0) {
      return difference > 0;
    }
  }
  return true;
}

/**
 * Whether the sandbox CLI parses Office files into segments. Until the pin reaches
 * {@link hyperlocaliseCliOfficeReleaseVersion}, Office files are read in-process and
 * file translation jobs do not accept them.
 */
export function sandboxCliParsesOffice(
  version: string = sandboxHyperlocaliseReleaseVersion,
): boolean {
  return isReleaseVersionAtLeast(version, hyperlocaliseCliOfficeReleaseVersion);
}
