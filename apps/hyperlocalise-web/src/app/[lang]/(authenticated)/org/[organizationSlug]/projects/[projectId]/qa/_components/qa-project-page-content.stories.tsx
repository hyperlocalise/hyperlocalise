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
import { expect, userEvent, waitFor } from "storybook/test";

import { qaOrganizationSlug, qaWebsiteProjectId } from "@/components/qa/qa.fixture";
import {
  qaProjectCleanMswHandlers,
  qaProjectErrorMswHandlers,
  qaProjectFailedMswHandlers,
  qaProjectFindingsErrorMswHandlers,
  qaProjectHistoryMswHandlers,
  qaProjectLoadingMswHandlers,
  qaProjectLockedMswHandlers,
  qaProjectMswHandlers,
  qaProjectNotScannedMswHandlers,
  qaProjectPartialMswHandlers,
  qaProjectRunErrorMswHandlers,
  qaProjectRunningMswHandlers,
  qaProjectSettingsErrorMswHandlers,
  qaProjectUnsupportedMswHandlers,
} from "@/components/qa/qa-msw-handlers";

import { QaProjectPageContent } from "./qa-project-page-content";

const meta = {
  title: "App/QA/Project",
  component: QaProjectPageContent,
  parameters: {
    layout: "fullscreen",
    nextjs: {
      appDirectory: true,
      navigation: {
        pathname: `/org/${qaOrganizationSlug}/projects/${qaWebsiteProjectId}/qa`,
      },
    },
    msw: {
      handlers: qaProjectMswHandlers,
    },
  },
  args: {
    organizationSlug: qaOrganizationSlug,
    projectId: qaWebsiteProjectId,
    canPromoteFindings: true,
  },
} satisfies Meta<typeof QaProjectPageContent>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ canvas }) => {
    await expect(
      await canvas.findByRole("heading", { name: "Translation QA" }),
    ).toBeInTheDocument();
    await expect(canvas.getByRole("button", { name: "Run QA check" })).toBeEnabled();
    await expect(
      await canvas.findByText("128 translations checked · 2 errors · 3 warnings"),
    ).toBeInTheDocument();
    await expect(canvas.getByText(/selected scan/)).toBeInTheDocument();
    await expect(canvas.getByText("dashboard.reviews.pending")).toBeInTheDocument();
    await expect(canvas.getByText("Placeholder mismatch")).toBeInTheDocument();
    await expect(canvas.getByText("Showing 4 of 4 findings")).toBeInTheDocument();
    await expect(canvas.getByRole("button", { name: "Create issues (0)" })).toBeDisabled();
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
  },
};

export const Clean: Story = {
  parameters: {
    msw: {
      handlers: qaProjectCleanMswHandlers,
    },
  },
  play: async ({ canvas }) => {
    await expect(
      await canvas.findByText("No issues found by the completed checks."),
    ).toBeInTheDocument();
    await expect(
      canvas.getByText("64 translations checked · 0 errors · 0 warnings"),
    ).toBeInTheDocument();
    await expect(canvas.queryByText("dashboard.reviews.pending")).not.toBeInTheDocument();
  },
};

export const Running: Story = {
  parameters: {
    msw: {
      handlers: qaProjectRunningMswHandlers,
    },
  },
  play: async ({ canvas }) => {
    await expect(await canvas.findByRole("button", { name: "Running…" })).toBeDisabled();
    await expect(
      canvas.getByText("Checking translations… Results will refresh when the scan finishes."),
    ).toBeInTheDocument();
  },
};

