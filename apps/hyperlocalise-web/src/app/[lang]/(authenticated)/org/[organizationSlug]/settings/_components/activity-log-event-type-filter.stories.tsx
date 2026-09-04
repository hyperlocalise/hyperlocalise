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
import { expect, userEvent, within } from "storybook/test";

import {
  V1_ACTIVITY_EVENT_TYPES,
  type V1ActivityEventType,
} from "@/lib/activity-log/activity-log-contract";

import { ActivityLogEventTypeFilter } from "./activity-log-event-type-filter";

function EventTypeFilterStory({ initialValue = [] }: { initialValue?: V1ActivityEventType[] }) {
  const [value, setValue] = useState(initialValue);

  return (
    <div className="w-full max-w-xl rounded-lg border border-border bg-background p-6">
      <ActivityLogEventTypeFilter value={value} onChange={setValue} />
    </div>
  );
}

const meta = {
  title: "App/Settings/Activity Log Event Type Filter",
  component: EventTypeFilterStory,
  parameters: {
    layout: "centered",
  },
} satisfies Meta<typeof EventTypeFilterStory>;

export default meta;
type Story = StoryObj<typeof meta>;

export const AllEventTypes: Story = {
  play: async ({ canvas, canvasElement }) => {
    await expect(canvas.getByRole("button", { name: "Event types" })).toHaveTextContent(
      "All event types",
    );
    await userEvent.click(canvas.getByRole("button", { name: "Event types" }));
    const body = within(canvasElement.ownerDocument.body);
    await expect(body.getByText("Filter by event type")).toBeInTheDocument();
    await expect(body.getByText("Membership")).toBeInTheDocument();
    await expect(body.getByText("Translation memory")).toBeInTheDocument();
  },
};

export const SelectedEventTypes: Story = {
  args: {
    initialValue: ["member_invited", "project_settings_changed", "translation_memory_exported"],
  },
  play: async ({ canvas, canvasElement }) => {
    await expect(canvas.getByText("3 event types")).toBeInTheDocument();
    await expect(canvas.getByRole("button", { name: "Remove Member Invited" })).toBeInTheDocument();
    await userEvent.click(canvas.getByRole("button", { name: "Event types" }));
    const body = within(canvasElement.ownerDocument.body);
    await expect(
      body.getByRole("checkbox", { name: "Project settings changed" }),
    ).toBeInTheDocument();
    await expect(body.getByText("Project settings changed")).toBeInTheDocument();
  },
};

export const SearchAndSelect: Story = {
  play: async ({ canvas, canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(canvas.getByRole("button", { name: "Event types" }));
    await userEvent.type(body.getByPlaceholderText("Search event types…"), "workspace");
    await expect(body.getByText("Workspace updated")).toBeInTheDocument();
    await userEvent.click(body.getByText("Workspace updated"));
    await expect(canvas.getByText("1 event type")).toBeInTheDocument();
  },
};

export const EveryEventTypeSelected: Story = {
  args: {
    initialValue: [...V1_ACTIVITY_EVENT_TYPES],
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("26 event types")).toBeInTheDocument();
    await expect(canvas.getByRole("button", { name: "Remove Member Invited" })).toBeInTheDocument();
    await expect(canvas.getByText("+23 more")).toBeInTheDocument();
  },
};
