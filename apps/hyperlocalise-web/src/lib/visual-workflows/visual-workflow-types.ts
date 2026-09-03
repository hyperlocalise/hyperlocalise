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

import type { VisualWorkflowDefinition } from "./schema/types";

export const visualWorkflowStatusSchema = z.enum(["draft", "active", "paused", "archived"]);

export type VisualWorkflowStatus = z.infer<typeof visualWorkflowStatusSchema>;

export type VisualWorkflowRecord = {
  id: string;
  organizationId: string;
  authorUserId: string | null;
  projectId: string | null;
  status: VisualWorkflowStatus;
  name: string;
  definition: VisualWorkflowDefinition;
  definitionVersion: number;
  createdAt: string;
  updatedAt: string;
};

export type VisualWorkflowValidationError =
  | { code: "invalid_definition"; message: string }
  | { code: "invalid_graph"; issues: Array<{ code: string; nodeId?: string }> };
