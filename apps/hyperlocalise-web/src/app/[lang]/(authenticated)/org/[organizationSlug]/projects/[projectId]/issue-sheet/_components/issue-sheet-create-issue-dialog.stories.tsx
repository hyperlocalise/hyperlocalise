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

import { IssueSheetCreateIssueDialog } from "./issue-sheet-create-issue-dialog";
import { issueSheetMswHandlers } from "./issue-sheet-msw-handlers";
import {
  issueSheetOrganizationSlug,
  issueSheetProjectFixture,
  issueSheetProjectId,
} from "./issue-sheet.fixture";

const projects = [
  {
    id: issueSheetProjectFixture.id,
    name: issueSheetProjectFixture.name,
    targetLocales: issueSheetProjectFixture.targetLocales,
  },
  {
    id: "project_mobile",
    name: "Mobile app",
    targetLocales: ["ja-JP", "de-DE"],
  },
];

const meta = {
  title: "App/Issues/Create Dialog",
  component: IssueSheetCreateIssueDialog,
  parameters: {
    layout: "centered",
    msw: {
      handlers: issueSheetMswHandlers,
    },
  },
  args: {
    open: true,
    organizationSlug: issueSheetOrganizationSlug,
    projectId: issueSheetProjectId,
    projects,
    onOpenChange: fn(),
    onCreated: fn(async () => {}),
  },
} satisfies Meta<typeof IssueSheetCreateIssueDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

export const ProjectScoped: Story = {
  play: async ({ canvas, canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    await expect(canvas.getByRole("dialog", { name: "New issue" })).toBeInTheDocument();
    await expect(canvas.getByLabelText("Title")).toBeInTheDocument();
    await expect(canvas.getByLabelText("Description")).toBeInTheDocument();
    await expect(canvas.getByLabelText("Status")).toBeInTheDocument();
    await expect(canvas.getByLabelText("Priority")).toBeInTheDocument();
    await expect(canvas.queryByLabelText("Project")).not.toBeInTheDocument();
    await expect(canvas.getByRole("button", { name: "More properties" })).toBeInTheDocument();
    await expect(canvas.getByRole("button", { name: "Create issue" })).toBeInTheDocument();
    await expect(body.getByLabelText("Create more")).toBeInTheDocument();
  },
};

export const OrganizationScoped: Story = {
  args: {
    projectId: undefined,
  },
  play: async ({ canvas, canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    await expect(canvas.getByRole("dialog", { name: "New issue" })).toBeInTheDocument();
    await expect(canvas.getByLabelText("Project")).toBeInTheDocument();
    await expect(canvas.getByText("Select a project")).toBeInTheDocument();

    await userEvent.click(canvas.getByRole("button", { name: "More properties" }));
    await userEvent.hover(body.getByRole("menuitem", { name: "Set locale" }));
    await userEvent.click(await body.findByLabelText("Locale"));
    await expect(
      await body.findByRole("option", { name: /French \(France\)/i }),
    ).toBeInTheDocument();
    await expect(body.getByRole("option", { name: /German \(Germany\)/i })).toBeInTheDocument();
    await expect(body.getByRole("option", { name: /Spanish \(Spain\)/i })).toBeInTheDocument();
    await expect(body.getByRole("option", { name: /Japanese \(Japan\)/i })).toBeInTheDocument();
  },
};

export const WithStringLink: Story = {
  args: {
    stringLink: {
      translationKeyId: "key_1",
      segmentId: "segment_1",
      sourcePath: "marketing/home.json",
      targetLocale: "de-DE",
      defaultTitle: "Needs context for CTA",
      defaultDescription: "Ambiguous source string",
      linkUrl: "https://app.test/cat",
      linkLabel: "Open in Content Editor",
    },
    // Every real caller that passes a segment-linked stringLink (CAT) also passes this, so it
    // belongs in the story too — otherwise this demos a state production never reaches.
    initialTemplateKey: "tpl_context_request",
  },
  play: async ({ canvas, canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    await expect(canvas.getByLabelText("Title")).toHaveValue("Needs context for CTA");
    await userEvent.click(canvas.getByRole("button", { name: "More properties" }));
    await expect(body.getByRole("menuitem", { name: "Set locale" })).toBeInTheDocument();
    await userEvent.hover(body.getByRole("menuitem", { name: "Set locale" }));
    await expect(await body.findByLabelText("Locale")).toHaveTextContent("German (Germany)");
    await userEvent.hover(body.getByRole("menuitem", { name: "Set source path" }));
    await expect(await body.findByLabelText("Source path")).toHaveValue("marketing/home.json");
    await userEvent.hover(body.getByRole("menuitem", { name: "Add link…" }));
    await expect(await body.findByLabelText("Link label")).toHaveValue("Open in Content Editor");
  },
};

export const CreateMoreEnabled: Story = {
  args: {
    defaultCreateMore: true,
  },
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    await expect(body.getByLabelText("Create more")).toBeChecked();
  },
};

export const WithCustomColumns: Story = {
  play: async ({ canvas, canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    await expect(canvas.getByLabelText("Priority")).toBeInTheDocument();
    await userEvent.click(canvas.getByRole("button", { name: "More properties" }));
    await expect(body.getByRole("menuitem", { name: "Set type" })).toBeInTheDocument();
    await expect(body.getByRole("menuitem", { name: "Set Sprint" })).toBeInTheDocument();
    await expect(body.getByRole("menuitem", { name: "Set Component" })).toBeInTheDocument();
    await expect(body.getByRole("menuitem", { name: "Set Reviewer" })).toBeInTheDocument();
    await expect(body.queryByRole("menuitem", { name: /Owner note/i })).not.toBeInTheDocument();
  },
};
