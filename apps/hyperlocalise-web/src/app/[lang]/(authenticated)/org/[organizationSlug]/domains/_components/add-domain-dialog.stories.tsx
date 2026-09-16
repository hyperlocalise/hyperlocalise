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
import { delay, http, HttpResponse } from "msw";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, fn, userEvent } from "storybook/test";

import { AddDomainDialog } from "./add-domain-dialog";

const domain = {
  id: "ld_acme",
  organizationId: "org_acme",
  domainKey: "acme.com",
  domainSlug: "acme-com",
  sourceUrl: "https://acme.com",
  marketIds: [],
  status: "pending_verification" as const,
  preferredMethod: null,
  verifiedMethod: null,
  verifiedAt: null,
  localisationAuditId: null,
  projectId: null,
  createdAt: "2026-09-16T00:00:00.000Z",
  updatedAt: "2026-09-16T00:00:00.000Z",
  challenges: {
    token: "hyperlocalise-site-verification=acme",
    dnsTxt: { host: "_hyperlocalise-verify", value: "hyperlocalise-site-verification=acme" },
    htmlFile: {
      path: "/.well-known/hyperlocalise-verification.txt",
      url: "https://acme.com/.well-known/hyperlocalise-verification.txt",
      body: "hyperlocalise-site-verification=acme",
    },
    metaTag: {
      html: '<meta name="hyperlocalise-site-verification" content="hyperlocalise-site-verification=acme" />',
    },
  },
  auditScore: null,
};

const handlers = [
  http.post("*/api/orgs/:organizationSlug/linked-domains", () =>
    HttpResponse.json({ linkedDomain: domain }, { status: 201 }),
  ),
  http.post("*/api/orgs/:organizationSlug/linked-domains/:linkedDomainId/verify", () =>
    HttpResponse.json({
      linkedDomain: {
        ...domain,
        status: "verified",
        verifiedMethod: "dns_txt",
        projectId: "project_acme",
      },
    }),
  ),
  http.post(
    "*/api/orgs/:organizationSlug/linked-domains/:linkedDomainId/market-recommendations",
    () =>
      HttpResponse.json({
        marketRecommendations: {
          candidates: [
            {
              marketId: "france-fr",
              organicCount: 1200,
              organicEtv: 860,
              top10Count: 14,
              hasOrganicVisibility: true,
            },
            {
              marketId: "germany-de",
              organicCount: 400,
              organicEtv: 210,
              top10Count: 3,
              hasOrganicVisibility: false,
            },
            {
              marketId: "italy-it",
              organicCount: 180,
              organicEtv: 95,
              top10Count: 0,
              hasOrganicVisibility: false,
            },
            {
              marketId: "spain-es",
              organicCount: 60,
              organicEtv: 32,
              top10Count: 0,
              hasOrganicVisibility: false,
            },
          ],
          recommended: [
            {
              marketId: "france-fr",
              organicCount: 1200,
              organicEtv: 860,
              top10Count: 14,
              hasOrganicVisibility: true,
            },
          ],
        },
      }),
  ),
  http.patch("*/api/orgs/:organizationSlug/linked-domains/:linkedDomainId/markets", () =>
    HttpResponse.json({
      linkedDomain: {
        ...domain,
        status: "verified",
        marketIds: ["france-fr"],
        verifiedMethod: "dns_txt",
        projectId: "project_acme",
      },
    }),
  ),
  http.post("*/api/orgs/:organizationSlug/projects", () =>
    HttpResponse.json({ project: { id: "project_acme" } }, { status: 201 }),
  ),
  http.patch("*/api/orgs/:organizationSlug/linked-domains/:linkedDomainId/project", () =>
    HttpResponse.json({
      linkedDomain: { ...domain, status: "verified", projectId: "project_acme" },
    }),
  ),
];

const meta = {
  title: "App/Domains/Add a domain Dialog",
  component: AddDomainDialog,
  parameters: { layout: "centered", msw: { handlers } },
  args: {
    open: true,
    organizationSlug: "acme",
    onOpenChange: fn(),
    onComplete: fn(),
    projects: [{ id: "project_acme", name: "Acme Website" }],
  },
} satisfies Meta<typeof AddDomainDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Empty: Story = {};

export const DetailsStep: Story = {
  play: async ({ canvas }) => {
    await userEvent.type(canvas.getByRole("textbox", { name: "Domain" }), "acme.com");
    await userEvent.click(canvas.getByRole("button", { name: "Continue" }));
    await expect(canvas.getByRole("heading", { name: "Verify acme.com" })).toBeInTheDocument();
  },
};

export const ConnectStep: Story = {
  args: { initialStep: "connect", initialLinkedDomain: domain },
};

