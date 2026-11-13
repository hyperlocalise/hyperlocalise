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
import { expect, userEvent, waitFor, within } from "storybook/test";

import { qaOrganizationSlug } from "@/components/qa/qa.fixture";
import {
  qaWorkspaceEmptyMswHandlers,
  qaWorkspaceErrorMswHandlers,
  qaWorkspaceFindingsErrorMswHandlers,
  qaWorkspaceLoadMoreMswHandlers,
  qaWorkspaceLoadingMswHandlers,
  qaWorkspaceMswHandlers,
  qaWorkspaceWhitespaceMswHandlers,
} from "@/components/qa/qa-msw-handlers";

import { QaWorkspacePageContent } from "./qa-workspace-page-content";

const meta = {
  title: "App/QA/Workspace",
  component: QaWorkspacePageContent,
  parameters: {
    layout: "fullscreen",
    nextjs: {
      appDirectory: true,
      navigation: {
        pathname: `/org/${qaOrganizationSlug}/qa`,
      },
    },
    msw: {
      handlers: qaWorkspaceMswHandlers,
    },
  },
  args: {
    organizationSlug: qaOrganizationSlug,
    canPromoteFindings: true,
  },
} satisfies Meta<typeof QaWorkspacePageContent>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ canvas, canvasElement }) => {
    await expect(
      await canvas.findByRole("heading", { name: "Translation QA" }),
    ).toBeInTheDocument();
    await expect(canvas.getByText(/last completed scan/)).toBeInTheDocument();
    const overview = within(await canvas.findByRole("region", { name: "QA overview" }));
    await expect(overview.getByText("1 of 4")).toBeInTheDocument();
    await expect(
      overview.getByText("1 failed · 1 in progress · 1 not scanned"),
    ).toBeInTheDocument();
    await expect(overview.getAllByText("Across 1 scanned project")).toHaveLength(2);
    await expect(overview.getByText("128")).toBeInTheDocument();
    await expect(
      overview.getByRole("img", { name: "Findings by language: de-DE 3, fr-FR 2" }),
    ).toBeInTheDocument();
    await expect(
      overview.getByRole("img", { name: "Errors and warnings by project: Website localization 5" }),
    ).toBeInTheDocument();
    await expect(overview.getByRole("region", { name: "Findings by check" })).toBeInTheDocument();
    await expect(canvas.getByText("1 project needs attention")).toBeInTheDocument();
    await expect(canvas.getByRole("button", { name: "Review projects" })).toBeInTheDocument();
    await expect(await canvas.findByText("dashboard.reviews.pending")).toBeInTheDocument();
    await expect(canvas.getByRole("combobox", { name: "Projects" })).toHaveTextContent("All");
    await expect(canvas.getByRole("combobox", { name: "Language" })).toHaveTextContent("All");
    await expect(canvas.getByRole("combobox", { name: "Check" })).toHaveTextContent("All");
    await expect(canvas.getByRole("combobox", { name: "Severity" })).toHaveTextContent("All");
    await expect(canvas.getByRole("combobox", { name: "Review status" })).toHaveTextContent("Open");
    await expect(canvas.getByText("Placeholder mismatch")).toBeInTheDocument();
    await expect(canvas.getByText("The translation is missing {count}.")).toBeInTheDocument();
    await expect(canvas.getByText("Issue WEB-14")).toBeInTheDocument();
    await expect(canvas.getByText(/Translation changed/)).toBeInTheDocument();
    await expect(canvas.getByText("Showing 4 of 4 findings")).toBeInTheDocument();
    await expect(canvas.getByRole("button", { name: "Create issues (0)" })).toBeDisabled();
    await expect(canvas.getByRole("link", { name: "Review translation" })).toBeInTheDocument();

    await userEvent.click(canvas.getByRole("checkbox", { name: "Show spaces and line breaks" }));
    await expect(canvas.getByText(/reviews··waiting/)).toBeInTheDocument();

    await userEvent.click(canvas.getByRole("tab", { name: "Projects" }));
    await expect(canvas.getByRole("heading", { name: "Website localization" })).toBeInTheDocument();
    await expect(
      canvas.getByText("128 translations checked · 2 errors · 3 warnings"),
    ).toBeInTheDocument();
    await expect(
      canvas.getByText("Checking translations… Results will refresh when the scan finishes."),
    ).toBeInTheDocument();
    await expect(
      canvas.getByText("Not checked yet. Run a scan to review translation quality."),
    ).toBeInTheDocument();
    await expect(
      canvas.getByText("The scan stopped while checking translations."),
    ).toBeInTheDocument();
    await expect(canvas.getAllByRole("link", { name: "Open QA" })).toHaveLength(4);
    await expect(
      canvas.getAllByRole("heading", { level: 3 }).map((heading) => heading.textContent),
    ).toEqual(["Release notes", "Website localization", "Mobile app", "Help center"]);
    await expect(canvas.getAllByText("Daily")).toHaveLength(2);
    await expect(canvasElement.querySelector("table")).toBeNull();
  },
};

