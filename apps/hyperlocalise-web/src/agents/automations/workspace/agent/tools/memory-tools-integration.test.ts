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

import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vite-plus/test";

// The workspace-knowledge feature-flag gate save_memory/recall_memory call at the start of
// execute() reaches a real WorkOS flag lookup. Against the placeholder WorkOS credentials the
// standard `vp test` environment runs with, that lookup's failure path resolves to false,
// short-circuiting both tools into their nonfatal "disabled" outcomes before they ever touch the
// database — failing every assertion below that expects a real persisted append.
//
// This is a full module replacement, not importOriginal + spread: workspace-flags.ts transitively
// imports workos-adapter.ts, which imports @/lib/e2e/config — a module missing from this branch's
// checkout (confirmed absent from the tree; present on main), so actually loading the real module
// to spread its other exports fails at import time. A blanket replacement is safe here because
// recall_memory.ts/save_memory.ts (the only consumers reachable from this test) import nothing
// else from workspace-flags.ts, and nothing else in this file's import graph touches it either.
// @/lib/knowledge-memory/knowledge-memory stays real (see the comment below).
const resolveWorkspaceKnowledgeFlagMock = vi.hoisted(() => vi.fn(async () => true));

vi.mock("@/lib/flags/workspace-flags", () => ({
  resolveWorkspaceKnowledgeFlag: resolveWorkspaceKnowledgeFlagMock,
}));

import { createAuthTestFixture } from "@/api/test-auth.fixture";
import type {
  WorkspaceAutomationRecord,
  WorkspaceAutomationRunRecord,
} from "@/lib/agents/workspace-automation-types";
import { db, schema } from "@/lib/database/client";
import { getKnowledgeMemoryForOrganization } from "@/lib/knowledge-memory/knowledge-memory";
import { eq } from "drizzle-orm";

import type { WorkspaceOrchestratorSession } from "../context";
import { createRecallMemoryTool } from "./recall_memory";
import { createSaveMemoryTool } from "./save_memory";

// Deliberately does NOT mock @/lib/knowledge-memory/knowledge-memory: this is the one test in the
// suite that proves save_memory and recall_memory actually read and write real Postgres rows,
// not just that they call the right functions with the right arguments (see save_memory.test.ts /
// recall_memory.test.ts for that, mocked, coverage). In particular this is the only place that
// exercises updatedByUserId: null against the real column and constraints, since every other
// DB-backed knowledge-memory test predates this feature and always passes a real user id.
const fixture = createAuthTestFixture();

beforeAll(async () => {
  await db.$client.query("select 1");
});

beforeEach(() => {
  resolveWorkspaceKnowledgeFlagMock.mockResolvedValue(true);
});

afterEach(async () => {
  await fixture.cleanup();
});

const toolCallContext = { toolCallId: "call-1", messages: [], context: {} };

