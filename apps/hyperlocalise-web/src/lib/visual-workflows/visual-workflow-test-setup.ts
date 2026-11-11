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
import "server-only";

import { and, eq } from "drizzle-orm";

import { db, schema, type DatabaseClient } from "@/lib/database/client";

import {
  EMPTY_VISUAL_WORKFLOW_TEST_SETUP,
  pruneTestSetup,
  visualWorkflowTestSetupSchema,
  type VisualWorkflowTestSetup,
} from "./editor/visual-workflow-test-data";
import { decryptWorkflowPayload, encryptWorkflowPayload } from "./workflow-credentials";

/**
 * A workflow's saved test setup. It is kept encrypted, like a run's trigger input and mock
 * outputs, since test data can hold real values copied from a run.
 */
export async function getVisualWorkflowTestSetup(input: {
  organizationId: string;
  visualWorkflowId: string;
  dbClient?: DatabaseClient;
}): Promise<VisualWorkflowTestSetup> {
  const [row] = await (input.dbClient ?? db)
    .select({ encryptedTestSetup: schema.visualWorkflows.encryptedTestSetup })
    .from(schema.visualWorkflows)
    .where(
      and(
        eq(schema.visualWorkflows.organizationId, input.organizationId),
        eq(schema.visualWorkflows.id, input.visualWorkflowId),
      ),
    )
    .limit(1);
  if (!row?.encryptedTestSetup) return EMPTY_VISUAL_WORKFLOW_TEST_SETUP;
  const parsed = visualWorkflowTestSetupSchema.safeParse(
    decryptWorkflowPayload(row.encryptedTestSetup),
  );
  return parsed.success ? parsed.data : EMPTY_VISUAL_WORKFLOW_TEST_SETUP;
}

/**
 * A test setup as it is stored: encrypted, without entries for steps the draft no longer has.
 * The draft's update writes it, so the two are saved together under one revision check.
 */
export function encryptVisualWorkflowTestSetup(
  setup: VisualWorkflowTestSetup,
  nodeIds: Iterable<string>,
): Record<string, unknown> {
  return encryptWorkflowPayload(pruneTestSetup(setup, nodeIds));
}
