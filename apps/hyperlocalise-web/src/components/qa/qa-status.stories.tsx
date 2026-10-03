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

import { qaFailedReport, qaPartialReport, qaRunningReport, qaWebsiteReport } from "./qa.fixture";
import { QaRunStatus } from "./qa-status";

const meta = {
  title: "App/QA/Run status",
  component: QaRunStatus,
  args: {
    onRetry: fn(),
  },
} satisfies Meta<typeof QaRunStatus>;

export default meta;
type Story = StoryObj<typeof meta>;

export const NotScanned: Story = {
  args: {
    report: undefined,
  },
  play: async ({ canvas }) => {
    await expect(
      canvas.getByText("Not checked yet. Run a scan to review translation quality."),
    ).toBeInTheDocument();
  },
};

export const Running: Story = {
  args: {
    report: qaRunningReport,
  },
  play: async ({ canvas }) => {
    await expect(
      canvas.getByText("Checking translations… Results will refresh when the scan finishes."),
    ).toBeInTheDocument();
  },
};

export const Failed: Story = {
  args: {
    report: qaFailedReport,
  },
  play: async ({ canvas }) => {
    await expect(
      canvas.getByText("Scan failed. These results are incomplete. Retry the scan."),
    ).toBeInTheDocument();
    await expect(canvas.getByRole("button", { name: "Retry" })).toBeInTheDocument();
  },
};

export const Succeeded: Story = {
  args: {
    report: qaWebsiteReport,
  },
  play: async ({ canvas }) => {
    await expect(
      canvas.getByText("128 translations checked · 2 errors · 3 warnings"),
    ).toBeInTheDocument();
    await expect(canvas.getByText(/Checked /)).toBeInTheDocument();
  },
};

export const SkippedAndLegacy: Story = {
  args: {
    report: qaPartialReport,
  },
  play: async ({ canvas }) => {
    await expect(
      canvas.getByText(
        "Some checks were unavailable: de-DE: Spelling. A clean result does not cover these checks.",
      ),
    ).toBeInTheDocument();
    await expect(
      canvas.getByText(
        "This older scan used a limited set of checks. Run a new scan for full coverage.",
      ),
    ).toBeInTheDocument();
  },
};
