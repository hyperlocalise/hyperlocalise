/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in the LICENSE file.
 *
 * Change Date: Four years from the date the Licensed Work is published.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
import { z } from "zod";

export function normalizeProjectId(value: string): string;
export function normalizeProjectId(value: unknown): unknown;
export function normalizeProjectId(value: unknown) {
  if (typeof value !== "string") {
    return value;
  }

  let projectId = value.trim();
  for (let index = 0; index < 2 && projectId.includes("%"); index += 1) {
    try {
      const decoded = decodeURIComponent(projectId);
      if (decoded === projectId) {
        break;
      }
      projectId = decoded;
    } catch {
      break;
    }
  }

  return projectId;
}

export const projectIdSchema = z.preprocess(normalizeProjectId, z.string().trim().min(1).max(128));

export const optionalProjectIdSchema = z.preprocess(
  normalizeProjectId,
  z.string().trim().min(1).max(128).optional(),
);
