// @vitest-environment happy-dom

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
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vite-plus/test";

import { useHeldRevealKey } from "./use-held-reveal-key";

function Probe() {
  const held = useHeldRevealKey();
  return <p>{held ? "revealed" : "hidden"}</p>;
}

describe("useHeldRevealKey", () => {
  it("reveals while Alt is held and hides on release or blur", () => {
    render(<Probe />);

    expect(screen.getByText("hidden")).toBeInTheDocument();
    fireEvent.keyDown(window, { key: "Alt" });
    expect(screen.getByText("revealed")).toBeInTheDocument();
    fireEvent.keyUp(window, { key: "Alt" });
    expect(screen.getByText("hidden")).toBeInTheDocument();

    fireEvent.keyDown(window, { key: "Alt" });
    expect(screen.getByText("revealed")).toBeInTheDocument();
    fireEvent.blur(window);
    expect(screen.getByText("hidden")).toBeInTheDocument();
  });

  it("does not reveal while a field has focus", () => {
    render(
      <>
        <input aria-label="Name" />
        <Probe />
      </>,
    );

    const field = screen.getByRole("textbox", { name: "Name" });
    field.focus();
    fireEvent.keyDown(field, { key: "Alt" });
    expect(screen.getByText("hidden")).toBeInTheDocument();
  });
});
