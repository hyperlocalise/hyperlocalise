/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in this application's LICENSE file.
 *
 * Change Date: Four years after publication of the applicable version.
 */
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect } from "storybook/test";

import type { GlossaryConceptRecord, GlossaryRecord } from "@/api/routes/glossary/glossary.schema";

import { createGlossaryDetailMswHandlers } from "./glossary-detail-page-content-msw-handlers";
import { ProviderGlossaryDetail } from "./provider-glossary-detail";

const glossaryId = "provider-glossary-1";
const fixedNow = "2026-08-19T12:00:00.000Z";

const providerGlossary: GlossaryRecord = {
  id: glossaryId,
  organizationId: "org-1",
  createdByUserId: null,
  name: "Crowdin product terminology",
  description: "Terminology synchronized from the connected provider.",
  sourceLocale: "en-US",
  targetLocale: null,
  status: "active",
  source: "external_tms",
  controlLevel: "org",
  teamId: null,
  externalProviderKind: "crowdin",
  externalProjectId: "crowdin-project-9",
  externalResourceType: "glossary",
  externalGlossaryId: "crowdin-glossary-42",
  localeCoverage: ["en-US", "vi-VN"],
  languages: [
    { locale: "en-US", name: "American English", isSource: true },
    { locale: "vi-VN", name: "Vietnamese (Vietnam)", isSource: false },
  ],
  termCount: 2,
  syncState: "synced",
  termCapabilities: {},
  externalUrl: "https://crowdin.com/project/example",
  lastSyncedAt: fixedNow,
  lastSyncErrorAt: null,
  lastSyncErrorMessage: null,
  createdAt: fixedNow,
  updatedAt: fixedNow,
};

const providerConcept: GlossaryConceptRecord = {
  id: "provider-concept-1",
  glossaryId,
  primaryTerm: "Checkout",
  subject: "Commerce",
  definition: "The final step of completing a purchase.",
  translatable: true,
  note: "",
  url: null,
  createdAt: fixedNow,
  updatedAt: fixedNow,
  terms: [
    {
      id: "provider-term-en-1",
      glossaryId,
      conceptId: "provider-concept-1",
      locale: "en-US",
      term: "Checkout",
      isPrimary: true,
      description: "",
      note: "",
      partOfSpeech: "Noun",
      gender: null,
      termType: null,
      url: null,
      lemma: null,
      status: "preferred",
      caseSensitive: false,
      forbidden: false,
      provenance: "sync",
      externalKey: "provider-term-en-1",
      externalUserId: null,
      externalCreatedAt: fixedNow,
      externalUpdatedAt: fixedNow,
      reviewStatus: "draft",
      createdAt: fixedNow,
      updatedAt: fixedNow,
    },
  ],
};

const meta = {
  title: "App/Glossaries/Provider detail",
  component: ProviderGlossaryDetail,
  parameters: { layout: "fullscreen" },
  args: {
    organizationSlug: "acme",
    glossaryId,
    canManageGlossaries: false,
  },
} satisfies Meta<typeof ProviderGlossaryDetail>;

export default meta;
type Story = StoryObj<typeof meta>;

export const CrowdinReadOnly: Story = {
  parameters: {
    msw: {
      handlers: createGlossaryDetailMswHandlers({
        glossary: providerGlossary,
        concepts: [providerConcept],
        canContribute: false,
      }),
    },
    nextjs: {
      appDirectory: true,
      navigation: { pathname: `/org/acme/glossaries/${glossaryId}` },
    },
  },
  play: async ({ canvas }) => {
    await expect(
      await canvas.findByRole("heading", { name: "Crowdin product terminology" }),
    ).toBeInTheDocument();
    await expect(canvas.getByText("Provider")).toBeInTheDocument();
    await expect(canvas.getByRole("link", { name: "Checkout" })).toHaveAttribute(
      "href",
      `/org/acme/glossaries/${glossaryId}/concepts/${providerConcept.id}`,
    );
    await expect(canvas.getByText("Commerce")).toBeInTheDocument();
    await expect(canvas.queryByRole("button", { name: "Add concept" })).not.toBeInTheDocument();
    await expect(canvas.queryByRole("button", { name: "Delete glossary" })).not.toBeInTheDocument();
    await expect(
      canvas.queryByRole("textbox", { name: "Edit glossary name" }),
    ).not.toBeInTheDocument();
  },
};
