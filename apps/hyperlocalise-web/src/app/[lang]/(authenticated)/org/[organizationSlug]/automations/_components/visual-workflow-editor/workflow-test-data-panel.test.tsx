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
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { IntlProvider } from "react-intl";
import { describe, expect, it, vi } from "vitest";

import type { VisualWorkflowTestFailure } from "@/lib/visual-workflows/editor/visual-workflow-test-data";
import type { VisualWorkflowRfNode } from "@/lib/visual-workflows/schema/types";

import { WorkflowTestDataPanel } from "./workflow-test-data-panel";

const httpStep: VisualWorkflowRfNode = {
  id: "http",
  type: "action.http",
  position: { x: 0, y: 0 },
  data: {
    catalogType: "action.http",
    config: {
      kind: "action.http",
      method: "GET",
      url: "https://example.com",
      headers: [],
      queryParams: [],
      onError: "stop",
    } as VisualWorkflowRfNode["data"]["config"],
    runStatus: "idle",
  },
};

function renderPanel(onChange: (value: Record<string, unknown>) => void) {
  function Panel() {
    const [value, setValue] = useState<Record<string, unknown>>({});
    return (
      <WorkflowTestDataPanel
        node={httpStep}
        value={value}
        missing={[]}
        projects={[]}
        onChange={(next) => {
          setValue(next);
          onChange(next);
        }}
      />
    );
  }
  const view = render(
    <IntlProvider locale="en" messages={{}}>
      <Panel />
    </IntlProvider>,
  );
  const jsonBox = view.container.querySelector<HTMLInputElement>("#vw-test-json");
  expect(jsonBox).not.toBeNull();
  return jsonBox!;
}

describe("WorkflowTestDataPanel", () => {
  it("keeps JSON typed into a box of no fixed type as a list or an object", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const jsonBox = renderPanel(onChange);

    await user.type(jsonBox, '{{"items":[[1]}');
    await user.tab();

    expect(onChange).toHaveBeenLastCalledWith({ json: { items: [1] } });
  });

  it("keeps other text typed into a box of no fixed type as text", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const jsonBox = renderPanel(onChange);

    await user.type(jsonBox, "[[draft");
    await user.tab();

    expect(onChange).toHaveBeenLastCalledWith({ json: "[draft" });
  });

  it("hides the test data of a step set to run for real and says what that does", async () => {
    const user = userEvent.setup();
    const onRunsForRealChange = vi.fn();
    function Panel() {
      const [real, setReal] = useState(false);
      return (
        <WorkflowTestDataPanel
          node={httpStep}
          value={{}}
          missing={[]}
          projects={[]}
          onChange={() => {}}
          runsForReal={real}
          onRunsForRealChange={(next) => {
            setReal(next);
            onRunsForRealChange(next);
          }}
          onFailureChange={() => {}}
        />
      );
    }
    render(
      <IntlProvider locale="en" messages={{}}>
        <Panel />
      </IntlProvider>,
    );

    await user.click(screen.getByRole("combobox", { name: "In a test run" }));
    await user.click(await screen.findByRole("option", { name: "Run for real" }));

    expect(onRunsForRealChange).toHaveBeenLastCalledWith(true);
    expect(screen.getByText(/Test runs call out for real for this step/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Fill with examples" })).not.toBeInTheDocument();
    expect(screen.queryByRole("combobox", { name: "Outcome" })).not.toBeInTheDocument();
  });

  it("sets a step to fail with an error, and says what its On error setting then does", async () => {
    const user = userEvent.setup();
    const onFailureChange = vi.fn();
    function Panel() {
      const [failure, setFailure] = useState<VisualWorkflowTestFailure | undefined>();
      return (
        <WorkflowTestDataPanel
          node={httpStep}
          value={{}}
          missing={[]}
          projects={[]}
          onChange={() => {}}
          failure={failure}
          onFailureChange={(next) => {
            setFailure(next);
            onFailureChange(next);
          }}
        />
      );
    }
    render(
      <IntlProvider locale="en" messages={{}}>
        <Panel />
      </IntlProvider>,
    );
    // Without a server to call out, a step cannot run for real, so that choice is not offered.
    expect(screen.queryByRole("combobox", { name: "In a test run" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("combobox", { name: "Outcome" }));
    await user.click(await screen.findByRole("option", { name: "Fails" }));
    expect(onFailureChange).toHaveBeenLastCalledWith({});
    expect(
      screen.getByText("On error is set to Stop, so the test run stops at this step."),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Fill with examples" })).not.toBeInTheDocument();

    await user.type(screen.getByLabelText("Error message"), "Down");
    expect(onFailureChange).toHaveBeenLastCalledWith({ message: "Down" });

    await user.click(screen.getByRole("combobox", { name: "Outcome" }));
    await user.click(await screen.findByRole("option", { name: "Succeeds" }));
    expect(onFailureChange).toHaveBeenLastCalledWith(undefined);
    expect(screen.getByRole("button", { name: "Fill with examples" })).toBeInTheDocument();
  });
});
