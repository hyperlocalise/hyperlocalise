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
import { expect, fn, userEvent, within } from "storybook/test";

import { IssueListToolbar } from "./issue-list-toolbar";
import type { IssueListUrlState } from "./issue-list-url-state";

const defaultState: IssueListUrlState = {
  view: "all_open",
  search: "",
  sort: "status",
  sortDir: "asc",
};

const projectLocales = ["fr-FR", "de-DE", "es-ES"];

function ToolbarStory({
  initialState = defaultState,
  locales = projectLocales,
  onStateChange = fn(),
  onClearFilters = fn(),
}: {
  initialState?: IssueListUrlState;
  locales?: string[];
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
      locales={locales}
    />
  );
}

const meta = {
  title: "App/Issues/Toolbar",
  component: ToolbarStory,
  parameters: {
    layout: "padded",
  },
  args: {
    onStateChange: fn(),
    onClearFilters: fn(),
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
  play: async ({ canvas, canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(canvas.getByRole("button", { name: "Filter" }));
    await expect(body.getByText("Filters")).toBeInTheDocument();
    await expect(body.getByText("View")).toBeInTheDocument();
    await expect(body.getByText("Status")).toBeInTheDocument();
    await expect(body.getByText("Locale")).toBeInTheDocument();
    await expect(body.getByRole("combobox", { name: "Select locale" })).toHaveTextContent(
      "Any locale",
    );
  },
};

export const LocaleFilter: Story = {
  play: async ({ canvas, canvasElement, args }) => {
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(canvas.getByRole("button", { name: "Filter" }));

    const localeTrigger = body.getByRole("combobox", { name: "Select locale" });
    await userEvent.click(localeTrigger);
    await userEvent.click(await body.findByRole("option", { name: /French \(France\)/i }));

    await expect(args.onStateChange).toHaveBeenCalledWith({ locale: "fr-FR" });
    await expect(canvas.getByText("Locale: fr-FR")).toBeInTheDocument();
    await expect(canvas.getByRole("button", { name: "Filter (1)" })).toBeInTheDocument();
    await expect(localeTrigger).toHaveTextContent("French (France)");
  },
};

export const ActiveChips: Story = {
  args: {
    initialState: {
      ...defaultState,
      status: "open",
      priority: "P1",
      locale: "de-DE",
      search: "checkout",
    },
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByText(/Status:/i)).toBeInTheDocument();
    await expect(canvas.getByText(/Priority:/i)).toBeInTheDocument();
    await expect(canvas.getByText("Locale: de-DE")).toBeInTheDocument();
    await expect(canvas.getByText(/Search:/i)).toBeInTheDocument();
    await expect(canvas.getByRole("button", { name: "Clear filters" })).toBeInTheDocument();
    await expect(canvas.getByRole("button", { name: "Filter (3)" })).toBeInTheDocument();
  },
};

export const LocaleFilterSelected: Story = {
  args: {
    initialState: {
      ...defaultState,
      locale: "es-ES",
    },
  },
  play: async ({ canvas, canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    await expect(canvas.getByText("Locale: es-ES")).toBeInTheDocument();
    await userEvent.click(canvas.getByRole("button", { name: "Filter (1)" }));
    await expect(body.getByRole("combobox", { name: "Select locale" })).toHaveTextContent(
      "Spanish (Spain)",
    );
  },
};
