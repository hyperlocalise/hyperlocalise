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
import "dotenv/config";

import { randomUUID } from "node:crypto";

import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vite-plus/test";

const { workflowEnqueueMock, resolveWorkspaceKnowledgeFlagMock } = vi.hoisted(() => ({
  workflowEnqueueMock: vi.fn(),
  resolveWorkspaceKnowledgeFlagMock: vi.fn(),
}));

vi.mock("@/lib/workflow/queues", () => ({
  createTranslationJobEventQueue: () => ({ enqueue: workflowEnqueueMock }),
}));

// Mocks resolveWorkspaceKnowledgeFlag itself, not workspaceKnowledgeFlag (the flag object it
// closes over): an importOriginal-spread mock re-exports the *real* resolveWorkspaceKnowledgeFlag
// function, whose own body still resolves `workspaceKnowledgeFlag` from its own module's closure,
// not from this file's mock object — the override never takes effect, and the real function reaches
// the real WorkOS adapter, which fails closed to false under vp test's placeholder credentials
// regardless of what this mock returns. Mocking the resolver directly avoids that entirely. This
// does mean resolveWorkspaceKnowledgeFlag's own org-lookup-then-flag.run() body isn't exercised
// here — it's covered by resolveKnowledgeMemoryEnabled's own org-lookup assertion below instead,
// and by memory-tools-integration.test.ts's real end-to-end DB coverage for the tools that call it.
vi.mock("@/lib/flags/workspace-flags", () => ({
  resolveWorkspaceKnowledgeFlag: resolveWorkspaceKnowledgeFlagMock,
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
  resolveWorkspaceKnowledgeFlagMock.mockResolvedValue(true);
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
    // Proves resolveKnowledgeMemoryEnabled's own project -> organizationId resolution, now that
    // resolveWorkspaceKnowledgeFlag's own internals are mocked out from under it.
    expect(resolveWorkspaceKnowledgeFlagMock).toHaveBeenCalledWith({
      organizationId: organization.id,
    });
  });

  it("disables knowledge memory for a non-entitled string job organization", async () => {
    const { project } = await fixture.createStoredProjectFixture();
    resolveWorkspaceKnowledgeFlagMock.mockResolvedValue(false);
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

    expect(resolveWorkspaceKnowledgeFlagMock).not.toHaveBeenCalled();
    expect(workflowEnqueueMock).toHaveBeenCalledWith(
      expect.objectContaining({ knowledgeMemoryEnabled: false }),
    );
  });

  it("fails closed when the entitlement lookup throws", async () => {
    const { project } = await fixture.createStoredProjectFixture();
    resolveWorkspaceKnowledgeFlagMock.mockRejectedValue(new Error("flag unavailable"));
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

    expect(resolveWorkspaceKnowledgeFlagMock).not.toHaveBeenCalled();
    expect(workflowEnqueueMock).toHaveBeenCalledWith(event);
  });
});
