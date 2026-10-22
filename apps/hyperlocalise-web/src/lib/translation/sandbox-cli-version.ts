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
import { env } from "@/lib/env";

/** Production default hyperlocalise CLI release installed into every sandbox. */
export const defaultSandboxHyperlocaliseReleaseVersion = "1.13.6";

/**
 * Pinned sandbox CLI release when no env override is set. Prefer
 * {@link resolveSandboxHyperlocaliseReleaseVersion} for install scripts and capability checks.
 */
export const sandboxHyperlocaliseReleaseVersion = defaultSandboxHyperlocaliseReleaseVersion;

/**
 * First CLI release whose `hl entries` and `hl run` read and write `.xlsx`, `.docx`, and
 * `.pptx`. `.xls` reaches the CLI converted to `.xlsx`.
 */
export const hyperlocaliseCliOfficeReleaseVersion = "1.13.4";

/** First CLI release whose `hl entries` and `hl run` read and write `.pdf`. */
export const hyperlocaliseCliPdfReleaseVersion = "1.13.6";

function parseReleaseVersion(version: string): number[] {
  return version
    .trim()
    .replace(/^v/, "")
    .split("-")[0]!
    .split(".")
    .map((part) => Number.parseInt(part, 10) || 0);
}

export function normalizeSandboxCliReleaseVersion(raw: string): string {
  const trimmed = raw.trim().replace(/^v/, "");
  const core = trimmed.split("-")[0] ?? trimmed;
  if (!/^\d+\.\d+\.\d+$/.test(core)) {
    return defaultSandboxHyperlocaliseReleaseVersion;
  }
  return core;
}

/**
 * CLI release tarball version for sandbox bootstrap. Uses `SANDBOX_HYPERLOCALISE_CLI_VERSION`
 * when set (local dev before a GitHub release is published); otherwise the production pin.
 */
export function resolveSandboxHyperlocaliseReleaseVersion(): string {
  const override = env.SANDBOX_HYPERLOCALISE_CLI_VERSION;
  if (override == null || override.length === 0) {
    return defaultSandboxHyperlocaliseReleaseVersion;
  }
  return normalizeSandboxCliReleaseVersion(override);
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
  version: string = resolveSandboxHyperlocaliseReleaseVersion(),
): boolean {
  return isReleaseVersionAtLeast(version, hyperlocaliseCliOfficeReleaseVersion);
}

/** Whether the sandbox CLI parses PDF files into keyed segments. */
export function sandboxCliParsesPdf(
  version: string = resolveSandboxHyperlocaliseReleaseVersion(),
): boolean {
  return isReleaseVersionAtLeast(version, hyperlocaliseCliPdfReleaseVersion);
}
