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
import { screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vite-plus/test";

import { renderWithContentEditorProviders } from "@/components/content-editor/shared/content-editor-test-utils";
import {
  ContentEditorWorkspaceProvider,
  useContentEditorWorkspace,
} from "@/components/content-editor/workspace/content-editor-workspace-context";
import type { ContentEditorWorkspaceOrchestrator } from "@/components/content-editor/workspace/content-editor-workspace-orchestrator";

import { createContentEditorLoadingWorkspaceState } from "./project-file-content-editor-mapper";
import { ProjectFileContentEditorWorkspace } from "./project-file-content-editor-workspace";

const SEGMENT_IDS: Record<string, string[]> = {
  "a.json": ["a-1", "a-2"],
  "b.json": ["b-1", "b-2"],
};

const { commentRequests, goSvcClient } = vi.hoisted(() => {
  const commentRequests: string[] = [];
  type Query = { sourcePath: string; targetLocale: string; limit: number };
  type TargetsBody = {
    segments: { sourcePath: string; externalStringId: string }[];
    targetLocales: string[];
  };
  const handlers: Record<string, (...args: never[]) => Promise<unknown>> = {
    "cat.queue": async (_organizationSlug: string, _projectId: string, query: Query) => {
      await new Promise((resolve) => setTimeout(resolve, 10));
      const ids = query.sourcePath === "a.json" ? ["a-1", "a-2"] : ["b-1", "b-2"];
      return {
        contentEditorQueue: {
          sourcePath: query.sourcePath,
          filename: query.sourcePath,
          provider: null,
          targetLocale: query.targetLocale,
          canEditTranslations: true,
          truncated: false,
          segments: ids.map((id) => ({
            externalStringId: id,
            key: `key.${id}`,
            sourceText: `Source ${id}`,
            context: null,
            type: "text",
            sourcePath: query.sourcePath,
          })),
          pagination: {
            offset: 0,
            limit: query.limit,
            returnedCount: ids.length,
            totalCount: ids.length,
            hasMore: false,
          },
        },
      };
    },
    "cat.targets": async (_organizationSlug: string, _projectId: string, body: TargetsBody) => ({
      targets: body.segments.map((segment) => ({
        ...segment,
        targets: Object.fromEntries(body.targetLocales.map((locale) => [locale, null])),
      })),
    }),
    "cat.segmentComments": async (
      _organizationSlug: string,
      _projectId: string,
      externalStringId: string,
      query: Query,
    ) => {
      commentRequests.push(`${query.sourcePath}/${externalStringId}`);
      return { comments: [] };
    },
    "project.contentEditorBehavior": async () => ({
      contentEditorBehavior: {
        automaticallyGroupIdenticalStrings: false,
        groupingRevision: 1,
        canManage: true,
      },
    }),
  };
  // Endpoints the file switch does not depend on fail like an unreachable service.
  const fake = (path: string[]): unknown =>
    new Proxy(() => undefined, {
      get: (_target, property) =>
        typeof property === "string" ? fake([...path, property]) : undefined,
      apply: (_target, _self, args) => {
        const handler = handlers[path.join(".")];
        return handler
          ? handler(...(args as never[]))
          : Promise.reject(new Error(`not faked: ${path.join(".")}`));
      },
    });
  return { commentRequests, goSvcClient: fake([]) };
});

vi.mock("@/lib/go-svc/use-go-svc-client", () => ({
  useGoSvcClient: () => ({ client: goSvcClient, loading: false }),
}));
vi.mock("@workos-inc/authkit-nextjs/components", () => ({
  useAuth: () => ({ user: { id: "user-1" } }),
}));
vi.mock("next/navigation", () => ({
  usePathname: () => "/files/content-editor",
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));
vi.mock("@/lib/api-client-instance", () => {
  const fake = (): unknown =>
    new Proxy(() => undefined, {
      get: (_target, property) => (typeof property === "string" ? fake() : undefined),
      apply: () => Promise.resolve({ status: 500, ok: false, json: async () => ({}) }),
    });
  return { apiClient: fake() };
});

let store: ContentEditorWorkspaceOrchestrator;
function StoreProbe() {
  store = useContentEditorWorkspace();
  return null;
}

// The page keeps one workspace store while the selected file changes.
function page(sourcePath: string) {
  return (
    <ContentEditorWorkspaceProvider
      initialState={createContentEditorLoadingWorkspaceState({
        sourcePath: "a.json",
        sourceLocale: "en",
        targetLocale: "de",
      })}
    >
      <StoreProbe />
      <ProjectFileContentEditorWorkspace
        organizationSlug="acme"
        projectId="p1"
        sourceLocale="en"
        sourcePath={sourcePath}
        targetLocale="de"
        layout="fullscreen"
      />
    </ContentEditorWorkspaceProvider>
  );
}

async function expectFileShown(sourcePath: string) {
  const [firstSegmentId] = SEGMENT_IDS[sourcePath];
  await waitFor(() => {
    expect(store.getQueuePanelSegments("all", true).map((segment) => segment.id)).toEqual(
      SEGMENT_IDS[sourcePath],
    );
    expect(commentRequests).toContain(`${sourcePath}/${firstSegmentId}`);
  });
  expect(screen.queryByText("No segments in queue.")).not.toBeInTheDocument();
}

describe("ProjectFileContentEditorWorkspace file switching", () => {
  it("shows each file's own segments and never loads another file's segment", async () => {
    const view = renderWithContentEditorProviders(page("a.json"));
    await expectFileShown("a.json");

    // First visit: the queue is fetched while the previous file is still in the store.
    view.rerender(page("b.json"));
    await expectFileShown("b.json");

    // Return visits: the queue is already cached.
    view.rerender(page("a.json"));
    await expectFileShown("a.json");
    view.rerender(page("b.json"));
    await expectFileShown("b.json");

    const mismatched = commentRequests.filter((request) => {
      const [sourcePath, segmentId] = request.split("/");
      return !SEGMENT_IDS[sourcePath]?.includes(segmentId);
    });
    expect(mismatched).toEqual([]);
  });
});
