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

export const PROJECT_ISSUE_IDENTIFIER_MAX_LENGTH = 10;
export const PROJECT_ISSUE_IDENTIFIER_FALLBACK = "PROJ";

/** Project prefix: 1–10 uppercase letters/digits, must start with a letter. */
export const projectIssueIdentifierSchema = z
  .string()
  .trim()
  .transform((value) => value.toUpperCase())
  .pipe(
    z
      .string()
      .min(1)
      .max(PROJECT_ISSUE_IDENTIFIER_MAX_LENGTH)
      .regex(/^[A-Z][A-Z0-9]{0,9}$/, "identifier must be 1–10 uppercase letters or digits"),
  );

/** Issue id: PREFIX-N where N is a positive integer. */
export const issueIdSchema = z
  .string()
  .trim()
  .regex(/^[A-Z][A-Z0-9]{0,9}-[1-9][0-9]*$/, "issue id must look like PREFIX-123");

const ISSUE_IDENTIFIER_PREFIX_PATTERN = /^([A-Z][A-Z0-9]{0,9})-[1-9][0-9]*$/;

export function formatIssueId(projectIdentifier: string, number: number) {
  return `${projectIdentifier}-${number}`;
}

/** Extract the project prefix from a PREFIX-N issue identifier, or null if invalid. */
export function extractProjectIdentifierPrefix(issueIdentifier: string): string | null {
  const match = ISSUE_IDENTIFIER_PREFIX_PATTERN.exec(issueIdentifier.trim());
  return match?.[1] ?? null;
}

/**
 * Derive a short project issue-ID prefix from a display name.
 * Prefers word initials; falls back to leading letters of the stripped name.
 */
export function deriveProjectIdentifierCandidate(name: string): string {
  const words = name
    .trim()
    .split(/[\s/_-]+/)
    .map((word) => word.replace(/[^A-Za-z0-9]/g, ""))
    .filter(Boolean);

  const initials = words
    .map((word) => word[0]!)
    .join("")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");

  let candidate = initials;
  if (candidate.length < 2) {
    const letters = name
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, "")
      .slice(0, 3);
    candidate = letters.length >= 2 ? letters : PROJECT_ISSUE_IDENTIFIER_FALLBACK;
  }

  candidate = candidate.slice(0, PROJECT_ISSUE_IDENTIFIER_MAX_LENGTH);
  if (!/^[A-Z]/.test(candidate)) {
    candidate = `P${candidate}`.slice(0, PROJECT_ISSUE_IDENTIFIER_MAX_LENGTH);
  }
  if (!/^[A-Z][A-Z0-9]{0,9}$/.test(candidate)) {
    return PROJECT_ISSUE_IDENTIFIER_FALLBACK;
  }
  return candidate;
}

/**
 * Pick an unused identifier globally. Appends 2, 3, … when needed.
 */
export function uniquifyProjectIdentifier(candidate: string, taken: ReadonlySet<string>): string {
  const normalized = projectIssueIdentifierSchema.parse(candidate);
  if (!taken.has(normalized)) {
    return normalized;
  }

  for (let suffix = 2; suffix <= 10_000; suffix += 1) {
    const suffixText = String(suffix);
    const baseMax = PROJECT_ISSUE_IDENTIFIER_MAX_LENGTH - suffixText.length;
    if (baseMax < 1) {
      const fallback = `${PROJECT_ISSUE_IDENTIFIER_FALLBACK}${suffixText}`.slice(
        0,
        PROJECT_ISSUE_IDENTIFIER_MAX_LENGTH,
      );
      if (!taken.has(fallback) && /^[A-Z][A-Z0-9]{0,9}$/.test(fallback)) {
        return fallback;
      }
      continue;
    }

    let base = normalized.slice(0, baseMax);
    if (!/^[A-Z]/.test(base)) {
      base = "P";
    }
    const next = `${base}${suffixText}`.slice(0, PROJECT_ISSUE_IDENTIFIER_MAX_LENGTH);
    if (!taken.has(next)) {
      return next;
    }
  }

  throw new Error("project_issue_identifier_exhausted");
}