export const Failed: Story = {
  parameters: {
    msw: {
      handlers: qaProjectFailedMswHandlers,
    },
  },
  play: async ({ canvas }) => {
    await expect(
      await canvas.findByRole("heading", { name: "QA scan failed" }),
    ).toBeInTheDocument();
    await expect(
      canvas.getByText("The scan stopped while checking translations."),
    ).toBeInTheDocument();
    await expect(canvas.getByRole("button", { name: "Retry scan" })).toBeEnabled();
    await expect(canvas.getByRole("button", { name: "View last completed scan" })).toBeEnabled();
    await expect(canvas.queryByRole("button", { name: "Run QA check" })).not.toBeInTheDocument();
    await userEvent.click(canvas.getByRole("tab", { name: "History" }));
    await expect(canvas.getByRole("button", { name: "View failure" })).toBeInTheDocument();
  },
};

export const NotScanned: Story = {
  parameters: {
    msw: {
      handlers: qaProjectNotScannedMswHandlers,
    },
  },
  play: async ({ canvas }) => {
    await expect(
      await canvas.findByText("Not checked yet. Run a scan to review translation quality."),
    ).toBeInTheDocument();
    await expect(canvas.getByRole("button", { name: "Run QA check" })).toBeEnabled();
    await userEvent.click(canvas.getByRole("tab", { name: "History" }));
    await expect(
      canvas.getByText("Not checked yet. Run a scan to review translation quality."),
    ).toBeInTheDocument();
  },
};

export const Unsupported: Story = {
  parameters: {
    msw: {
      handlers: qaProjectUnsupportedMswHandlers,
    },
  },
  play: async ({ canvas }) => {
    await waitFor(
      () =>
        expect(
          canvas.getByText(
            "QA reports run on native projects. Provider jobs are not scanned here.",
          ),
        ).toBeInTheDocument(),
      { timeout: 15_000 },
    );
    await expect(canvas.queryByRole("button", { name: "Retry" })).not.toBeInTheDocument();
    await expect(canvas.queryByRole("tab", { name: "Findings" })).not.toBeInTheDocument();
  },
};

