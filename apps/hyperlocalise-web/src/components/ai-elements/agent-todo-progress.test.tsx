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
import { describe, expect, it } from "vite-plus/test";

import { AgentTodoProgress, getAgentTodoItems } from "./agent-todo-progress";

const items = [
  {
    id: "find-story",
    content: "Find the target component and an existing Storybook story",
    status: "completed" as const,
  },
  {
    id: "prepare-preview",
    content: "No story found — create a temporary Storybook story with mock data",
    status: "in-progress" as const,
  },
  {
    id: "capture",
    content: "Capture and verify the screenshot",
    status: "todo" as const,
  },
];

describe("AgentTodoProgress", () => {
  it("renders the workflow checklist as a live status", () => {
    render(
      <IntlProvider locale="en">
        <AgentTodoProgress items={items} />
      </IntlProvider>,
    );

    expect(screen.getByRole("status")).toHaveAttribute("aria-live", "polite");
    expect(screen.getByText("Progress")).toBeInTheDocument();
    expect(screen.getByText(items[1].content)).toBeInTheDocument();
    expect(screen.getAllByRole("listitem")).toHaveLength(3);
  });
});

describe("getAgentTodoItems", () => {
  it("accepts valid todo tool input and output", () => {
    expect(getAgentTodoItems({ todos: items })).toEqual(items);
  });

  it("rejects malformed todo output", () => {
    expect(getAgentTodoItems({ todos: [] })).toBeNull();
    expect(getAgentTodoItems({ todos: [{ id: "broken", status: "running" }] })).toBeNull();
    expect(getAgentTodoItems({ message: "no todos" })).toBeNull();
  });
});
