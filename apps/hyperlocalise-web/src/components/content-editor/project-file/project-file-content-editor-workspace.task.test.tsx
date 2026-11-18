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
import { waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { useSegmentActivityOpener } from "@/components/content-editor/activity-log/content-editor-segment-activity";
import { renderWithContentEditorProviders } from "@/components/content-editor/shared/content-editor-test-utils";
import { ContentEditorWorkspaceProvider } from "@/components/content-editor/workspace/content-editor-workspace-context";
import { DEFAULT_QA_POLICY } from "@/lib/qa/qa-policy";

import { createContentEditorLoadingWorkspaceState } from "./project-file-content-editor-mapper";
import { ProjectFileContentEditorWorkspace } from "./project-file-content-editor-workspace";

/*
 * Someone here through a task (a vendor, or a member given a task outside their teams) may use
 * only the editor routes the service opens to them. The service stand-in below answers those
 * and records every other request, so a save that still asks for something closed fails here.
 */
const { calls, closedCalls, goSvcClient, container, queueExtras, validated } = vi.hoisted(() => {
  const calls: string[] = [];
  const closedCalls: string[] = [];
  const container: { props: Record<string, never> | null; hasHistory: boolean } = {
    props: null,
    hasHistory: false,
  };
  const queueExtras: { value: Record<string, unknown> } = { value: {} };
  const validated: { modes: string[] | null } = { modes: null };
  type Query = { sourcePath: string; targetLocale: string; limit: number };
  const open: Record<string, (...args: never[]) => Promise<unknown>> = {
    "cat.queue": async (_organizationSlug: string, _projectId: string, query: Query) => ({
      contentEditorQueue: {
        sourcePath: query.sourcePath,
        filename: query.sourcePath,
        provider: null,
        targetLocale: query.targetLocale,
        canEditTranslations: true,
        truncated: false,
        segments: [
          {
            externalStringId: "a-1",
            key: "key.a-1",
            sourceText: "Source a-1",
            context: null,
            type: "text",
            sourcePath: query.sourcePath,
          },
        ],
        pagination: {
          offset: 0,
          limit: query.limit,
          returnedCount: 1,
          totalCount: 1,
          hasMore: false,
        },
        ...queueExtras.value,
      },
    }),
    "cat.targets": async () => ({ targets: [] }),
    "cat.segmentComments": async () => ({ comments: [] }),
    "cat.validateSegment": async (body: { modes: string[] }) => {
      validated.modes = body.modes;
      return { checks: [] };
    },
    "cat.saveTranslation": async (_organizationSlug: string, _projectId: string, body: never) => ({
      translation: { ...(body as object), status: "draft" },
    }),
  };
  const fake = (path: string[]): unknown =>
    new Proxy(() => undefined, {
      get: (_target, property) =>
        typeof property === "string" ? fake([...path, property]) : undefined,
      apply: (_target, _self, args) => {
        const name = path.join(".");
        calls.push(name);
        const handler = open[name];
        if (handler) {
          return handler(...(args as never[]));
        }
        closedCalls.push(name);
        return Promise.reject(new Error(`closed to a task owner: ${name}`));
      },
    });
  return { calls, closedCalls, goSvcClient: fake([]), container, queueExtras, validated };
});

vi.mock("@/lib/go-svc/use-go-svc-client", () => ({
  useGoSvcClient: () => ({ client: goSvcClient, loading: false }),
}));
vi.mock("@workos-inc/authkit-nextjs/components", () => ({
  useAuth: () => ({ user: { id: "user-1" } }),
}));
vi.mock("next/navigation", () => ({
  usePathname: () => "/jobs/job_1/strings",
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));
vi.mock("@/lib/api-client-instance", () => {
  const fake = (): unknown =>
    new Proxy(() => undefined, {
      get: (_target, property) => (typeof property === "string" ? fake() : undefined),
      apply: () => Promise.resolve({ status: 403, ok: false, json: async () => ({}) }),
    });
  return { apiClient: fake() };
});
// The editor's own screen is not under test: its handlers are called as the screen would.
vi.mock("@/components/content-editor/workspace/content-editor-workspace-container", () => ({
  ContentEditorWorkspaceContainer: function Container(props: Record<string, never>) {
    container.props = props;
    // What the editor's menus ask to know whether a string's history can be opened.
    container.hasHistory = useSegmentActivityOpener() !== null;
    return null;
  },
}));

type SaveTranslation = (
  segment: { id: string; sourceText: string },
  locale: string,
  text: string,
) => Promise<void>;

async function openEditor(taskScoped: boolean) {
  renderWithContentEditorProviders(
    <ContentEditorWorkspaceProvider
      initialState={createContentEditorLoadingWorkspaceState({
        sourcePath: "a.json",
        sourceLocale: "en",
        targetLocale: "de",
      })}
    >
      <ProjectFileContentEditorWorkspace
        organizationSlug="acme"
        projectId="p1"
        projectSource="native"
        sourceLocale="en"
        sourcePath="a.json"
        targetLocale="de"
        layout="fullscreen"
        taskScoped={taskScoped}
      />
    </ContentEditorWorkspaceProvider>,
  );
  await waitFor(() => {
    const multilingual = container.props?.multilingual as { canEdit?: boolean } | undefined;
    expect(multilingual?.canEdit).toBe(true);
  });
  return (container.props!.multilingual as { onSaveTranslation: SaveTranslation })
    .onSaveTranslation;
}

afterEach(() => {
  calls.length = 0;
  closedCalls.length = 0;
  container.props = null;
  container.hasHistory = false;
  queueExtras.value = {};
  validated.modes = null;
});

describe("the editor for someone here through a task", () => {
  it("saves a string asking only for what a task owner may reach", async () => {
    queueExtras.value = { qaChecks: DEFAULT_QA_POLICY, canApproveTranslations: false };
    const save = await openEditor(true);

    await save({ id: "a-1", sourceText: "Source a-1" }, "de", "Quelle a-1");

    expect(validated.modes?.length).toBeGreaterThan(0);
    expect(calls).toContain("cat.saveTranslation");
    expect(closedCalls).toEqual([]);
  });

  it("can open a string's history, which does not depend on the grouped view", async () => {
    await openEditor(true);

    expect(container.hasHistory).toBe(true);
    expect(closedCalls).toEqual([]);
  });

  it("is checked against the project's rules as sent with the task, not the defaults", async () => {
    queueExtras.value = {
      qaChecks: {
        ...DEFAULT_QA_POLICY,
        ...Object.fromEntries(
          Object.entries(DEFAULT_QA_POLICY).map(([check, setting]) => [
            check,
            { ...setting, enabled: false },
          ]),
        ),
      },
    };
    const save = await openEditor(true);

    await save({ id: "a-1", sourceText: "Source a-1" }, "de", "Quelle a-1");

    // With every check switched off the validator is asked for none.
    expect(validated.modes).toEqual([]);
    expect(calls).toContain("cat.saveTranslation");
    expect(closedCalls).toEqual([]);
  });

  it("still reads the project's own QA settings for someone on the project's team", async () => {
    const save = await openEditor(false);

    // The settings request is refused in this stand-in, so the save is stopped as it always was.
    await expect(
      save({ id: "a-1", sourceText: "Source a-1" }, "de", "Quelle a-1"),
    ).rejects.toThrow();
    expect(closedCalls).toContain("qaReport.project.list");
    expect(calls).not.toContain("cat.saveTranslation");
  });
});
