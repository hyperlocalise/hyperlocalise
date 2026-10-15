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
import { render } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { IntlProvider } from "react-intl";
import { describe, expect, it, vi } from "vitest";

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
});
