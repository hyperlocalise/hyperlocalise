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

import type { GlossaryConceptRecord, GlossaryRecord } from "@/api/routes/glossary/glossary.schema";

import { createGlossaryDetailMswHandlers } from "./glossary-detail-page-content-msw-handlers";
import { GlossaryDetailPageContent } from "./glossary-detail-page-content";

const fixedNow = "2026-08-19T12:00:00.000Z";
const glossaryId = "glossary-1";
const conceptId = "concept-1";

const glossaryFixture: GlossaryRecord = {
  id: glossaryId,
  organizationId: "org-1",
  createdByUserId: "user-1",
  name: "Product terminology",
  description: "Shared terminology for product and support content.",
  sourceLocale: "en-US",
  targetLocale: null,
  status: "active",
  source: "native",
  externalProviderKind: null,
  externalProjectId: null,
  externalResourceType: null,
  externalGlossaryId: null,
  localeCoverage: ["en-US", "vi-VN"],
  languages: [
    { locale: "en-US", name: "American English", isSource: true },
    { locale: "vi-VN", name: "Vietnamese (Vietnam)", isSource: false },
  ],
  termCount: 2,
  syncState: null,
  termCapabilities: { preferredTerms: true, forbiddenTerms: true },
  externalUrl: null,
  lastSyncedAt: null,
  lastSyncErrorAt: null,
  lastSyncErrorMessage: null,
  createdAt: fixedNow,
  updatedAt: fixedNow,
};

const conceptFixture: GlossaryConceptRecord = {
  id: conceptId,
  glossaryId,
  primaryTerm: "Agency",
  subject: "Accounts",
  definition: "An organization or person authorized to act on behalf of another.",
  translatable: true,
  note: "Use for partner and reseller terminology.",
  url: "https://example.com/terminology/agency",
  createdAt: fixedNow,
  updatedAt: fixedNow,
  terms: [
    {
      id: "term-en-1",
      glossaryId,
      conceptId,
      locale: "en-US",
      term: "Agency",
      isPrimary: true,
      description: "",
      partOfSpeech: "Noun",
      gender: null,
      termType: "technical",
      status: "preferred",
      caseSensitive: false,
      forbidden: false,
      provenance: "native",
      externalKey: null,
      reviewStatus: "approved",
      createdAt: fixedNow,
      updatedAt: fixedNow,
    },
    {
      id: "term-vi-1",
      glossaryId,
      conceptId,
      locale: "vi-VN",
      term: "Đại lý",
      isPrimary: false,
      description: "",
      partOfSpeech: "Noun",
      gender: null,
      termType: "technical",
      status: "draft",
      caseSensitive: false,
      forbidden: false,
      provenance: "native",
      externalKey: null,
      reviewStatus: "unreviewed",
      createdAt: fixedNow,
      updatedAt: fixedNow,
    },
  ],
};

const conceptsFixture = [conceptFixture];

const meta = {
  title: "App/Glossaries/Detail",
  component: GlossaryDetailPageContent,
  parameters: {
    layout: "fullscreen",
  },
  args: {
    organizationSlug: "acme",
    glossaryId,
    canManageGlossaries: true,
  },
} satisfies Meta<typeof GlossaryDetailPageContent>;

export default meta;
type Story = StoryObj<typeof meta>;

const detailHandlers = createGlossaryDetailMswHandlers({
  glossary: glossaryFixture,
  concepts: conceptsFixture,
});

export const ConceptList: Story = {
  parameters: {
    msw: { handlers: detailHandlers },
    nextjs: {
      navigation: {
        pathname: `/org/acme/glossaries/${glossaryId}`,
      },
    },
  },
  play: async ({ canvas }) => {
    await expect(
      await canvas.findByRole("heading", { name: "Product terminology" }),
    ).toBeInTheDocument();
    await expect(await canvas.findByText("Agency")).toBeInTheDocument();
    await expect(canvas.getByRole("button", { name: "Add concept" })).toBeInTheDocument();
  },
};

export const ConceptDetail: Story = {
  args: {
    conceptId,
  },
  parameters: {
    msw: { handlers: detailHandlers },
    nextjs: {
      navigation: {
        pathname: `/org/acme/glossaries/${glossaryId}/concepts/${conceptId}`,
      },
    },
  },
  play: async ({ canvas, canvasElement }) => {
    await expect(canvas.getAllByDisplayValue("Agency").length).toBeGreaterThan(1);
    await expect(await canvas.findByDisplayValue("Đại lý")).toBeInTheDocument();
    await expect(canvas.getByText("vi-VN")).toBeInTheDocument();
    await expect(canvas.getByText("SOURCE")).toBeInTheDocument();
    await expect(canvasElement.querySelector('[class*="overflow-y-auto"]')).toBeTruthy();
    await expect(canvas.getAllByText("Technical").length).toBeGreaterThan(0);
    await expect(canvas.getByText("Draft")).toBeInTheDocument();
    const addTermButtons = canvas.getAllByRole("button", { name: "Add term" });
    await expect(addTermButtons.length).toBeGreaterThan(0);
    await userEvent.click(addTermButtons[0]!);
    const localeDialog = canvas.getByRole("dialog", { name: "Choose a language" });
    await expect(localeDialog).toBeInTheDocument();
    await expect(localeDialog.querySelector('[class*="max-h-"]')).toBeTruthy();
    await expect(canvas.getByRole("button", { name: /French/ })).toBeInTheDocument();
    await userEvent.click(canvas.getByRole("button", { name: /French/ }));
    await expect(canvas.getByRole("button", { name: "Save" })).toBeDisabled();

    const termInput = canvas.getByDisplayValue("Đại lý");
    const termRow = termInput.closest("tr");
    await expect(termRow?.querySelector(".bg-emerald-500")).toBeNull();
    await userEvent.type(termInput, " updated");
    await expect(canvas.getByRole("button", { name: "Save" })).toBeEnabled();
    await waitFor(() => {
      void expect(termRow?.querySelector(".bg-emerald-500")).toBeTruthy();
    });
  },
};

export const LoadingConceptList: Story = {
  parameters: {
    msw: {
      handlers: createGlossaryDetailMswHandlers({
        glossary: glossaryFixture,
        concepts: conceptsFixture,
        conceptsLoading: true,
      }),
    },
    nextjs: {
      navigation: {
        pathname: `/org/acme/glossaries/${glossaryId}`,
      },
    },
  },
  play: async ({ canvasElement }) => {
    await waitFor(() => {
      void expect(canvasElement.querySelector('[aria-busy="true"]')).toBeTruthy();
    });
    await expect(canvasElement.querySelectorAll('[data-slot="skeleton"]').length).toBeGreaterThan(
      0,
    );
  },
};

export const LoadingConceptDetail: Story = {
  args: {
    conceptId,
  },
  parameters: {
    msw: {
      handlers: createGlossaryDetailMswHandlers({
        glossary: glossaryFixture,
        concepts: conceptsFixture,
        conceptsLoading: true,
      }),
    },
    nextjs: {
      navigation: {
        pathname: `/org/acme/glossaries/${glossaryId}/concepts/${conceptId}`,
      },
    },
  },
  play: async ({ canvasElement }) => {
    await waitFor(() => {
      void expect(canvasElement.querySelector('[aria-busy="true"]')).toBeTruthy();
    });
    await expect(canvasElement.querySelectorAll('[data-slot="skeleton"]').length).toBeGreaterThan(
      0,
    );
  },
};
