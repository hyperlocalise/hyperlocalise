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
import type {
  ProjectFileCatGroup,
  ProjectFileCatQueueSegment,
  ProjectFileCatSegment,
} from "@/api/routes/project/project.schema";

export function isCatQueueGroup(
  segment: ProjectFileCatQueueSegment,
): segment is ProjectFileCatGroup {
  return segment.kind === "group";
}

export function isCatQueueSegmentRow(
  segment: ProjectFileCatQueueSegment,
): segment is ProjectFileCatSegment {
  return segment.kind !== "group";
}
