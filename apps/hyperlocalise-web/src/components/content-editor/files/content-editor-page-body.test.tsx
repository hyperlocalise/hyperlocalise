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

import { screen } from "@testing-library/react";
import { useEffect, useRef, useState } from "react";
import { beforeEach, describe, expect, it } from "vite-plus/test";

import { renderWithContentEditorProviders } from "@/components/content-editor/shared/content-editor-test-utils";

import { ContentEditorPageBody } from "./content-editor-files-sidebar";

function stubViewportWidth(width: number) {
  Object.defineProperty(window, "innerWidth", { configurable: true, value: width, writable: true });
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    writable: true,
    value: (query: string) => {
      const minWidth = Number(/min-width:\s*(\d+)px/.exec(query)?.[1] ?? 0);
      return {
        matches: width >= minWidth,
        media: query,
        addEventListener: () => {},
        removeEventListener: () => {},
      } as unknown as MediaQueryList;
    },
  });
}

/** Counts how many times the workspace subtree has been mounted. */
function MountCounter() {
  const mounts = useRef(0);
  const [, forceRender] = useState(0);

  useEffect(() => {
    mounts.current += 1;
    forceRender((value) => value + 1);
  }, []);

  return <div data-testid="workspace-mounts">{mounts.current}</div>;
}

describe("ContentEditorPageBody", () => {
  beforeEach(() => {
    stubViewportWidth(1280);
  });

  it("exposes a resize handle for the files sidebar on wide viewports", () => {
    renderWithContentEditorProviders(
      <div style={{ width: 1280, height: 900 }}>
        <ContentEditorPageBody sidebar={<aside>File tree</aside>} sidebarCollapsed={false}>
          <div>Workspace</div>
        </ContentEditorPageBody>
      </div>,
    );

    expect(screen.getByRole("separator", { name: "Resize files panel" })).toBeInTheDocument();
    expect(screen.getByText("File tree")).toBeInTheDocument();
    expect(screen.getByText("Workspace")).toBeInTheDocument();
  });

  it("collapses the files sidebar without unmounting the workspace", () => {
    const { rerender } = renderWithContentEditorProviders(
      <div style={{ width: 1280, height: 900 }}>
        <ContentEditorPageBody sidebar={<aside>File tree</aside>} sidebarCollapsed={false}>
          <MountCounter />
        </ContentEditorPageBody>
      </div>,
    );

    expect(screen.getByTestId("workspace-mounts")).toHaveTextContent("1");
    expect(Number(screen.getByTestId("files").style.flexGrow)).toBeGreaterThan(0);

    rerender(
      <div style={{ width: 1280, height: 900 }}>
        <ContentEditorPageBody sidebar={<aside>File tree</aside>} sidebarCollapsed>
          <MountCounter />
        </ContentEditorPageBody>
      </div>,
    );

    expect(Number(screen.getByTestId("files").style.flexGrow)).toBe(0);
    expect(screen.getByTestId("workspace-mounts")).toHaveTextContent("1");
  });

  it("pins the files sidebar shut on narrow viewports without losing the preference", () => {
    stubViewportWidth(820);

    renderWithContentEditorProviders(
      <div style={{ width: 820, height: 900 }}>
        <ContentEditorPageBody sidebar={<aside>File tree</aside>} sidebarCollapsed={false}>
          <div>Workspace</div>
        </ContentEditorPageBody>
      </div>,
    );

    // Content stays mounted so tree state survives, but is removed from the
    // tab order and the handle is hidden until the viewport can show the pane.
    expect(screen.getByText("File tree").closest("[inert]")).not.toBeNull();
    expect(screen.getByRole("separator", { name: "Resize files panel" })).toHaveClass("hidden");
    expect(screen.getByText("Workspace")).toBeInTheDocument();
  });

  it("renders no files panel when the page has no sidebar", () => {
    renderWithContentEditorProviders(
      <div style={{ width: 1280, height: 900 }}>
        <ContentEditorPageBody>
          <div>Workspace</div>
        </ContentEditorPageBody>
      </div>,
    );

    expect(screen.queryByRole("separator", { name: "Resize files panel" })).not.toBeInTheDocument();
    expect(screen.getByText("Workspace")).toBeInTheDocument();
  });
});
