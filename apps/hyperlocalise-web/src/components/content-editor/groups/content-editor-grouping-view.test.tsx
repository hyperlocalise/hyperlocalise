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
import { cleanup, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { useEffect, useState } from "react";
import type { GoSvcClient } from "@/lib/go-svc/go-svc-client";
import { renderWithContentEditorProviders } from "../shared/content-editor-test-utils";
import { ContentEditorGroupingView } from "./content-editor-grouping-view";

vi.mock("@workos-inc/authkit-nextjs/components", () => ({
  useAuth: () => ({ user: { id: "user-1" } }),
}));
vi.mock("./content-editor-group-browser", () => ({
  ContentEditorGroupBrowser: () => <p>Grouped browser</p>,
  GroupLoading: () => <p>Loading</p>,
}));
afterEach(() => {
  cleanup();
  localStorage.clear();
});
const STORAGE_KEY = "cat-grouping-v1:user-1:acme:p1";

function Editor({ effect }: { effect: () => () => void }) {
  const [text, setText] = useState("");
  useEffect(effect, [effect]);
  return (
    <input
      aria-label="Translation"
      value={text}
      onChange={(event) => setText(event.target.value)}
    />
  );
}

function setup(grouped: boolean, initialSegmentKey?: string) {
  const contentEditorBehavior = vi.fn().mockResolvedValue({
    contentEditorBehavior: {
      automaticallyGroupIdenticalStrings: grouped,
      groupingRevision: 1,
      canManage: true,
    },
  });
  const client = { project: { contentEditorBehavior } } as unknown as GoSvcClient;
  const guard = vi.fn((proceed: () => void) => proceed());
  const stopped = vi.fn();
  const effect = vi.fn(() => stopped);
  renderWithContentEditorProviders(
    <ContentEditorGroupingView
      enabled
      client={client}
      organizationSlug="acme"
      projectId="p1"
      sourcePath="*"
      targetLocale="fr"
      navigationGuardRef={{ current: guard }}
      initialSegmentKey={initialSegmentKey}
    >
      <Editor effect={effect} />
    </ContentEditorGroupingView>,
  );
  return { guard, stopped, user: userEvent.setup() };
}

async function selectView(user: ReturnType<typeof userEvent.setup>, name: string) {
  await user.click(await screen.findByRole("combobox", { name: "String view" }));
  await user.click(screen.getByRole("option", { name }));
}

describe("personal string view", () => {
  it("uses the project default and allows a personal override", async () => {
    const { user, guard } = setup(true);
    await screen.findByText("Grouped browser");
    await selectView(user, "Individual strings");
    expect(guard).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem(STORAGE_KEY)).toBe("individual");
    expect(screen.queryByText("Grouped browser")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Use project default" }));
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
    expect(await screen.findByText("Grouped browser")).toBeInTheDocument();
  });

  it("keeps editor state but suspends its effects while groups are shown", async () => {
    localStorage.setItem(STORAGE_KEY, "individual");
    const { user, stopped } = setup(true);
    await user.type(await screen.findByRole("textbox", { name: "Translation" }), "Bonjour");
    await selectView(user, "Group identical strings");
    await waitFor(() => expect(stopped).toHaveBeenCalled());
    expect(screen.queryByRole("textbox", { name: "Translation" })).not.toBeInTheDocument();
    await selectView(user, "Individual strings");
    expect(await screen.findByRole("textbox", { name: "Translation" })).toHaveValue("Bonjour");
  });

  it("opens a direct segment link in the individual editor without rewriting preference", async () => {
    localStorage.setItem(STORAGE_KEY, "grouped");
    setup(true, "segment-1");
    expect(await screen.findByRole("textbox", { name: "Translation" })).toBeInTheDocument();
    expect(screen.queryByText("Grouped browser")).not.toBeInTheDocument();
    expect(localStorage.getItem(STORAGE_KEY)).toBe("grouped");
  });

  it("returns to the saved grouped view when the segment link is cleared", async () => {
    localStorage.setItem(STORAGE_KEY, "grouped");
    const contentEditorBehavior = vi.fn().mockResolvedValue({
      contentEditorBehavior: {
        automaticallyGroupIdenticalStrings: true,
        groupingRevision: 1,
        canManage: true,
      },
    });
    const client = { project: { contentEditorBehavior } } as unknown as GoSvcClient;
    const guard = vi.fn((proceed: () => void) => proceed());
    const { rerender } = renderWithContentEditorProviders(
      <ContentEditorGroupingView
        enabled
        client={client}
        organizationSlug="acme"
        projectId="p1"
        sourcePath="*"
        targetLocale="fr"
        navigationGuardRef={{ current: guard }}
        initialSegmentKey="segment-1"
      >
        <p>Individual editor</p>
      </ContentEditorGroupingView>,
    );
    expect(await screen.findByText("Individual editor")).toBeInTheDocument();
    rerender(
      <ContentEditorGroupingView
        enabled
        client={client}
        organizationSlug="acme"
        projectId="p1"
        sourcePath="menu.json"
        targetLocale="fr"
        navigationGuardRef={{ current: guard }}
        initialSegmentKey={null}
      >
        <p>Individual editor</p>
      </ContentEditorGroupingView>,
    );
    expect(await screen.findByText("Grouped browser")).toBeInTheDocument();
  });
});
