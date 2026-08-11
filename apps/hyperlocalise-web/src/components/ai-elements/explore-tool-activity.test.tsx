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
import { IntlProvider } from "react-intl";
import { describe, expect, it, vi } from "vite-plus/test";

import { ExploreToolActivity } from "./explore-tool-activity";
import type { ToolPart } from "./tool-activity";

vi.mock("dot-anime-react", () => ({
  ScrambleText: ({ text }: { text: string }) => <span>{text}</span>,
}));

function toolPart(
  name: string,
  input: Record<string, unknown>,
  state: ToolPart["state"] = "output-available",
): ToolPart {
  return {
    type: `tool-${name}`,
    toolCallId: `${name}-${state}-${JSON.stringify(input)}`,
    state,
    input,
  } as ToolPart;
}

function renderActivity(parts: ToolPart[]) {
  return render(
    <IntlProvider locale="en">
      <ExploreToolActivity
        parts={parts}
        renderToolPart={(part) => <div key={part.toolCallId}>detail:{part.toolCallId}</div>}
      />
    </IntlProvider>,
  );
}

describe("ExploreToolActivity", () => {
  it("shows a friendly live status for the latest in-flight explore tool", () => {
    renderActivity([
      toolPart("grep", { pattern: "Save" }, "output-available"),
      toolPart("read", { path: "apps/web/src/account-form.tsx" }, "input-available"),
    ]);

    expect(screen.getByRole("status")).toHaveTextContent("Reading account-form.tsx");
    expect(screen.queryByText(/Explored/)).not.toBeInTheDocument();
  });

  it("shows a collapsed explore rollup when the group finishes", () => {
    renderActivity([
      toolPart("grep", { pattern: "Save" }),
      toolPart("read", { path: "apps/web/src/account-form.tsx" }),
      toolPart("grep", { pattern: "Cancel" }),
    ]);

    expect(screen.getByText("Explored account-form.tsx, 2 searches")).toBeInTheDocument();
    expect(screen.queryByText(/^detail:/)).not.toBeInTheDocument();
  });

  it("opens a failure rollup when any explore tool errors", () => {
    renderActivity([
      toolPart("grep", { pattern: "Save" }),
      toolPart("read", { path: "apps/web/src/account-form.tsx" }, "output-error"),
    ]);

    expect(screen.getByText("Couldn't explore account-form.tsx")).toBeInTheDocument();
    expect(screen.getByText(/detail:read-output-error/)).toBeInTheDocument();
  });

  it("keeps the failure rollup visible while a sibling explore tool is still pending", () => {
    renderActivity([
      toolPart("grep", { pattern: "Save" }, "output-error"),
      toolPart("read", { path: "apps/web/src/account-form.tsx" }, "input-available"),
    ]);

    expect(screen.getByText("Couldn't explore account-form.tsx")).toBeInTheDocument();
    expect(screen.queryByText("Reading account-form.tsx")).not.toBeInTheDocument();
    expect(screen.getByText(/detail:grep-output-error/)).toBeInTheDocument();
  });

  it("opens a previously mounted rollup when a tool later fails", () => {
    const successParts = [
      toolPart("grep", { pattern: "Save" }),
      toolPart("read", { path: "apps/web/src/account-form.tsx" }),
    ];
    const { rerender } = renderActivity(successParts);

    expect(screen.getByText("Explored account-form.tsx, 1 search")).toBeInTheDocument();
    expect(screen.queryByText(/^detail:/)).not.toBeInTheDocument();

    rerender(
      <IntlProvider locale="en">
        <ExploreToolActivity
          parts={[
            toolPart("grep", { pattern: "Save" }),
            toolPart("read", { path: "apps/web/src/account-form.tsx" }, "output-error"),
          ]}
          renderToolPart={(part) => <div key={part.toolCallId}>detail:{part.toolCallId}</div>}
        />
      </IntlProvider>,
    );

    expect(screen.getByText("Couldn't explore account-form.tsx")).toBeInTheDocument();
    expect(screen.getByText(/detail:read-output-error/)).toBeInTheDocument();
  });
});
