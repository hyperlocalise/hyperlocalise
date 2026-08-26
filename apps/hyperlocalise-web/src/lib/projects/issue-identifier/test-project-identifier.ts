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
  deriveProjectIdentifierCandidate,
  uniquifyProjectIdentifier,
} from "@/lib/projects/issue-identifier/project-issue-identifier";

/** Deterministic identifier for fixtures that insert projects. */
export function testProjectIdentifier(name: string, taken: ReadonlySet<string> = new Set()) {
  return uniquifyProjectIdentifier(deriveProjectIdentifierCandidate(name), taken);
}

/** Unique short identifier for test inserts (avoids unique collisions). */
export function uniqueTestProjectIdentifier(seed?: string) {
  const suffix = (seed ?? randomUUID()).replace(/-/g, "").slice(0, 8).toUpperCase();
  return `T${suffix}`.slice(0, 10);
}