export const ResearchMarketsStep: Story = {
  args: {
    initialStep: "markets",
    initialLinkedDomain: { ...domain, status: "verified" },
    initialRecommendations: [
      {
        marketId: "france-fr",
        organicCount: 1200,
        organicEtv: 860,
        top10Count: 14,
        hasOrganicVisibility: true,
      },
      {
        marketId: "germany-de",
        organicCount: 400,
        organicEtv: 210,
        top10Count: 3,
        hasOrganicVisibility: false,
      },
      {
        marketId: "italy-it",
        organicCount: 180,
        organicEtv: 95,
        top10Count: 0,
        hasOrganicVisibility: false,
      },
      {
        marketId: "spain-es",
        organicCount: 60,
        organicEtv: 32,
        top10Count: 0,
        hasOrganicVisibility: false,
      },
    ],
    initialSelectedMarketIds: ["france-fr"],
  },
};

export const ProjectStep: Story = {
  args: {
    initialStep: "project",
    initialLinkedDomain: { ...domain, status: "verified" },
    initialRecommendations: [
      {
        marketId: "france-fr",
        organicCount: 1200,
        organicEtv: 860,
        top10Count: 14,
        hasOrganicVisibility: true,
      },
    ],
    initialSelectedMarketIds: ["france-fr"],
  },
};

export const NoMarketsSelected: Story = {
  args: {
    initialStep: "markets",
    initialLinkedDomain: { ...domain, status: "verified" },
    initialRecommendations: [],
    initialSelectedMarketIds: [],
  },
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Continue to project" }));
    await expect(canvas.getByRole("heading", { name: "Choose a project" })).toBeInTheDocument();
  },
};

export const FullJourney: Story = {
  play: async ({ canvas }) => {
    await userEvent.type(canvas.getByRole("textbox", { name: "Domain" }), "acme.com");
    await userEvent.click(canvas.getByRole("button", { name: "Continue" }));
    await userEvent.click(canvas.getByRole("button", { name: "I’ve added it — Verify" }));
    await expect(
      await canvas.findByRole("heading", { name: "Choose research markets" }),
    ).toBeInTheDocument();
    await expect(canvas.getByText(/france fr/)).toBeInTheDocument();
    await userEvent.click(canvas.getByRole("button", { name: "Continue to project" }));
    await userEvent.click(canvas.getByRole("button", { name: "Add selected markets" }));
    await expect(canvas.queryByRole("dialog")).not.toBeInTheDocument();
  },
};

export const MarketResearchLoading: Story = {
  parameters: {
    msw: {
      handlers: [
        ...handlers.slice(0, 2),
        http.post(
          "*/api/orgs/:organizationSlug/linked-domains/:linkedDomainId/market-recommendations",
          async () => {
            await delay("infinite");
            return HttpResponse.json({});
          },
        ),
        handlers[3],
      ],
    },
  },
  play: async ({ canvas }) => {
    await userEvent.type(canvas.getByRole("textbox", { name: "Domain" }), "acme.com");
    await userEvent.click(canvas.getByRole("button", { name: "Continue" }));
    await userEvent.click(canvas.getByRole("button", { name: "I’ve added it — Verify" }));
    await expect(await canvas.findByRole("status")).toHaveTextContent(
      "Finding recommended markets…",
    );
  },
};

export const MarketResearchFailed: Story = {
  parameters: {
    msw: {
      handlers: [
        ...handlers.slice(0, 2),
        http.post(
          "*/api/orgs/:organizationSlug/linked-domains/:linkedDomainId/market-recommendations",
          () =>
            HttpResponse.json(
              { message: "Market research is temporarily unavailable." },
              { status: 503 },
            ),
        ),
        handlers[3],
      ],
    },
  },
  play: async ({ canvas }) => {
    await userEvent.type(canvas.getByRole("textbox", { name: "Domain" }), "acme.com");
    await userEvent.click(canvas.getByRole("button", { name: "Continue" }));
    await userEvent.click(canvas.getByRole("button", { name: "I’ve added it — Verify" }));
    await expect(
      await canvas.findByText("Market research is temporarily unavailable."),
    ).toBeInTheDocument();
  },
};

export const DuplicateDomain: Story = {
  args: { existingDomains: [{ ...domain, domainKey: "acme.com" } as never] },
  play: async ({ canvas }) => {
    await userEvent.type(canvas.getByRole("textbox", { name: "Domain" }), "acme.com");
    await userEvent.click(canvas.getByRole("button", { name: "Continue" }));
    await expect(
      canvas.getByText("This domain is already linked. Edit its research markets instead."),
    ).toBeInTheDocument();
  },
};

export const StartClaimError: Story = {
  parameters: {
    msw: {
      handlers: [
        http.post("*/api/orgs/:organizationSlug/linked-domains", () =>
          HttpResponse.json({ error: "domain_already_claimed" }, { status: 409 }),
        ),
      ],
    },
  },
  play: async ({ canvas }) => {
    await userEvent.type(canvas.getByRole("textbox", { name: "Domain" }), "acme.com");
    await userEvent.click(canvas.getByRole("button", { name: "Continue" }));
    await expect(canvas.getByText("domain_already_claimed")).toBeInTheDocument();
  },
};
