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

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { IntlProvider } from "react-intl";
import { describe, expect, it, vi } from "vite-plus/test";

import type { UndoStep } from "@/lib/undo-stack/undo-stack";

import { useAssistantUndoSteps } from "./automation-assistant-undo-steps";

function step(origin: UndoStep<unknown, unknown>["origin"]): UndoStep<unknown, unknown> {
  return {
    id: 1,
    origin,
    before: {},
    after: {},
    description: null,
    createdAt: 0,
    updatedAt: 0,
    sealed: true,
  };
}

/** A page's undo history that records, in order, what was asked of it. */
function historyWith(pending: UndoStep<unknown, unknown> | null) {
  const calls: string[] = [];
  return {
    calls,
    history: {
      current: {
        undoStep: pending,
        seal: () => {
          calls.push("seal");
        },
        change: (next: string, meta?: { origin?: string }) => {
          calls.push(`change ${next} as ${meta?.origin}`);
        },
      },
    },
  };
}

function Harness({
  onConfirm,
  pending,
  calls,
}: {
  onConfirm: () => void;
  pending: UndoStep<unknown, unknown> | null;
  calls?: string[];
}) {
  const { history, calls: recorded } = historyWith(pending);
  const { runUndo, applyAssistantChange, undoConfirmDialog } = useAssistantUndoSteps(
    history,
    onConfirm,
  );
  return (
    <IntlProvider locale="en" messages={{}}>
      <button type="button" onClick={runUndo}>
        Undo now
      </button>
      <button
        type="button"
        onClick={() => {
          applyAssistantChange("the assistant's form");
          calls?.push(...recorded);
        }}
      >
        Apply
      </button>
      {undoConfirmDialog}
    </IntlProvider>
  );
}

describe("useAssistantUndoSteps", () => {
  it("takes a change of the assistant's as one step, sealed off from the typing around it", async () => {
    const user = userEvent.setup();
    const calls: string[] = [];
    render(<Harness onConfirm={vi.fn()} pending={null} calls={calls} />);

    await user.click(screen.getByRole("button", { name: "Apply" }));

    expect(calls).toEqual(["seal", "change the assistant's form as assistant", "seal"]);
  });

  it("does nothing when there is no step to undo", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    render(<Harness onConfirm={onConfirm} pending={null} />);

    await user.click(screen.getByRole("button", { name: "Undo now" }));

    expect(onConfirm).not.toHaveBeenCalled();
    expect(screen.queryByText("Undo the assistant's changes?")).toBeNull();
  });

  it("undoes the person's own step straight away", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    render(<Harness onConfirm={onConfirm} pending={step("user")} />);

    await user.click(screen.getByRole("button", { name: "Undo now" }));

    expect(onConfirm).toHaveBeenCalledOnce();
    expect(screen.queryByText("Undo the assistant's changes?")).toBeNull();
  });

  it("asks before taking back a turn of the assistant's", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    render(<Harness onConfirm={onConfirm} pending={step("assistant")} />);

    await user.click(screen.getByRole("button", { name: "Undo now" }));

    expect(screen.getByText("Undo the assistant's changes?")).toBeTruthy();
    expect(onConfirm).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Undo" }));

    expect(onConfirm).toHaveBeenCalledOnce();
  });
});
