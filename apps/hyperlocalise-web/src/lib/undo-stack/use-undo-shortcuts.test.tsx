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
import { useRef } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vite-plus/test";

import { isUndoShortcutTarget, useUndoShortcuts } from "./use-undo-shortcuts";

function Page({
  enabled = true,
  onUndo,
  onRedo,
  onSeal,
}: {
  enabled?: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onSeal?: () => void;
}) {
  const rootRef = useRef<HTMLElement>(null);
  useUndoShortcuts({ rootRef, enabled, onUndo, onRedo, onSeal });
  return (
    <>
      <main ref={rootRef}>
        <input aria-label="Inside" />
      </main>
      <div>
        <input aria-label="Outside" />
      </div>
    </>
  );
}

function renderPage(props: Partial<Parameters<typeof Page>[0]> = {}) {
  const onUndo = vi.fn();
  const onRedo = vi.fn();
  const onSeal = vi.fn();
  render(<Page onUndo={onUndo} onRedo={onRedo} onSeal={onSeal} {...props} />);
  return { onUndo, onRedo, onSeal };
}

describe("isUndoShortcutTarget", () => {
  it("accepts the body and anything inside the root, and nothing else", () => {
    const root = document.createElement("main");
    const inside = document.createElement("input");
    root.append(inside);
    const outside = document.createElement("input");
    document.body.append(root, outside);

    expect(isUndoShortcutTarget(document.body, root)).toBe(true);
    expect(isUndoShortcutTarget(inside, root)).toBe(true);
    expect(isUndoShortcutTarget(outside, root)).toBe(false);
    expect(isUndoShortcutTarget(inside, null)).toBe(false);
    expect(isUndoShortcutTarget(null, root)).toBe(false);

    root.remove();
    outside.remove();
  });
});

describe("useUndoShortcuts", () => {
  it("undoes from a field inside the root and from the page itself", async () => {
    const user = userEvent.setup();
    const { onUndo } = renderPage();

    await user.click(screen.getByRole("textbox", { name: "Inside" }));
    await user.keyboard("{Control>}z{/Control}");
    expect(onUndo).toHaveBeenCalledTimes(1);

    (document.activeElement as HTMLElement | null)?.blur();
    await user.keyboard("{Control>}z{/Control}");
    expect(onUndo).toHaveBeenCalledTimes(2);
  });

  it("leaves a field outside the root to the browser", async () => {
    const user = userEvent.setup();
    const { onUndo, onRedo } = renderPage();

    await user.click(screen.getByRole("textbox", { name: "Outside" }));
    await user.keyboard("{Control>}z{/Control}");
    await user.keyboard("{Control>}{Shift>}z{/Shift}{/Control}");

    expect(onUndo).not.toHaveBeenCalled();
    expect(onRedo).not.toHaveBeenCalled();
  });

  it("redoes with Ctrl+Shift+Z and with Ctrl+Y", async () => {
    const user = userEvent.setup();
    const { onUndo, onRedo } = renderPage();

    await user.click(screen.getByRole("textbox", { name: "Inside" }));
    await user.keyboard("{Control>}{Shift>}z{/Shift}{/Control}");
    await user.keyboard("{Control>}y{/Control}");

    expect(onRedo).toHaveBeenCalledTimes(2);
    expect(onUndo).not.toHaveBeenCalled();
  });

  it("does nothing while disabled", async () => {
    const user = userEvent.setup();
    const { onUndo } = renderPage({ enabled: false });

    await user.click(screen.getByRole("textbox", { name: "Inside" }));
    await user.keyboard("{Control>}z{/Control}");

    expect(onUndo).not.toHaveBeenCalled();
  });

  it("takes over the browser's own undo and redo inside the root", () => {
    const { onUndo, onRedo } = renderPage();
    const inside = screen.getByRole("textbox", { name: "Inside" });

    const undoEvent = new InputEvent("beforeinput", {
      inputType: "historyUndo",
      bubbles: true,
      cancelable: true,
    });
    inside.dispatchEvent(undoEvent);
    expect(onUndo).toHaveBeenCalledTimes(1);
    expect(undoEvent.defaultPrevented).toBe(true);

    inside.dispatchEvent(
      new InputEvent("beforeinput", { inputType: "historyRedo", bubbles: true, cancelable: true }),
    );
    expect(onRedo).toHaveBeenCalledTimes(1);

    inside.dispatchEvent(
      new InputEvent("beforeinput", { inputType: "insertText", bubbles: true, cancelable: true }),
    );
    expect(onUndo).toHaveBeenCalledTimes(1);
  });

  it("seals the current step when focus leaves a field in the root", () => {
    const { onSeal } = renderPage();

    fireEvent.focusOut(screen.getByRole("textbox", { name: "Inside" }));
    expect(onSeal).toHaveBeenCalledTimes(1);

    fireEvent.focusOut(screen.getByRole("textbox", { name: "Outside" }));
    expect(onSeal).toHaveBeenCalledTimes(1);
  });
});
