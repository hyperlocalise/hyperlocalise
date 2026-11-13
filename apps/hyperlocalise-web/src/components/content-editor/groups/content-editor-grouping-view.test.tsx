/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in this application's LICENSE file.
 *
 * Change Date: Four years after publication of the applicable version.
 *
 * On the Change Date, in accordance with the Business Source License 1.1,
 * use of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
// @vitest-environment happy-dom
import { cleanup, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import type { GoSvcClient } from "@/lib/go-svc/go-svc-client";
import { ContentEditorViewMenu } from "@/components/content-editor/queue/content-editor-view-menu";
import { renderWithContentEditorProviders } from "../shared/content-editor-test-utils";
import { ContentEditorGroupingView } from "./content-editor-grouping-view";
import { useContentEditorGroupingMode } from "./use-content-editor-grouping-mode";

vi.mock("@workos-inc/authkit-nextjs/components", () => ({
  useAuth: () => ({ user: { id: "user-1" } }),
}));
afterEach(() => {
  cleanup();
  localStorage.clear();
});
const STORAGE_KEY = "cat-grouping-v1:user-1:acme:p1";

function Harness({
  client,
  guard,
  initialSegmentKey,
}: {
  client: GoSvcClient;
  guard: (proceed: () => void) => void;
  initialSegmentKey?: string | null;
}) {
  const mode = useContentEditorGroupingMode({
    client,
    organizationSlug: "acme",
    projectId: "p1",
    enabled: true,
    initialSegmentKey,
    navigationGuardRef: { current: guard },
  });
  return (
    <ContentEditorGroupingView
      targetLocale="fr"
      grouping={{
        view: mode.view,
        preference: mode.preference,
        changeView: mode.changeView,
        client,
        organizationSlug: "acme",
        projectId: "p1",
        sourcePath: "*",
        canEdit: true,
        saveVariant: vi.fn(),
      }}
    >
      <ContentEditorViewMenu />
      <p>{mode.ready ? `Queue: ${mode.view}` : "Queue: waiting"}</p>
    </ContentEditorGroupingView>
  );
}

function setup(grouped: boolean, initialSegmentKey?: string | null) {
  const contentEditorBehavior = vi.fn().mockResolvedValue({
    contentEditorBehavior: {
      automaticallyGroupIdenticalStrings: grouped,
      groupingRevision: 1,
      canManage: true,
    },
  });
  const client = { project: { contentEditorBehavior } } as unknown as GoSvcClient;
  const guard = vi.fn((proceed: () => void) => proceed());
  const view = renderWithContentEditorProviders(
    <Harness client={client} guard={guard} initialSegmentKey={initialSegmentKey} />,
  );
  return { client, guard, contentEditorBehavior, view, user: userEvent.setup() };
}

async function openViewMenu(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole("button", { name: "View options" }));
}

async function selectView(user: ReturnType<typeof userEvent.setup>, name: string) {
  await openViewMenu(user);
  await user.click(await screen.findByRole("menuitemradio", { name }));
}

describe("grouped queue mode", () => {
  it("fetches the queue grouped by project default and allows a personal override", async () => {
    const { user, guard } = setup(true);
    expect(await screen.findByText("Queue: grouped")).toBeInTheDocument();
    await selectView(user, "Individual strings");
    expect(guard).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem(STORAGE_KEY)).toBe("individual");
    expect(screen.getByText("Queue: individual")).toBeInTheDocument();
    await user.click(screen.getByRole("menuitem", { name: "Use project default" }));
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
    expect(await screen.findByText("Queue: grouped")).toBeInTheDocument();
  });

  it("uses a saved preference without waiting for the project default", async () => {
    localStorage.setItem(STORAGE_KEY, "grouped");
    const { contentEditorBehavior } = setup(false);
    expect(await screen.findByText("Queue: grouped")).toBeInTheDocument();
    expect(contentEditorBehavior).not.toHaveBeenCalled();
  });

  it("shows the string grouping options in the View menu", async () => {
    localStorage.setItem(STORAGE_KEY, "individual");
    const { user } = setup(false);
    expect(await screen.findByText("Queue: individual")).toBeInTheDocument();
    await openViewMenu(user);
    expect(
      await screen.findByRole("menuitemradio", { name: "Individual strings" }),
    ).toHaveAttribute("aria-checked", "true");
  });

  it("opens a direct segment link individually without rewriting the preference", async () => {
    localStorage.setItem(STORAGE_KEY, "grouped");
    const { client, guard, view } = setup(true, "segment-1");
    expect(await screen.findByText("Queue: individual")).toBeInTheDocument();
    expect(localStorage.getItem(STORAGE_KEY)).toBe("grouped");
    view.rerender(<Harness client={client} guard={guard} initialSegmentKey={null} />);
    expect(await screen.findByText("Queue: grouped")).toBeInTheDocument();
  });
});