export const LoadError: Story = {
  parameters: {
    msw: {
      handlers: qaProjectErrorMswHandlers,
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
      handlers: qaProjectFindingsErrorMswHandlers,
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
  },
};

export const Loading: Story = {
  parameters: {
    msw: {
      handlers: qaProjectLoadingMswHandlers,
    },
  },
  play: async ({ canvas, canvasElement }) => {
    await expect(canvas.getByRole("heading", { name: "Translation QA" })).toBeInTheDocument();
    await expect(canvasElement.querySelectorAll('[data-slot="skeleton"]').length).toBeGreaterThan(
      0,
    );
  },
};

export const PartialCoverage: Story = {
  parameters: {
    msw: {
      handlers: qaProjectPartialMswHandlers,
    },
  },
  play: async ({ canvas }) => {
    await expect(
      await canvas.findByText(
        "Some checks were unavailable: de-DE: Spelling. A clean result does not cover these checks.",
      ),
    ).toBeInTheDocument();
    await expect(
      canvas.getByText(
        "This older scan used a limited set of checks. Run a new scan for full coverage.",
      ),
    ).toBeInTheDocument();
    await expect(canvas.getByText("No issues found by the completed checks.")).toBeInTheDocument();
  },
};

export const History: Story = {
  parameters: {
    msw: {
      handlers: qaProjectHistoryMswHandlers,
    },
  },
  play: async ({ canvas }) => {
    await expect(await canvas.findByText("dashboard.reviews.pending")).toBeInTheDocument();
    await userEvent.click(canvas.getByRole("tab", { name: "History" }));
    await expect(canvas.getByText("Manual")).toBeInTheDocument();
    await expect(canvas.getByText("Scheduled")).toBeInTheDocument();
    await userEvent.click(canvas.getAllByRole("button", { name: "Findings" })[1]!);
    await expect(await canvas.findByText(/Viewing an older scan/)).toBeInTheDocument();
    await expect(canvas.getByText("billing.invoice.empty")).toBeInTheDocument();
    await expect(canvas.queryByText("dashboard.reviews.pending")).not.toBeInTheDocument();
    await userEvent.click(canvas.getByRole("button", { name: "View latest scan" }));
    await expect(await canvas.findByText("dashboard.reviews.pending")).toBeInTheDocument();
    await expect(canvas.queryByText(/Viewing an older scan/)).not.toBeInTheDocument();
  },
};

export const Settings: Story = {
  play: async ({ canvas }) => {
    await expect(await canvas.findByText("dashboard.reviews.pending")).toBeInTheDocument();
    await userEvent.click(canvas.getByRole("tab", { name: "Check settings" }));
    await expect(canvas.getByRole("switch", { name: "Daily scan" })).toBeChecked();
    await expect(canvas.getByText(/Scan this project once a day/)).toBeInTheDocument();
    await expect(canvas.getByRole("button", { name: "Save check settings" })).toBeDisabled();
    await userEvent.click(canvas.getByRole("switch", { name: "Enable Numbers" }));
    await expect(canvas.getByRole("button", { name: "Save check settings" })).toBeEnabled();
    await userEvent.click(canvas.getByRole("button", { name: "Save check settings" }));
    await expect(await canvas.findByText(/Check settings saved/)).toBeInTheDocument();
  },
};

export const SettingsLocked: Story = {
  parameters: {
    msw: {
      handlers: qaProjectLockedMswHandlers,
    },
  },
  play: async ({ canvas }) => {
    await expect(await canvas.findByRole("tab", { name: "Check settings" })).toBeInTheDocument();
    await expect(canvas.queryByRole("button", { name: "Run QA check" })).not.toBeInTheDocument();
    await userEvent.click(canvas.getByRole("tab", { name: "Check settings" }));
    await expect(canvas.getByRole("switch", { name: "Daily scan" })).toBeDisabled();
    await expect(canvas.getByRole("button", { name: "Save check settings" })).toBeDisabled();
  },
};

export const SettingsError: Story = {
  parameters: {
    msw: {
      handlers: qaProjectSettingsErrorMswHandlers,
    },
  },
  play: async ({ canvas }) => {
    await expect(await canvas.findByRole("tab", { name: "Check settings" })).toBeInTheDocument();
    await userEvent.click(canvas.getByRole("tab", { name: "Check settings" }));
    await userEvent.click(canvas.getByRole("switch", { name: "Daily scan" }));
    await expect(
      await canvas.findByText("Could not save check settings. Retry the change."),
    ).toBeInTheDocument();
    await expect(canvas.getByRole("switch", { name: "Daily scan" })).not.toBeChecked();
  },
};

export const RunScan: Story = {
  play: async ({ canvas }) => {
    await expect(await canvas.findByRole("button", { name: "Run QA check" })).toBeEnabled();
    await userEvent.click(canvas.getByRole("button", { name: "Run QA check" }));
    await expect(await canvas.findByRole("button", { name: "Running…" })).toBeDisabled();
    await expect(
      canvas.getByText("Checking translations… Results will refresh when the scan finishes."),
    ).toBeInTheDocument();
  },
};

export const RunError: Story = {
  parameters: {
    msw: {
      handlers: qaProjectRunErrorMswHandlers,
    },
  },
  play: async ({ canvas }) => {
    await expect(await canvas.findByRole("button", { name: "Run QA check" })).toBeEnabled();
    await userEvent.click(canvas.getByRole("button", { name: "Run QA check" }));
    await expect(await canvas.findByText("Could not start the QA scan.")).toBeInTheDocument();
    await expect(canvas.getByRole("button", { name: "Retry" })).toBeInTheDocument();
  },
};

export const PromoteFindings: Story = {
  play: async ({ canvas }) => {
    await expect(await canvas.findByText("dashboard.reviews.pending")).toBeInTheDocument();
    await userEvent.click(canvas.getByRole("checkbox", { name: "Select loaded open findings" }));
    await userEvent.click(canvas.getByRole("button", { name: "Create issues (2)" }));
    await waitFor(() => expect(canvas.getByText("Issue WEB-21")).toBeInTheDocument());
    await expect(canvas.getByText("Issue WEB-22")).toBeInTheDocument();
  },
};
