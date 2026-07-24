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

export function formatIssueIdentifier(projectIdentifier: string, number: number) {
  return `${projectIdentifier}-${number}`;
}

/**
 * Derive a short project issue-ID prefix from a display name.
 * Prefers word initials; falls back to leading letters of the stripped name.
 */
export function deriveProjectIssueIdentifierCandidate(name: string): string {
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
 * Pick an unused identifier in an organization. Appends 2, 3, … when needed.
 */
export function uniquifyProjectIssueIdentifier(
  candidate: string,
  taken: ReadonlySet<string>,
): string {
  const normalized = projectIssueIdentifierSchema.parse(candidate);
  if (!taken.has(normalized)) {
    return normalized;
  }

  for (let suffix = 2; suffix < 10_000; suffix += 1) {
    const suffixText = String(suffix);
    const baseMax = PROJECT_ISSUE_IDENTIFIER_MAX_LENGTH - suffixText.length;
    if (baseMax < 1) {
      break;
    }
    const base = normalized.slice(0, baseMax);
    // Ensure result still starts with a letter after truncation.
    const next = `${/^[A-Z]/.test(base) ? base : "P"}${suffixText}`.slice(
      0,
      PROJECT_ISSUE_IDENTIFIER_MAX_LENGTH,
    );
    if (/^[A-Z][A-Z0-9]{0,9}$/.test(next) && !taken.has(next)) {
      return next;
    }
  }

  // Extremely pathological collision set — fall back to PROJ + timestamp fragment.
  for (let n = 2; n < 10_000; n += 1) {
    const next = `${PROJECT_ISSUE_IDENTIFIER_FALLBACK}${n}`.slice(
      0,
      PROJECT_ISSUE_IDENTIFIER_MAX_LENGTH,
    );
    if (!taken.has(next)) {
      return next;
    }
  }

  throw new Error("project_issue_identifier_exhausted");
}
