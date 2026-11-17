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
import { expect } from "storybook/test";

import { LOCALISATION_AUDIT_CREDITS } from "@/lib/localisation-audit/credits/catalog";

import {
  localisationAuditProgressMswHandlers,
  localisationAuditRetryMswHandlers,
  localisationAuditUnlockMswHandlers,
} from "./localisation-audit-msw-handlers";
import { LocalisationAuditResultPage } from "./localisation-audit-result-page";
import {
  createBlockedAudit,
  createFailedAudit,
  createRunningAudit,
  createSucceededAudit,
  localisationAuditDomainSlug,
  localisationAuditStanding,
} from "./localisation-audit.fixture";

const publicAudit = createSucceededAudit();
const excellentAudit = createSucceededAudit({ scoreBand: "excellent" });
const criticalAudit = createSucceededAudit({ scoreBand: "critical" });
const crawlingAudit = createRunningAudit({ progressStage: "crawling" });
const analyzingAudit = createRunningAudit({ progressStage: "analyzing" });
const failedAudit = createFailedAudit();
const blockedAudit = createBlockedAudit();

const meta = {
  title: "Marketing/LocalisationAudit/Result",
  component: LocalisationAuditResultPage,
  parameters: {
    layout: "fullscreen",
    nextjs: {
      appDirectory: true,
      navigation: {
        pathname: `/en/localisation-audit/${localisationAuditDomainSlug}`,
      },
    },
  },
  args: {
    locale: "en",
    domainSlug: localisationAuditDomainSlug,
    standing: localisationAuditStanding(publicAudit.score ?? 0),
    audit: publicAudit,
  },
} satisfies Meta<typeof LocalisationAuditResultPage>;

export default meta;
type Story = StoryObj<typeof meta>;

export const PublicFullReport: Story = {
  parameters: {
    msw: {
      handlers: localisationAuditRetryMswHandlers,
    },
  },
  play: async ({ canvas, userEvent }) => {
    await expect(canvas.getByRole("heading", { name: "Acme" })).toBeInTheDocument();
    await expect(canvas.getByText("Fintech")).toBeInTheDocument();
    await expect(canvas.getByRole("button", { name: "Copy report link" })).toBeInTheDocument();
    const heading = canvas.getByRole("heading", { name: "Audit criteria" });
    await expect(heading).toBeInTheDocument();
    const section = heading.closest("section");
    await expect(section).not.toBeNull();
    await expect(section).toHaveTextContent(/passed · .+ to watch · .+ to fix · .+ not applicable/);
    await expect(section).toHaveTextContent("Needs attention");
    await expect(section).toHaveTextContent("Worth a look");
    await expect(section).toHaveTextContent("Passed audits");
    await expect(section).toHaveTextContent("Pass");
    await expect(section).toHaveTextContent("Watch");
    await expect(section).toHaveTextContent("Fail");
    await expect(canvas.getByRole("navigation", { name: "Report sections" })).toBeInTheDocument();
    await expect(
      canvas.getByRole("heading", { name: "How your score is built" }),
    ).toBeInTheDocument();
    await expect(canvas.getAllByText("potential gain").length).toBeGreaterThan(0);
    await expect(canvas.getByText("Your score")).toBeInTheDocument();
    for (const name of ["Show passed audits", "Show AI-assessed checks", "Show not applicable"]) {
      const toggle = canvas.queryByRole("button", { name });
      if (toggle) {
        await userEvent.click(toggle);
      }
    }
    for (const credit of LOCALISATION_AUDIT_CREDITS.filter((item) => item.mode !== "na")) {
      await expect(section).toHaveTextContent(credit.title);
    }
    const firstCheck = section!.querySelector<HTMLButtonElement>("li[id^='check-'] > button");
    await expect(firstCheck).not.toBeNull();
    await userEvent.click(firstCheck!);
    await expect(firstCheck).toHaveAttribute("aria-expanded", "true");
    await expect(canvas.getAllByText("What we check").length).toBeGreaterThan(0);
    await userEvent.click(canvas.getByRole("button", { name: "Show all 6 pages" }));
    await expect(canvas.getByText("HTTP 403")).toBeInTheDocument();
    await expect(canvas.getByText("French")).toBeInTheDocument();
    await expect(canvas.getByText("Get a copy by email")).toBeInTheDocument();
    await expect(canvas.getByRole("button", { name: "Re-run audit" })).toBeInTheDocument();
  },
};

