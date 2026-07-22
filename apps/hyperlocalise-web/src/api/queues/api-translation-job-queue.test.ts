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
import "dotenv/config";

import { randomUUID } from "node:crypto";

import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vite-plus/test";

const { workflowEnqueueMock, workspaceKnowledgeFlagRunMock } = vi.hoisted(() => ({
  workflowEnqueueMock: vi.fn(),
  workspaceKnowledgeFlagRunMock: vi.fn(),
}));

vi.mock("@/lib/workflow/queues", () => ({
  createTranslationJobEventQueue: () => ({ enqueue: workflowEnqueueMock }),
}));

vi.mock("@/lib/flags/workspace-flags", () => ({
  workspaceKnowledgeFlag: { run: workspaceKnowledgeFlagRunMock },
}));

import { createProjectTestFixture } from "@/api/routes/project/project.fixture";
import { db } from "@/lib/database";
import type { TranslationJobEventData } from "@/lib/workflow/types";

import { createApiTranslationJobQueue } from "./api-translation-job-queue";

const fixture = createProjectTestFixture();

beforeAll(async () => {
  await db.$client.query("select 1");
});

beforeEach(() => {
  workflowEnqueueMock.mockResolvedValue({ ids: ["run_test"] });
  workspaceKnowledgeFlagRunMock.mockResolvedValue(true);
});

afterEach(async () => {
  vi.clearAllMocks();
  await fixture.cleanup();
});

describe("createApiTranslationJobQueue", () => {
  it("enables knowledge memory for an entitled string job organization", async () => {
    const { organization, project } = await fixture.createStoredProjectFixture();
    const queue = createApiTranslationJobQueue();

    await queue.enqueue({
      kind: "translation",
      jobId: `job_${randomUUID()}`,
      projectId: project.id,
      type: "string",
    });

    expect(workflowEnqueueMock).toHaveBeenCalledWith(
      expect.objectContaining({ knowledgeMemoryEnabled: true }),
    );
    const flagInput = workspaceKnowledgeFlagRunMock.mock.calls[0]?.[0] as {
      identify: () => { organization: { id: string } };
    };
    expect(flagInput.identify()).toEqual({
      organization: { id: organization.workosOrganizationId },
    });
  });

  it("disables knowledge memory for a non-entitled string job organization", async () => {
    const { project } = await fixture.createStoredProjectFixture();
    workspaceKnowledgeFlagRunMock.mockResolvedValue(false);
    const queue = createApiTranslationJobQueue();

    await queue.enqueue({
      kind: "translation",
      jobId: `job_${randomUUID()}`,
      projectId: project.id,
      type: "string",
    });

    expect(workflowEnqueueMock).toHaveBeenCalledWith(
      expect.objectContaining({ knowledgeMemoryEnabled: false }),
    );
  });

  it("fails closed when the project cannot be resolved", async () => {
    const queue = createApiTranslationJobQueue();

    await queue.enqueue({
      kind: "translation",
      jobId: `job_${randomUUID()}`,
      projectId: randomUUID(),
      type: "string",
    });

    expect(workspaceKnowledgeFlagRunMock).not.toHaveBeenCalled();
    expect(workflowEnqueueMock).toHaveBeenCalledWith(
      expect.objectContaining({ knowledgeMemoryEnabled: false }),
    );
  });

  it("fails closed when the entitlement lookup throws", async () => {
    const { project } = await fixture.createStoredProjectFixture();
    workspaceKnowledgeFlagRunMock.mockRejectedValue(new Error("flag unavailable"));
    const queue = createApiTranslationJobQueue();

    await queue.enqueue({
      kind: "translation",
      jobId: `job_${randomUUID()}`,
      projectId: project.id,
      type: "string",
    });

    expect(workflowEnqueueMock).toHaveBeenCalledWith(
      expect.objectContaining({ knowledgeMemoryEnabled: false }),
    );
  });

  it("passes file events through without resolving the entitlement", async () => {
    const queue = createApiTranslationJobQueue();
    const event = {
      kind: "translation",
      jobId: `job_${randomUUID()}`,
      projectId: randomUUID(),
      type: "file",
    } satisfies TranslationJobEventData;

    await queue.enqueue(event);

    expect(workspaceKnowledgeFlagRunMock).not.toHaveBeenCalled();
    expect(workflowEnqueueMock).toHaveBeenCalledWith(event);
  });
});
