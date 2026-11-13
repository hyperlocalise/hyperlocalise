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
import { apiClient } from "@/lib/api-client-instance";

export async function queueAutomationIngestRun(input: {
  organizationSlug: string;
  automationId: string;
}) {
  const response = await apiClient.api.orgs[":organizationSlug"].automations[
    ":automationId"
  ].runs.$post({
    param: {
      organizationSlug: input.organizationSlug,
      automationId: input.automationId,
    },
    json: {
      idempotencyKey: `manual:${input.automationId}:${crypto.randomUUID()}`,
      inputSnapshot: {},
    },
  });
  if (!response.ok) {
    throw new Error("Failed to queue ingest run");
  }
  return response.json();
}
