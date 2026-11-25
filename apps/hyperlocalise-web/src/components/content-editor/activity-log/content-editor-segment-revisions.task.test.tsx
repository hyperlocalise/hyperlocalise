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
// @vitest-environment happy-dom
import { cleanup, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { renderWithContentEditorProviders } from "@/components/content-editor/shared/content-editor-test-utils";
import {
  ContentEditorTaskScopeProvider,
  type ContentEditorTaskScope,
} from "@/components/content-editor/shared/content-editor-task-scope-context";

import { SegmentRevisions } from "./content-editor-segment-revisions";

function revision(id: string, status: string, isCurrent = false) {
  return {
    id,
    text: `Text of ${id}`,
    status,
    isCurrent,
    provenance: "manual",
    origin: "human",
    sourceJobId: null,
    operationId: `operation-${id}`,
    restoredFromRevisionId: null,
    createdAt: "2026-11-16T00:00:00.000Z",
    actor: { kind: "user", displayName: "Ada", userId: "user-1" },
  };
}

function renderHistory(taskScope: ContentEditorTaskScope | null) {
  const client = {
    cat: {
      segmentRevisions: vi.fn(async () => ({
        revisions: [
          revision("current", "draft", true),
          revision("approved", "approved"),
          revision("rejected", "rejected"),
          revision("draft", "draft"),
          revision("machine", "needs_review"),
        ],
        nextCursor: null,
      })),
    },
  };
  const history = (
    <SegmentRevisions
      scope={{ client: client as never, organizationSlug: "acme", projectId: "p1" }}
      segmentId="a-1"
      sourcePath="a.json"
      targetLocale="de"
    />
  );
  renderWithContentEditorProviders(
    taskScope ? (
      <ContentEditorTaskScopeProvider value={taskScope}>{history}</ContentEditorTaskScopeProvider>
    ) : (
      history
    ),
  );
}

const count = (name: string) => screen.queryAllByRole("button", { name }).length;

afterEach(cleanup);

describe("a string's history for someone here through a task", () => {
  it("offers Restore and Undo on every earlier version to someone on the project's team", async () => {
    renderHistory(null);

    await screen.findAllByRole("button", { name: "Restore this version" });
    expect(count("Restore this version")).toBe(4);
    expect(count("Undo this change everywhere")).toBeGreaterThan(0);
  });

  it("offers Restore on every earlier version through a task, and no Undo", async () => {
    renderHistory({ taskScoped: true });

    await screen.findAllByRole("button", { name: "Restore this version" });
    expect(count("Restore this version")).toBe(4);
    expect(count("Undo this change everywhere")).toBe(0);
  });
});
