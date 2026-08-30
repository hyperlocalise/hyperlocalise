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
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, fn } from "storybook/test";

import { CreateJobDialog } from "./create-job-dialog";
import {
  createJobDialogMswHandlers,
  createJobDialogNativeProjectId,
  createJobDialogOrganizationSlug,
} from "./create-job-dialog-msw-handlers";

const meta = {
  title: "App/Jobs/Create Dialog",
  component: CreateJobDialog,
  parameters: {
    layout: "centered",
    msw: {
      handlers: createJobDialogMswHandlers,
    },
  },
  args: {
    open: true,
    organizationSlug: createJobDialogOrganizationSlug,
    projectId: createJobDialogNativeProjectId,
    sourceLocale: "en-US",
    targetLocales: ["fr-FR", "de-DE", "ja-JP"],
    onOpenChange: fn(),
    onCreated: fn(),
  },
} satisfies Meta<typeof CreateJobDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("dialog", { name: "New job" })).toBeInTheDocument();
    await expect(canvas.getByLabelText("Title")).toBeInTheDocument();
    await expect(canvas.getByLabelText("Description")).toBeInTheDocument();
    await expect(canvas.queryByLabelText("Source locale")).not.toBeInTheDocument();
    await expect(canvas.getByLabelText("Task type")).toHaveTextContent("Translation");
    await expect(canvas.getByLabelText("Target locales")).toHaveTextContent("All locales");
    await expect(canvas.getByLabelText("Assignee")).toHaveTextContent("Unassigned");
    await expect(canvas.getByRole("button", { name: "Create job" })).toBeInTheDocument();

    const files = await canvas.findByRole("group", { name: "Files" });
    await expect(files).toBeInTheDocument();
    await expect(canvas.getByRole("checkbox", { name: "marketing/home.json" })).not.toBeChecked();
    await expect(
      canvas.getByRole("checkbox", { name: "marketing/pricing.json" }),
    ).not.toBeChecked();
    await expect(canvas.getByRole("button", { name: "Collapse marketing" })).toBeInTheDocument();
    await expect(
      canvas.queryByRole("checkbox", { name: "marketing/campaigns/spring.json" }),
    ).not.toBeInTheDocument();
  },
};
