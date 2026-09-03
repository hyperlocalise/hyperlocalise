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
import type { VisualWorkflowDefinition } from "@/lib/visual-workflows/schema/types";
import type { VisualWorkflowRecord } from "@/lib/visual-workflows/visual-workflow-types";
import type { VisualWorkflowRunRecord } from "@/lib/visual-workflows/visual-workflow-run-types";
import { readApiResponseError } from "@/lib/api-error";

export type VisualWorkflowsApi = {
  listVisualWorkflows(organizationSlug: string): Promise<VisualWorkflowRecord[]>;
  getVisualWorkflow(
    organizationSlug: string,
    visualWorkflowId: string,
  ): Promise<VisualWorkflowRecord>;
  createVisualWorkflow(
    organizationSlug: string,
    input?: { name?: string; definition?: VisualWorkflowDefinition },
  ): Promise<VisualWorkflowRecord>;
  updateVisualWorkflow(
    organizationSlug: string,
    visualWorkflowId: string,
    input: {
      name?: string;
      definition?: VisualWorkflowDefinition;
      status?: VisualWorkflowRecord["status"];
    },
  ): Promise<VisualWorkflowRecord>;
  createVisualWorkflowRun(
    organizationSlug: string,
    visualWorkflowId: string,
    input: { idempotencyKey: string; inputSnapshot?: Record<string, unknown> },
  ): Promise<{ run: VisualWorkflowRunRecord; dispatch: { runId: string; enqueued: boolean } }>;
  listVisualWorkflowRuns(
    organizationSlug: string,
    visualWorkflowId: string,
    input?: { limit?: number; offset?: number },
  ): Promise<VisualWorkflowRunRecord[]>;
  getVisualWorkflowRun(
    organizationSlug: string,
    visualWorkflowId: string,
    runId: string,
  ): Promise<VisualWorkflowRunRecord>;
};

function visualWorkflowsBasePath(organizationSlug: string) {
  return `/api/orgs/${encodeURIComponent(organizationSlug)}/visual-workflows`;
}

export function createVisualWorkflowsApi(): VisualWorkflowsApi {
  return {
    async listVisualWorkflows(organizationSlug) {
      const response = await fetch(
        `${visualWorkflowsBasePath(organizationSlug)}?limit=100&offset=0`,
        { credentials: "include" },
      );
      if (!response.ok) {
        throw await readApiResponseError(response, "Failed to load visual workflows");
      }
      const body = (await response.json()) as { visualWorkflows: VisualWorkflowRecord[] };
      return body.visualWorkflows;
    },
    async getVisualWorkflow(organizationSlug, visualWorkflowId) {
      const response = await fetch(
        `${visualWorkflowsBasePath(organizationSlug)}/${encodeURIComponent(visualWorkflowId)}`,
        { credentials: "include" },
      );
      if (!response.ok) {
        throw await readApiResponseError(response, "Failed to load visual workflow");
      }
      const body = (await response.json()) as { visualWorkflow: VisualWorkflowRecord };
      return body.visualWorkflow;
    },
    async createVisualWorkflow(organizationSlug, input) {
      const response = await fetch(visualWorkflowsBasePath(organizationSlug), {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input ?? {}),
      });
      if (!response.ok) {
        throw await readApiResponseError(response, "Failed to create visual workflow");
      }
      const body = (await response.json()) as { visualWorkflow: VisualWorkflowRecord };
      return body.visualWorkflow;
    },
    async updateVisualWorkflow(organizationSlug, visualWorkflowId, input) {
      const response = await fetch(
        `${visualWorkflowsBasePath(organizationSlug)}/${encodeURIComponent(visualWorkflowId)}`,
        {
          method: "PATCH",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(input),
        },
      );
      if (!response.ok) {
        throw await readApiResponseError(response, "Failed to save visual workflow");
      }
      const body = (await response.json()) as { visualWorkflow: VisualWorkflowRecord };
      return body.visualWorkflow;
    },
    async createVisualWorkflowRun(organizationSlug, visualWorkflowId, input) {
      const response = await fetch(
        `${visualWorkflowsBasePath(organizationSlug)}/${encodeURIComponent(visualWorkflowId)}/runs`,
        {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(input),
        },
      );
      if (!response.ok) {
        throw await readApiResponseError(response, "Failed to start visual workflow run");
      }
      return (await response.json()) as {
        run: VisualWorkflowRunRecord;
        dispatch: { runId: string; enqueued: boolean };
      };
    },
    async listVisualWorkflowRuns(organizationSlug, visualWorkflowId, input) {
      const params = new URLSearchParams();
      if (input?.limit !== undefined) {
        params.set("limit", String(input.limit));
      }
      if (input?.offset !== undefined) {
        params.set("offset", String(input.offset));
      }
      const query = params.toString();
      const response = await fetch(
        `${visualWorkflowsBasePath(organizationSlug)}/${encodeURIComponent(visualWorkflowId)}/runs${query ? `?${query}` : ""}`,
        { credentials: "include" },
      );
      if (!response.ok) {
        throw await readApiResponseError(response, "Failed to load visual workflow runs");
      }
      const body = (await response.json()) as { runs: VisualWorkflowRunRecord[] };
      return body.runs;
    },
    async getVisualWorkflowRun(organizationSlug, visualWorkflowId, runId) {
      const response = await fetch(
        `${visualWorkflowsBasePath(organizationSlug)}/${encodeURIComponent(visualWorkflowId)}/runs/${encodeURIComponent(runId)}`,
        { credentials: "include" },
      );
      if (!response.ok) {
        throw await readApiResponseError(response, "Failed to load visual workflow run");
      }
      const body = (await response.json()) as { run: VisualWorkflowRunRecord };
      return body.run;
    },
  };
}
