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
import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, fn, userEvent } from "storybook/test";

import { IssueListToolbar } from "./issue-list-toolbar";
import type { IssueListUrlState } from "./issue-list-url-state";

const defaultState: IssueListUrlState = {
  view: "all_open",
  search: "",
  sort: "status",
  sortDir: "asc",
};

function ToolbarStory({
  initialState = defaultState,
  onStateChange = fn(),
  onClearFilters = fn(),
}: {
  initialState?: IssueListUrlState;
  onStateChange?: (patch: Partial<IssueListUrlState>) => void;
  onClearFilters?: () => void;
}) {
  const [state, setState] = useState(initialState);
  const [searchDraft, setSearchDraft] = useState(initialState.search);

  return (
    <IssueListToolbar
      state={state}
      searchDraft={searchDraft}
      onSearchDraftChange={setSearchDraft}
      onStateChange={(patch) => {
        onStateChange(patch);
        setState((current) => ({ ...current, ...patch }));
      }}
      onClearFilters={() => {
        onClearFilters();
        setState({
          view: state.view,
          search: "",
          sort: state.sort,
          sortDir: state.sortDir,
        });
        setSearchDraft("");
      }}
      projects={[
        { id: "project_website", name: "Website localization" },
        { id: "project_mobile", name: "Mobile app" },
      ]}
    />
  );
}

const meta = {
  title: "App/Issues/Toolbar",
  component: ToolbarStory,
  parameters: {
    layout: "padded",
  },
} satisfies Meta<typeof ToolbarStory>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("button", { name: "Filter" })).toBeInTheDocument();
    await expect(canvas.getByPlaceholderText(/Search title/i)).toBeInTheDocument();
  },
};

export const FilterPopoverOpen: Story = {
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Filter" }));
    await expect(canvas.getByText("Filters")).toBeInTheDocument();
    await expect(canvas.getByText("View")).toBeInTheDocument();
    await expect(canvas.getByText("Status")).toBeInTheDocument();
  },
};

export const ActiveChips: Story = {
  args: {
    initialState: {
      ...defaultState,
      status: "open",
      priority: "P1",
      search: "checkout",
    },
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByText(/Status:/i)).toBeInTheDocument();
    await expect(canvas.getByText(/Priority:/i)).toBeInTheDocument();
    await expect(canvas.getByText(/Search:/i)).toBeInTheDocument();
    await expect(canvas.getByRole("button", { name: "Clear filters" })).toBeInTheDocument();
    await expect(canvas.getByRole("button", { name: "Filter (2)" })).toBeInTheDocument();
  },
};