export const ViewProjectFindings: Story = {
  play: async ({ canvas }) => {
    await expect(await canvas.findByText("dashboard.reviews.pending")).toBeInTheDocument();
    await userEvent.click(canvas.getByRole("tab", { name: "Projects" }));
    await userEvent.click(canvas.getAllByRole("button", { name: "View findings" })[1]!);
    await expect(canvas.getByRole("tab", { name: "Findings" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await expect(canvas.getByRole("combobox", { name: "Projects" })).not.toHaveTextContent(/^All$/);
  },
};

export const ReadOnly: Story = {
  args: {
    canPromoteFindings: false,
  },
  play: async ({ canvas }) => {
    await expect(await canvas.findByText("dashboard.reviews.pending")).toBeInTheDocument();
    await expect(canvas.queryByRole("button", { name: /Create issues/ })).not.toBeInTheDocument();
    await expect(canvas.queryByRole("button", { name: "Ignore" })).not.toBeInTheDocument();
    await expect(
      canvas.queryByRole("checkbox", { name: "Select loaded open findings" }),
    ).not.toBeInTheDocument();
  },
};

export const Empty: Story = {
  parameters: {
    msw: {
      handlers: qaWorkspaceEmptyMswHandlers,
    },
  },
  play: async ({ canvas }) => {
    await expect(
      await canvas.findByText("No issues found by the completed checks."),
    ).toBeInTheDocument();
    await expect(canvas.queryByRole("button", { name: "Clear filters" })).not.toBeInTheDocument();
    await userEvent.click(canvas.getByRole("tab", { name: "Projects" }));
    await expect(canvas.getByText("No native projects yet.")).toBeInTheDocument();
  },
};

export const Loading: Story = {
  parameters: {
    msw: {
      handlers: qaWorkspaceLoadingMswHandlers,
    },
  },
  play: async ({ canvas, canvasElement }) => {
    await expect(canvas.getByRole("heading", { name: "Translation QA" })).toBeInTheDocument();
    await expect(canvasElement.querySelectorAll('[data-slot="skeleton"]').length).toBeGreaterThan(
      0,
    );
    await expect(canvas.queryByText("dashboard.reviews.pending")).not.toBeInTheDocument();
  },
};

export const LoadError: Story = {
  parameters: {
    msw: {
      handlers: qaWorkspaceErrorMswHandlers,
    },
  },
  play: async ({ canvas }) => {
    await waitFor(
      () =>
        expect(
          canvas.getByText("Could not load QA results. Retry to see the current state."),
        ).toBeInTheDocument(),
      { timeout: 15_000 },
    );
    await expect(canvas.getByRole("button", { name: "Retry" })).toBeInTheDocument();
  },
};

export const FindingsError: Story = {
  parameters: {
    msw: {
      handlers: qaWorkspaceFindingsErrorMswHandlers,
    },
  },
  play: async ({ canvas }) => {
    await waitFor(
      () =>
        expect(
          canvas.getByText("Could not load QA results. Retry to see the current state."),
        ).toBeInTheDocument(),
      { timeout: 15_000 },
    );
    await expect(canvas.getByRole("button", { name: "Retry" })).toBeInTheDocument();
  },
};

export const LoadMore: Story = {
  parameters: {
    msw: {
      handlers: qaWorkspaceLoadMoreMswHandlers,
    },
  },
  play: async ({ canvas }) => {
    await expect(await canvas.findByText("dashboard.reviews.pending")).toBeInTheDocument();
    await expect(canvas.queryByText("checkout.pay_now")).not.toBeInTheDocument();
    await expect(canvas.getByText("Showing 1 of 4 findings")).toBeInTheDocument();
    await userEvent.click(canvas.getByRole("button", { name: "Load more" }));
    await expect(await canvas.findByText("checkout.pay_now")).toBeInTheDocument();
    await expect(canvas.getByText("Showing 4 of 4 findings")).toBeInTheDocument();
  },
};

export const FilterByLanguage: Story = {
  play: async ({ canvas, canvasElement }) => {
    await expect(await canvas.findByText("checkout.pay_now")).toBeInTheDocument();
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(canvas.getByRole("combobox", { name: "Language" }));
    await userEvent.click(await body.findByRole("option", { name: "de-DE" }));
    await waitFor(() => expect(canvas.queryByText("checkout.pay_now")).not.toBeInTheDocument());
    await expect(canvas.getByText("dashboard.reviews.pending")).toBeInTheDocument();
    await expect(canvas.queryByText("auth.sign_in")).not.toBeInTheDocument();
  },
};

export const IgnoreFinding: Story = {
  play: async ({ canvas }) => {
    await expect(await canvas.findByText("dashboard.reviews.pending")).toBeInTheDocument();
    await userEvent.click(canvas.getAllByRole("button", { name: "Ignore" })[0]!);
    await userEvent.type(
      canvas.getByRole("textbox", { name: "Reason for ignoring" }),
      "False positive",
    );
    await userEvent.click(canvas.getByRole("button", { name: "Ignore finding" }));
    await waitFor(() =>
      expect(canvas.queryByText("dashboard.reviews.pending")).not.toBeInTheDocument(),
    );
  },
};

export const PromoteFindings: Story = {
  play: async ({ canvas }) => {
    await expect(await canvas.findByText("dashboard.reviews.pending")).toBeInTheDocument();
    await userEvent.click(canvas.getByRole("checkbox", { name: "Select loaded open findings" }));
    await userEvent.click(canvas.getByRole("button", { name: "Create issues (2)" }));
    await expect(await canvas.findByText("Issue WEB-21")).toBeInTheDocument();
    await expect(canvas.getByText("Issue WEB-22")).toBeInTheDocument();
  },
};

export const WhitespaceMismatch: Story = {
  parameters: {
    msw: {
      handlers: qaWorkspaceWhitespaceMswHandlers,
    },
  },
  play: async ({ canvas }) => {
    await expect(
      await canvas.findByText("Non-breaking space count differs from source"),
    ).toBeInTheDocument();
    await expect(canvas.getByRole("combobox", { name: "Projects" })).toHaveTextContent("All");
    await expect(canvas.getByRole("combobox", { name: "Review status" })).toHaveTextContent("Open");
    await expect(canvas.getByTitle("Non-breaking space")).toBeInTheDocument();
    await expect(canvas.getByText("Format, tags & ICU")).toBeInTheDocument();
    await expect(canvas.getByText("Error")).toBeInTheDocument();
  },
};