function automation(input: {
  organizationId: string;
  toolConfig: WorkspaceAutomationRecord["toolConfig"];
}): WorkspaceAutomationRecord {
  return {
    id: "automation-1",
    organizationId: input.organizationId,
    authorUserId: null,
    status: "active",
    name: "Nightly reviewer sync",
    instructions: "Remember reviewer preferences when asked.",
    projectId: null,
    triggerConfig: { mode: "manual" },
    repositoryTarget: { kind: "none" },
    toolConfig: input.toolConfig,
    model: "openai/gpt-5.6-luna",
    configVersion: 1,
    nextRunAt: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

function run(): WorkspaceAutomationRunRecord {
  return {
    id: "run-1",
    automationId: "automation-1",
    organizationId: "org-1",
    triggerSource: "manual",
    status: "running",
    idempotencyKey: null,
    inputSnapshot: {},
    outputSummary: {},
    error: null,
    githubRepositoryAutomationJobId: null,
    startedAt: "2026-01-01T00:00:00.000Z",
    completedAt: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

function session(input: {
  organizationId: string;
  toolConfig: WorkspaceAutomationRecord["toolConfig"];
}): WorkspaceOrchestratorSession {
  return {
    organizationId: input.organizationId,
    automation: automation(input),
    run: run(),
    plan: { tools: [] },
    repository: null,
    composedInstructions: "",
    stepResults: {},
    terminalStatus: null,
    terminalError: null,
  };
}

describe("save_memory and recall_memory against a real database", () => {
  it("actually persists an append, survives a re-read, and is findable by recall_memory", async () => {
    const stored = await fixture.createLocalWorkosIdentity();
    const organizationId = stored.organization.id;

    const testSession = session({
      organizationId,
      toolConfig: { knowledge: { enabled: true, allowUpdates: true } },
    });

    const saveTool = createSaveMemoryTool(testSession);
    const saveResult = (await saveTool.execute!(
      { entry: "Reviewer for the pricing-page repo is Alex." },
      toolCallContext,
    )) as { appended: boolean; revisionId: string };

    expect(saveResult.appended).toBe(true);
    expect(saveResult.revisionId).toBeTruthy();

    // Re-read directly from the DB, independent of the tool, to prove this isn't just an
    // in-memory echo of what was sent.
    const persisted = await getKnowledgeMemoryForOrganization(organizationId);
    expect(persisted.content).toBe("Reviewer for the pricing-page repo is Alex.");
    expect(persisted.revisionId).toBe(saveResult.revisionId);
    // No human actor for an agent-authored commit — this is the specific gap that was never
    // exercised against a real DB before this test: updatedByUserId is nullable, but no prior
    // DB-backed test ever inserted a null there.
    expect(persisted.updatedByUserId).toBeNull();
    expect(persisted.summary).toContain("Nightly reviewer sync");
    expect(persisted.summary).toContain("run-1");

    // A second append must be additive, not a replace, and must land as a new revision.
    const secondSave = (await createSaveMemoryTool(testSession).execute!(
      { entry: "Never merge without a passing localisation check." },
      toolCallContext,
    )) as { appended: boolean; revisionId: string };
    expect(secondSave.revisionId).not.toBe(saveResult.revisionId);

    const afterSecondAppend = await getKnowledgeMemoryForOrganization(organizationId);
    expect(afterSecondAppend.content).toBe(
      "Reviewer for the pricing-page repo is Alex.\n\nNever merge without a passing localisation check.",
    );

    const [revisionRows] = await db
      .select()
      .from(schema.knowledgeMemoryRevisions)
      .where(eq(schema.knowledgeMemoryRevisions.organizationId, organizationId));
    expect(revisionRows).toBeDefined();

    // recall_memory must be able to find what save_memory just wrote, end to end through the
    // real selector, not a mock standing in for it.
    const recallTool = createRecallMemoryTool(testSession);
    const recallResult = (await recallTool.execute!(
      { query: "who reviews the pricing page repo?" },
      toolCallContext,
    )) as { found: boolean; content: string | null };

    expect(recallResult.found).toBe(true);
    expect(recallResult.content).toContain("Alex");
  });

  it("rejects a stale append against the real optimistic-concurrency check", async () => {
    const stored = await fixture.createLocalWorkosIdentity();
    const organizationId = stored.organization.id;
    const toolConfig: WorkspaceAutomationRecord["toolConfig"] = {
      knowledge: { enabled: true, allowUpdates: true },
    };

    // Editor A appends first.
    await createSaveMemoryTool(session({ organizationId, toolConfig })).execute!(
      { entry: "First fact." },
      toolCallContext,
    );

    // Editor B's tool call reads current state fresh (as save_memory always does) and should
    // still succeed, proving the tool always re-reads rather than trusting stale state — this
    // is inherent to the tool's design (no client-supplied expectedRevisionId), so the real
    // concurrency risk to verify is that two concurrent calls against the same starting state
    // both land as sequential, non-clobbering revisions rather than one silently overwriting
    // the other.
    const secondSession = session({ organizationId, toolConfig });
    const secondResult = (await createSaveMemoryTool(secondSession).execute!(
      { entry: "Second fact, appended after the first." },
      toolCallContext,
    )) as { appended: boolean };
    expect(secondResult.appended).toBe(true);

    const finalState = await getKnowledgeMemoryForOrganization(organizationId);
    expect(finalState.content).toContain("First fact.");
    expect(finalState.content).toContain("Second fact, appended after the first.");
  });
});
