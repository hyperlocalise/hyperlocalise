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

import { renderWithCatProviders } from "@/components/cat/shared/cat-test-utils";

import {
  CatComfortableResizableLayout,
  CatSideBySideResizableLayout,
} from "./cat-workspace-resizable-layout";

describe("CatComfortableResizableLayout", () => {
  it("exposes horizontal resize handles for the queue and intelligence panels", () => {
    renderWithCatProviders(
      <div style={{ width: 1280, height: 900 }}>
        <CatComfortableResizableLayout
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

describe("CatSideBySideResizableLayout", () => {
  it("exposes a horizontal resize handle for the intelligence panel", () => {
    renderWithCatProviders(
      <div style={{ width: 1280, height: 900 }}>
        <CatSideBySideResizableLayout
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
