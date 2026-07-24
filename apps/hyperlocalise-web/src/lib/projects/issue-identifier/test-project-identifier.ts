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
import { randomUUID } from "node:crypto";

import {
  deriveProjectIssueIdentifierCandidate,
  uniquifyProjectIssueIdentifier,
} from "@/lib/projects/issue-identifier/project-issue-identifier";

/** Build a unique project identifier for test inserts within an organization. */
export function testProjectIdentifier(name = "Test Project", taken: ReadonlySet<string> = new Set()) {
  const candidate = deriveProjectIssueIdentifierCandidate(name);
  try {
    return uniquifyProjectIssueIdentifier(candidate, taken);
  } catch {
    return `T${randomUUID().replace(/-/g, "").slice(0, 9).toUpperCase()}`;
  }
}
