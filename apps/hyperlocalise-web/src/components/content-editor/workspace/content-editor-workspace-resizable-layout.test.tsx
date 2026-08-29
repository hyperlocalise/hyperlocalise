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
import { describe, expect, it } from "vite-plus/test";

import { renderWithContentEditorProviders } from "@/components/content-editor/shared/content-editor-test-utils";

import {
  ContentEditorComfortableResizableLayout,
  ContentEditorSideBySideResizableLayout,
} from "./content-editor-workspace-resizable-layout";

describe("ContentEditorComfortableResizableLayout", () => {
  it("exposes horizontal resize handles for the queue and intelligence panels", () => {
    renderWithContentEditorProviders(
      <div style={{ width: 1280, height: 900 }}>
        <ContentEditorComfortableResizableLayout
          queue={<div>Queue pane</div>}
          editor={<div>Editor pane</div>}
          intelligence={<div>Intelligence pane</div>}
        />
      </div>,
    );

    expect(screen.getByRole("separator", { name: "Resize queue panel" })).toBeInTheDocument();
    expect(
      screen.getByRole("separator", { name: "Resize translation intelligence panel" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Queue pane")).toBeInTheDocument();
    expect(screen.getByText("Editor pane")).toBeInTheDocument();
    expect(screen.getByText("Intelligence pane")).toBeInTheDocument();
  });
});

describe("ContentEditorSideBySideResizableLayout", () => {
  it("exposes a horizontal resize handle for the intelligence panel", () => {
    renderWithContentEditorProviders(
      <div style={{ width: 1280, height: 900 }}>
        <ContentEditorSideBySideResizableLayout
          editor={<div>Source and translation</div>}
          intelligence={<div>Intelligence pane</div>}
        />
      </div>,
    );

    expect(
      screen.getByRole("separator", { name: "Resize translation intelligence panel" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Source and translation")).toBeInTheDocument();
  });
});