export const RerunCooldown: Story = {
  args: {
    audit: {
      ...publicAudit,
      rerunnable: false,
      rerunAvailableAt: "2026-08-02T12:00:00.000Z",
    },
    standing: localisationAuditStanding(publicAudit.score ?? 0),
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("heading", { name: "Acme" })).toBeInTheDocument();
    await expect(canvas.queryByRole("button", { name: "Re-run audit" })).not.toBeInTheDocument();
    await expect(canvas.getByText(/You can re-run this audit once a day/)).toBeInTheDocument();
  },
};

export const EmailSummary: Story = {
  args: {
    audit: publicAudit,
    standing: localisationAuditStanding(publicAudit.score ?? 0),
  },
  parameters: {
    msw: {
      handlers: localisationAuditUnlockMswHandlers,
    },
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Get a copy by email")).toBeInTheDocument();
    await expect(canvas.getByRole("button", { name: "Email me a summary" })).toBeInTheDocument();
  },
};

export const ExcellentScore: Story = {
  args: {
    audit: excellentAudit,
    standing: localisationAuditStanding(excellentAudit.score ?? 0),
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Excellent")).toBeInTheDocument();
    await expect(
      canvas.queryByRole("link", { name: "Run a deeper registered audit" }),
    ).not.toBeInTheDocument();
    await expect(canvas.getByRole("link", { name: "Book an audit review" })).toBeInTheDocument();
  },
};

export const CriticalScore: Story = {
  args: {
    audit: criticalAudit,
    standing: localisationAuditStanding(criticalAudit.score ?? 0),
  },
  play: async ({ canvas }) => {
    await expect(canvas.getAllByText("Critical").length).toBeGreaterThan(0);
    await expect(
      canvas.queryByRole("link", { name: "Create a workspace" }),
    ).not.toBeInTheDocument();
    await expect(canvas.getByRole("link", { name: "Book an audit review" })).toBeInTheDocument();
  },
};

export const ProgressCrawling: Story = {
  args: {
    audit: crawlingAudit,
    standing: null,
  },
  parameters: {
    msw: {
      handlers: localisationAuditProgressMswHandlers,
    },
  },
  play: async ({ canvas }) => {
    await expect(
      canvas.getByRole("heading", { name: "Auditing acme.example" }),
    ).toBeInTheDocument();
    await expect(canvas.getAllByText("Crawling").length).toBeGreaterThan(0);
    await expect(canvas.getByRole("progressbar", { name: "Audit progress" })).toBeInTheDocument();
    await expect(canvas.getByText("Waiting for the first pages…")).toBeInTheDocument();
  },
};

export const ProgressAnalyzing: Story = {
  args: {
    audit: analyzingAudit,
    standing: null,
  },
  parameters: {
    msw: {
      handlers: localisationAuditProgressMswHandlers,
    },
  },
  play: async ({ canvas }) => {
    await expect(canvas.getAllByText("Analyzing").length).toBeGreaterThan(0);
    await expect(canvas.getByText("6 pages sampled")).toBeInTheDocument();
    await expect(canvas.getByText("3 languages found")).toBeInTheDocument();
    await expect(canvas.getByText("fr-FR")).toBeInTheDocument();
    await expect(canvas.getByText("/pricing")).toBeInTheDocument();
  },
};

export const FailedRetryable: Story = {
  args: {
    audit: failedAudit,
    standing: null,
  },
  parameters: {
    msw: {
      handlers: localisationAuditRetryMswHandlers,
    },
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("heading", { name: "Audit failed" })).toBeInTheDocument();
    await expect(canvas.getByRole("button", { name: "Retry audit" })).toBeInTheDocument();
  },
};

export const BlockedByDomain: Story = {
  args: {
    audit: blockedAudit,
    standing: null,
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("heading", { name: "Audit blocked" })).toBeInTheDocument();
    await expect(canvas.getByText(/Chrome\/131\.0\.0\.0/)).toBeInTheDocument();
    await expect(canvas.getByRole("link", { name: "Start a new audit" })).toBeInTheDocument();
    await expect(canvas.queryByRole("button", { name: "Retry audit" })).not.toBeInTheDocument();
  },
};
