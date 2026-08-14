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
  createFailedAudit,
  createRunningAudit,
  createSucceededAudit,
  localisationAuditDomainSlug,
  localisationAuditStanding,
} from "./localisation-audit.fixture";

const unlockedAudit = createSucceededAudit({ unlocked: true });
const lockedAudit = createSucceededAudit({ unlocked: false });
const excellentAudit = createSucceededAudit({ unlocked: true, scoreBand: "excellent" });
const criticalAudit = createSucceededAudit({ unlocked: true, scoreBand: "critical" });
const crawlingAudit = createRunningAudit({ progressStage: "crawling" });
const failedAudit = createFailedAudit();

const meta = {
  title: "Marketing/LocalisationAudit/Result",
  component: LocalisationAuditResultPage,
  parameters: {
    layout: "fullscreen",
    nextjs: {
      navigation: {
        pathname: `/en/localisation-audit/${localisationAuditDomainSlug}`,
      },
    },
  },
  args: {
    locale: "en",
    domainSlug: localisationAuditDomainSlug,
    standing: localisationAuditStanding(unlockedAudit.score ?? 0),
    audit: unlockedAudit,
  },
} satisfies Meta<typeof LocalisationAuditResultPage>;

export default meta;
type Story = StoryObj<typeof meta>;

export const UnlockedFullReport: Story = {
  play: async ({ canvas }) => {
    const heading = canvas.getByRole("heading", { name: "Credit scores" });
    await expect(heading).toBeInTheDocument();
    const section = heading.closest("section");
    await expect(section).not.toBeNull();
    for (const credit of LOCALISATION_AUDIT_CREDITS) {
      await expect(section).toHaveTextContent(credit.id);
    }
    await expect(canvas.getAllByText("Found here").length).toBeGreaterThan(0);
    await expect(canvas.getAllByText("What we saw").length).toBeGreaterThan(0);
    await expect(canvas.getAllByText("How to fix it").length).toBeGreaterThan(0);
    await expect(canvas.getByText("Document head · <html lang>")).toBeInTheDocument();
  },
};

export const LockedTeaser: Story = {
  args: {
    audit: lockedAudit,
    standing: localisationAuditStanding(lockedAudit.score ?? 0),
  },
  parameters: {
    msw: {
      handlers: localisationAuditUnlockMswHandlers,
    },
  },
  play: async ({ canvas }) => {
    await expect(
      canvas.getByRole("heading", { name: "Get the full report by email" }),
    ).toBeInTheDocument();
    await expect(canvas.queryByRole("heading", { name: "Credit scores" })).not.toBeInTheDocument();
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
      canvas.getByRole("link", { name: "Run a deeper registered audit" }),
    ).toBeInTheDocument();
  },
};

export const CriticalScore: Story = {
  args: {
    audit: criticalAudit,
    standing: localisationAuditStanding(criticalAudit.score ?? 0),
  },
  play: async ({ canvas }) => {
    await expect(canvas.getAllByText("Critical").length).toBeGreaterThan(0);
    await expect(canvas.getByRole("link", { name: "Create a workspace" })).toBeInTheDocument();
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
      canvas.getByRole("heading", { name: "Running localisation audit" }),
    ).toBeInTheDocument();
    await expect(canvas.getAllByText("Crawling").length).toBeGreaterThan(0);
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
