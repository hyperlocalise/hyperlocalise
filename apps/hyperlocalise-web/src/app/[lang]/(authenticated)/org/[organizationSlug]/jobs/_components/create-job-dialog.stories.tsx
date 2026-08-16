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
import { expect, fn, userEvent, within } from "storybook/test";

import { CreateJobDialog } from "./create-job-dialog";
import {
  createJobDialogCrowdinProjectId,
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

export const Native: Story = {
  play: async ({ canvas, canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    await expect(canvas.getByRole("dialog", { name: "New job" })).toBeInTheDocument();
    await expect(canvas.getByLabelText("Title")).toBeInTheDocument();
    await expect(canvas.getByLabelText("Source locale")).toHaveTextContent(/English/);
    await expect(canvas.getByLabelText("Target locales")).toHaveTextContent("All locales");
    await expect(canvas.getByLabelText("Files")).toBeInTheDocument();
    await expect(canvas.getByLabelText("Assignee")).toHaveTextContent("Unassigned");
    await expect(canvas.queryByLabelText("Task type")).not.toBeInTheDocument();
    await expect(canvas.queryByLabelText("Description")).not.toBeInTheDocument();
    await expect(canvas.getByRole("button", { name: "Create job" })).toBeInTheDocument();

    await userEvent.click(canvas.getByLabelText("Files"));
    const homeFile = await body.findByRole("option", { name: /marketing\/home\.json/ });
    await expect(homeFile).toHaveAttribute("aria-checked", "false");
    await expect(body.getByRole("option", { name: /marketing\/pricing\.json/ })).toHaveAttribute(
      "aria-checked",
      "false",
    );
    await expect(body.getByRole("listbox", { name: "Files" })).toHaveAttribute(
      "aria-multiselectable",
      "true",
    );
  },
};

export const Crowdin: Story = {
  args: {
    projectId: createJobDialogCrowdinProjectId,
  },
  play: async ({ canvas, canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    await expect(canvas.getByRole("dialog", { name: "New job" })).toBeInTheDocument();
    await expect(canvas.getByLabelText("Title")).toBeInTheDocument();
    await expect(canvas.getByLabelText("Description")).toBeInTheDocument();
    await expect(canvas.getByLabelText("Task type")).toHaveTextContent("Translation");
    await expect(canvas.getByLabelText("Target locales")).toHaveTextContent("All locales");
    await expect(canvas.getByLabelText("Assignees")).toHaveTextContent("Unassigned");
    await expect(canvas.queryByLabelText("Source locale")).not.toBeInTheDocument();

    await userEvent.click(canvas.getByLabelText("Files"));
    const homeFile = await body.findByRole("option", { name: /locales\/home\.json/ });
    await expect(homeFile).toHaveAttribute("aria-checked", "false");
    await expect(body.getByRole("option", { name: /locales\/pricing\.json/ })).toHaveAttribute(
      "aria-checked",
      "false",
    );
    await userEvent.keyboard("{Escape}");

    await userEvent.click(canvas.getByLabelText("Assignees"));
    const mina = await body.findByRole("option", { name: /Mina Chen/ });
    await expect(mina).toHaveAttribute("aria-checked", "false");
    await expect(body.getByRole("option", { name: /Otto Berg/ })).toHaveAttribute(
      "aria-checked",
      "false",
    );
    await expect(body.getByRole("listbox", { name: "Assignees" })).toHaveAttribute(
      "aria-multiselectable",
      "true",
    );
  },
};
